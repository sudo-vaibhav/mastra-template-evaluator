import { Agent, createTool } from "@mastra/core";
import type { Container } from "inversify";
import {
  projectSetupStepInputSchema,
  templateReviewerWorkflow,
} from "../workflows/template-reviewer-workflow/index.js";
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";
import type { LanguageModel } from "ai";
import { MODEL_SYMBOL } from "../infra/model/index.js";
import z from "zod";
import { ProjectRepository } from "../infra/repositories/project.js";

// Zod schema for list tool input parameters
const listProjectsInputSchema = z
  .object({
    id: z.string().optional().describe("Filter by project ID"),
    status: z
      .string()
      .optional()
      .describe(
        "Filter by project status (e.g., 'initialized', 'ready', 'evaluated')"
      ),
    name: z
      .string()
      .optional()
      .describe("Filter by project name (case-insensitive partial match)"),
    repoURL: z.string().optional().describe("Filter by repository URL"),
  })
  .optional();

export const templateReviewerAgent = (container: Container) => {
  const model = container.get<LanguageModel>(MODEL_SYMBOL);
  const repository = container.get(ProjectRepository);
  return new Agent({
    name: "Mastra Template Reviewer Agent",
    model: model,
    workflows: {
      templateReviewerWorkflow: templateReviewerWorkflow(container),
    },
    tools: {
      listExistingResults: createTool({
        description:
          "List existing template reviews/projects with optional filters",
        id: "listExistingResults",
        inputSchema: listProjectsInputSchema,
        execute: async (filters) => {
          console.log("Listing projects with filters:", filters);
          return (await repository.list(filters)).map((r) => r.toDTO());
        },
        outputSchema: z.array(projectSetupStepInputSchema),
      }),
    },
    instructions: `You are "CoordinatorAgent", an agent powered by **Mastra** to review and rate template submissions for the Mastra hackathon.

─────────────────────────────  GREETING  ─────────────────────────────
On first user message, greet exactly once with:  
“Hi there! 👋 I'm an agent powered by Mastra to review and rate template submissions for the Mastra hackathon. How can I help?”

───────────────────────────  CORE CAPABILITIES  ─────────────────────
1. **Run a full review**  
   • Tool: "runWorkflow" (wraps orchestratorWorkflow).  
   • Required payload: "{ repoUrl, markdownContent, videoUrls? }".  
   • **Never create a UUID yourself.** If "projectId" is absent, call the tool without it; use the "projectId" the tool returns.  
   • When the run finishes, present the final JSON report along with a concise textual summary.

2. **Query past reviews**  
   • Tool: "listExistingResults".  
   • Optional filters: "{ id?, status?, name?, repoURL? }".  
     – No filters → all projects.  
     – With filters → only projects matching the criteria.  
       - "id": exact project ID match
       - "status": exact status match (e.g., "evaluated", "ready")
       - "name": case-insensitive partial match
       - "repoURL": exact repository URL match
   • Output: array of project DTOs with full details.  
   • **Present results in multiple formats:**
     - **List format**: Show projects as a bulleted list with emoji status indicators
     - **Table format**: Present data in markdown tables for easy comparison
     - Choose the most appropriate format based on the number of results and user preference
   • **Visualise project status with emojis**  
       - "evaluated" → ✅  
       - "ready" → 🚀  
       - "setting-up" → ⚙️  
       - "initialized" → 📋  
       - "archived" → 📦  
   • If no matches, say so and suggest different filter criteria.

──────────────────────────  INTERACTION GUIDELINES  ─────────────────
• Validate missing required fields before invoking "runWorkflow".  
• Confirm the repo URL and any returned "projectId" before starting a review.  
• Keep replies concise and use emojis only when they add clarity.  
• Never reveal internal implementation details or environment variables.

`,
    memory: new Memory({
      storage: new LibSQLStore({
        url: "file:../mastra.db",
      }),
    }),
  });
};
