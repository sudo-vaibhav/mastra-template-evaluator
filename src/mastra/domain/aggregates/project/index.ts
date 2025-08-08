import { promises } from "fs";
import { Id } from "../../../shared/value-objects/index.js";
import { randomUUID } from "crypto";
import path from "path";
import { tmpdir } from "os";
import degit from "degit";
import { inject, injectable } from "inversify";
import { Config } from "../config.js";
import { spawn, spawnSync, type ChildProcess } from "child_process";
import { readdirSync, readFileSync, statSync } from "fs";
import { globby } from "globby";
import { z } from "zod";
// Note: All AI chat/eval calls are intentionally kept out of the Project entity.
import http from "http";
import https from "https";
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

// Strongly-typed shape for persisted scores (matches scorerOutputSchema)
type TestResult = Array<{
  id: string;
  passed: boolean;
  explanation: string;
}>;

export type ProjectScores = {
  descriptionQuality: { score: number; explanation: string };
  tests: TestResult;
  appeal: { score: number; explanation: string };
  creativity: { score: number; explanation: string };
  architecture: {
    agents: { count: number };
    tools: { count: number };
    workflows: { count: number };
  };
  tags: string[];
};

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
  // Persisted project stats for later reference
  stats:
    | {
        architecture: {
          agents: { count: number };
          tools: { count: number };
          workflows: { count: number };
        };
        detectedTechnologies: Record<string, boolean>;
      }
    | undefined;
  // Persisted scoring results from evaluator
  scores: ProjectScores | undefined;
  // Runtime handle to target server process
  private _serverProc?: ChildProcess;
  private _cleanupRegistered = false;
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
      stats?: Project["stats"]; // optional persisted stats
      scores?: ProjectScores; // optional persisted scores
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
    this.stats = props.stats;
    this.scores = props.scores;
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
      stats: this.stats,
      scores: this.scores,
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

  /** Absolute path to the cloned repo */
  private get repoPath() {
    return path.join(tmpdir(), this.id.value);
  }

  /**
   * Start the target project's Mastra playground/server.
   * Heuristic: prefer `npm run dev`, then `npm start`. PORT is forced to this.port.number.
   */
  async startTargetServer(): Promise<void> {
    if (this._serverProc && !this._serverProc.killed) return; // already running
    const pkg =
      this.safeReadJSON(path.join(this.repoPath, "package.json")) || {};
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    const hasDev = typeof scripts.dev === "string";
    const hasStart = typeof scripts.start === "string";

    const cmd = this.config.NPM_PATH;
    const args = hasDev
      ? ["run", "dev"]
      : hasStart
        ? ["start"]
        : ["run", "dev"]; // default to dev

    this._serverProc = spawn(cmd, args, {
      cwd: this.repoPath,
      env: {
        ...process.env,
        PORT: this.port.number,
      },
      stdio: "inherit",
      shell: true,
    });

    this.registerExitCleanup();
    await this.waitForServerReady(60_000);
  }

  /** Poll the server until it responds or timeout */
  private async waitForServerReady(timeoutMs = 30000): Promise<void> {
    const baseUrl = `http://localhost:${this.port.number}/`;
    const start = Date.now();
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const tryPing = () =>
      new Promise<void>((resolve, reject) => {
        const lib = baseUrl.startsWith("https") ? https : http;
        const req = lib.request(baseUrl, { method: "GET" }, (res) => {
          // any response means server is up
          res.resume();
          resolve();
        });
        req.on("error", reject);
        req.end();
      });
    while (Date.now() - start < timeoutMs) {
      try {
        await tryPing();
        return;
      } catch {
        // ignore and retry
      }
      await sleep(500);
    }
    throw new Error(
      `Target server did not become ready on ${baseUrl} within ${timeoutMs}ms`
    );
  }

  /** Stop the target server if running */
  async stopTargetServer(): Promise<void> {
    if (this._serverProc && !this._serverProc.killed) {
      try {
        this._serverProc.kill("SIGTERM");
      } catch {
        // ignore
      }
    }
  }

  private registerExitCleanup() {
    if (this._cleanupRegistered) return;
    this._cleanupRegistered = true;
    const cleanup = () => {
      if (this._serverProc && !this._serverProc.killed) {
        try {
          this._serverProc.kill("SIGTERM");
        } catch {}
      }
    };
    process.on("exit", cleanup);
    process.on("SIGINT", () => {
      cleanup();
      process.exit(1);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(1);
    });
  }

  // All chat/evaluation logic now lives in the template-reviewer workflow tester.

  private safeReadJSON(file: string): any | undefined {
    try {
      const txt = readFileSync(file, "utf-8");
      return JSON.parse(txt);
    } catch {
      return undefined;
    }
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
