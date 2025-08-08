import { promises } from "fs";
import { Id } from "../../../shared/value-objects/index.js";
import { randomUUID } from "crypto";
import path from "path";
import { tmpdir } from "os";
import degit from "degit";
import { inject, injectable } from "inversify";
import { Config } from "../config.js";
import { exec, spawnSync } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { globby } from "globby";
/**
 * Represents a port in the system.
 * Constructor should pick a random port between 3000 and 9000 if not provided.
 */
class Port {
  number: string;

  constructor(port?: string) {
    this.number =
      port || String(Math.floor(Math.random() * (9000 - 3000 + 1)) + 3000);
  }
}

const AllowedProjectStatuses = [
  "initialized",
  "setting-up",
  "ready",
  "evaluating",
  "evaluated",
  "archived",
] as const;
type ProjectStatus = (typeof AllowedProjectStatuses)[number];

export class Project {
  name: string;
  id: Id;
  port: Port;
  repoURL: string;
  videoURL: string;
  description: string;
  status: ProjectStatus;
  agentToEvaluate: string | null = null;
  envConfig: Record<string, string>;
  readonly config: Config;
  constructor(
    props: {
      name: string;
      videoURL: string;
      description: string;
      status?: string;
      id?: ConstructorParameters<typeof Id>[0] | undefined;
      port?: string;
      envConfig?: Record<string, string>;
      agentToEvaluate?: string | null;
    } & (
      | {
          repoURLOrShorthand: string;
        }
      | {
          repoURL: string;
        }
    ),
    config: Config
  ) {
    this.name = props.name;
    this.id = new Id(props.id || randomUUID());
    this.port = new Port(props.port);
    const status = props.status || "initialized";
    const castedStatus = status as ProjectStatus;
    this.repoURL =
      "repoURL" in props
        ? props.repoURL
        : props.repoURLOrShorthand.startsWith("http")
          ? props.repoURLOrShorthand
          : `https://github.com/${props}`;
    if (!AllowedProjectStatuses.includes(castedStatus)) {
      throw new Error(`Invalid project status: ${castedStatus}`);
    }
    this.agentToEvaluate = props.agentToEvaluate || null;
    this.status = castedStatus;
    this.videoURL = props.videoURL;
    this.description = props.description || "No description provided";
    this.envConfig = {};
    this.config = config;
  }

