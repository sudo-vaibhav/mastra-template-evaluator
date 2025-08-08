import { createStep, createWorkflow } from "@mastra/core";
import { Container } from "inversify";
import { ProjectRepository } from "../../infra/repositories/project.js";
import {
  ProjectFactory,
} from "../../domain/aggregates/project/index.js";
import { Config } from "../../domain/aggregates/config.js";
import z from "zod";
import { VideoService } from "../../infra/services/video/index.js";
import { claimExtractorPrompt, claimsSchema } from "./claim-extractor.js";
import { model } from "../../infra/model/index.js";
import { generateObject } from "ai";
import { planMakerOutputSchema, planMakerPrompt } from "./plan-maker.js";
import { runPlansAgainstAgent } from "./tester.js";
import { scorerOutputSchema } from "./scorer.js";
import { scorerPrompt } from "./scorer.js";

const templateReviewerWorkflowInputSchema = z.object({
  name: z.string(),
  repoURLOrShorthand: z.string(),
  description: z.string(),
  videoURL: z.string(),
  envConfig: z.record(z.string(), z.string()).optional(),
});

const projectSetupStepInputSchema = z.object({
  name: z.string(),
  id: z.string().uuid(),
  videoURL: z.string(),
  videoId: z.string(),
  description: z.string(),
  port: z.string(),
  repoURL: z.string(),
  status: z.string(),
});
const templateReviewerWorkflowOutputSchema = z.object({
  project: projectSetupStepInputSchema,
  scores: scorerOutputSchema,
});
const combinedPlanAndClaimsSchema = z.object({
  ...planMakerOutputSchema.shape,
  ...claimsSchema.shape,
});
export const templateReviewerWorkflow = (container: Container) => {
  const projectRepository = container.get(ProjectRepository);
  const projectFactory = container.get(ProjectFactory);
  const workflow = createWorkflow({
    id: "template-reviewer-workflow",
    description: `You are a coordinator that launches the full template-review workflow.
    • Validate the input fields.
    • Kick off orchestratorWorkflow with a new UUID.
    • Stream progress updates back to the user.
    • On completion, present the scoring report in both JSON and readable form.
  `,
    inputSchema: templateReviewerWorkflowInputSchema,
    outputSchema: templateReviewerWorkflowOutputSchema,
  })
    .then(
      createStep({
        id: "clone-project",
        description: "Create a new project using the provided details",
        execute: async ({ inputData }) => {
          const project = projectFactory.create({
            id: crypto.randomUUID(),
            name: inputData.name,
            repoURLOrShorthand: inputData.repoURLOrShorthand,
            videoURL: inputData.videoURL,
            description: inputData.description,
            envConfig: {
              ...container.get(Config).aiAPIKeys,
              ...inputData.envConfig,
            },
          });

          await projectRepository.save(project);
          return project.toDTO();
        },
        inputSchema: templateReviewerWorkflowInputSchema,
        outputSchema: projectSetupStepInputSchema,
      })
    )
    .parallel([
      createStep({
        // clone and npm install and env creation
        id: "setup-project-repo",
        description: "Clone the repo, do npm install and create env",
        execute: async ({ inputData }) => {
          const project = projectFactory.create(inputData);
          project.status = "setting-up";
          await projectRepository.save(project);
          await project.setup();
          project.status = "ready";
          await projectRepository.save(project);
          return project.toDTO();
        },
        inputSchema: projectSetupStepInputSchema,
        outputSchema: projectSetupStepInputSchema,
      }),
      createStep({
        id: "claims-extractor",
        description: "Extract claims from the template",
        execute: async ({ inputData }) => {
          const proj = projectFactory.create(inputData);
          const description = proj.description;
          const videoURL = proj.canonicalVideoURL;
          const transcript = await container
            .get(VideoService)
            .getTranscript(videoURL);
          const claimsPrompt = claimExtractorPrompt({
            transcript: transcript,
            documentation: description,
          });
          const response = await generateObject({
            model,
            prompt: claimsPrompt,
            schema: claimsSchema,
          });

          const plansOutput = await generateObject({
            model,
            schema: planMakerOutputSchema,
            prompt: planMakerPrompt(response.object),
          });
          return { ...response.object, ...plansOutput.object };
        },
        inputSchema: projectSetupStepInputSchema,
        outputSchema: combinedPlanAndClaimsSchema,
      }),
    ])
    .then(
      createStep({
        // inputSchema: combinedPlanAndClaimsSchema,
        outputSchema: templateReviewerWorkflowOutputSchema,
        inputSchema: z.object({
          "setup-project-repo": projectSetupStepInputSchema,
          "claims-extractor": combinedPlanAndClaimsSchema,
        }),
        execute: async ({
          inputData,
        }): Promise<z.infer<typeof templateReviewerWorkflowOutputSchema>> => {
          // Build scorer prompt from prior steps
          const project = inputData["setup-project-repo"];
          const claimsAndPlans = inputData["claims-extractor"];

          // Execute plans against agent (max 5 iterations per plan)
          const tests = await runPlansAgainstAgent({
            port: project.port,
            mainAgent: claimsAndPlans.mainAgent ?? null,
            plans: claimsAndPlans.plans ?? [],
          });

          // Get project stats by scanning the repo
          const projectEntity = projectFactory.create(project);
          const projectStats = await projectEntity.getStats();

          const prompt = scorerPrompt({
            project: {
              name: project.name,
              description: project.description,
              repoURL: project.repoURL,
              videoURL: project.videoURL,
            },
            projectStats,
            claims: {
              mainAgent: claimsAndPlans.mainAgent ?? null,
              claims: claimsAndPlans.claims ?? [],
            },
            plans: { plans: claimsAndPlans.plans },
          });

          let scores = (
            await generateObject({
              model,
              prompt,
              schema: scorerOutputSchema,
            })
          ).object;

          // Overwrite tests in scores with the actual execution results from tester
          scores = { ...scores, tests };

          return {
            project: inputData["setup-project-repo"],
            scores,
          };
        },
        id: "executor-and-scorer",
        description: `This step will execute the plans and score the results.`,
      })
    )
    .commit();

  return workflow;
};