  /**
   * Extracts YouTube video ID from various YouTube URL formats
   * Supports:
   * - https://www.youtube.com/watch?v=VIDEO_ID
   * - https://youtu.be/VIDEO_ID
   * - https://youtube.com/watch?v=VIDEO_ID
   * - https://m.youtube.com/watch?v=VIDEO_ID
   * - https://www.youtube.com/embed/VIDEO_ID
   * - https://www.youtube.com/v/VIDEO_ID
   */
  getVideoId() {
    const url = this.videoURL;

    // Match various YouTube URL patterns
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
      /youtube\.com\/watch\?.*v=([^&\n?#]+)/,
    ];

    for (const pattern of patterns) {
      const match = url.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    throw new Error("Unable to extract video ID");
  }

  toDTO() {
    return {
      name: this.name,
      id: this.id.value,
      videoURL: this.videoURL,
      videoId: this.getVideoId(),
      description: this.description,
      port: this.port.number,
      repoURL: this.repoURL,
      status: this.status,
    };
  }

  async setup() {
    const emitter = degit(this.repoURL, {
      cache: true,
      force: true,
      verbose: true,
    });
    const clonePath = path.join(tmpdir(), this.id.value);
    await emitter.clone(clonePath);
    await Promise.all([
      this.emitEnvInFolder(clonePath),
      this.conductNpmInstall(clonePath),
    ]);
  }

  /**
   * Scans the cloned repository to infer architecture counts and sponsor-related technologies.
   * Heuristics:
   * - Architecture counts via directory names and common code patterns
   * - Technologies via package.json dependencies and simple code string matches
   */
  async getStats(): Promise<{
    architecture: {
      agents: { count: number };
      tools: { count: number };
      workflows: { count: number };
    };
    detectedTechnologies: Record<string, boolean>;
  }> {
    const root = path.join(tmpdir(), this.id.value);

    const pkg = this.safeReadJSON(path.join(root, "package.json"));
    const allDeps = {
      ...(pkg?.dependencies ?? {}),
      ...(pkg?.devDependencies ?? {}),
    } as Record<string, string>;

    // Basic tech detection from deps and code
    const hasDep = (name: string) => Boolean(allDeps[name]);

    // File discovery via globby (fallback to manual walk)
    // const srcDir = path.join(root, "src");
    let files: string[] = [];
    // try {
    const rel = await globby(["src/**/*.{ts,tsx,js,jsx}"], {
      cwd: root,
      gitignore: true,
      ignore: [
        "**/node_modules/**",
        "**/.git/**",
        "**/dist/**",
        "**/build/**",
        "**/.mastra/**",
      ],
      absolute: false,
      onlyFiles: true,
      followSymbolicLinks: false,
    });
    files = rel.map((p: string) => path.join(root, p));
    // } catch {
    //   files = this.safeWalk(srcDir);
    // }

    const readText = (fp: string) => {
      try {
        return readFileSync(fp, "utf-8");
      } catch {
        return "";
      }
    };

    // Count heuristics
    const agentsCount = files.filter(
      (f) => /[/\\]agents[/\\]/.test(f) || /new\s+Agent\s*\(/.test(readText(f))
    ).length;
    const toolsCount = files.filter(
      (f) => /[/\\]tools[/\\]/.test(f) || /createTool\s*\(/.test(readText(f))
    ).length;
    const workflowsCount = files.filter(
      (f) =>
        /[/\\]workflows[/\\]/.test(f) || /createWorkflow\s*\(/.test(readText(f))
    ).length;

    // Code pattern checks for technologies beyond deps
    const anyFileIncludes = (substr: string | RegExp) =>
      files.some((f) => {
        const txt = readText(f);
        return typeof substr === "string"
          ? txt.includes(substr)
          : substr.test(txt);
      });

    const detectedTechnologies: Record<string, boolean> = {
      smithery: hasDep("@smithery/sdk"),
      workos: hasDep("@workos/node"),
      browserbase: hasDep("browserbase"),
      arcade: hasDep("@arcadeai/arcadejs") || anyFileIncludes(/arcade-ai/),
      chroma: hasDep("chromadb"),
      // Crypto/Recall heuristic: common web3 libs or crypto indicators
      recall:
        hasDep("viem") ||
        hasDep("ethers") ||
        anyFileIncludes(/web3|wallet|ethers|viem/),
      // Confident AI (Evals) heuristic: @mastra/evals or mentions of eval metrics
      confidentAi:
        hasDep("@mastra/evals") || anyFileIncludes(/\bevals?\b|Metric\s*\{/),
      // Additional high-level features
      rag: hasDep("chromadb") || anyFileIncludes(/retrieval|vector|embedding/i),
      auth: hasDep("@workos/node") || anyFileIncludes(/auth|oauth|login/i),
      webBrowsing:
        hasDep("browserbase") ||
        anyFileIncludes(/puppeteer|playwright|browserbase/i),
    };

    return {
      architecture: {
        agents: { count: agentsCount },
        tools: { count: toolsCount },
        workflows: { count: workflowsCount },
      },
      detectedTechnologies,
    };
  }

  private safeReadJSON(file: string): any | undefined {
    try {
      const txt = readFileSync(file, "utf-8");
      return JSON.parse(txt);
    } catch {
      return undefined;
    }
  }

  private safeWalk(dir: string): string[] {
    const out: string[] = [];
    const stack = [dir];
    while (stack.length) {
      const d = stack.pop()!;
      let entries: string[] = [];
      try {
        entries = readdirSync(d).map((n) => path.join(d, n));
      } catch {
        continue;
      }
      for (const pth of entries) {
        const base = path.basename(pth);
        if (["node_modules", ".git", ".mastra", "dist", "build"].includes(base))
          continue;
        try {
          const st = statSync(pth);
          if (st.isDirectory()) stack.push(pth);
          else if (st.isFile()) out.push(pth);
        } catch {
          // ignore
        }
      }
    }
    return out.filter((f) => /\.(t|j)sx?$/.test(f));
  }

  private async conductNpmInstall(folder: string) {
    spawnSync(`${this.config.NPM_PATH} install`, {
      cwd: folder,
      stdio: "inherit",
    });
  }
  private async emitEnvInFolder(folder: string) {
    const envPath = path.join(folder, ".env");
    const envContent = Object.entries(this.envConfig)
      .map(([key, value]) => `${key}=${value}`)
      .join("\n");

    await promises.writeFile(envPath, envContent, {
      encoding: "utf-8",
    });
  }
  get canonicalVideoURL() {
    return `https://www.youtube.com/watch?v=${this.getVideoId()}`;
  }
}

@injectable()
export class ProjectFactory {
  @inject(Config)
  config!: Config;

  create(props: ConstructorParameters<typeof Project>[0]) {
    return new Project(props, this.config);
  }
}
