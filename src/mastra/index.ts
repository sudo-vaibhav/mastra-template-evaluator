import "reflect-metadata";

import { Mastra } from "@mastra/core/mastra";
import { PinoLogger } from "@mastra/loggers";
import { LibSQLStore } from "@mastra/libsql";
import {
  connectToDatabase,
  DB_SYMBOL,
  getDB,
} from "./infra/database/mongodb.js";
import { Container } from "inversify";
import { Config } from "./domain/aggregates/config.js";
import { templateReviewerWorkflow } from "./workflows/template-reviewer-workflow/index.js";
import { templateReviewerAgent } from "./agents/template-reviewer-agent.js";
import { claimsExtractorAgent } from "./agents/claims-extractor-agent.js";
import { ProjectRepository } from "./infra/repositories/project.js";
import { ProjectFactory } from "./domain/aggregates/project/index.js";
import { VideoService } from "./infra/services/video/index.js";

await connectToDatabase();
// make DI container
const container = new Container();
container
  .bind(Config)
  .toDynamicValue(() => new Config())
  .inSingletonScope();
container.bind(DB_SYMBOL).toConstantValue(getDB(container));
container.bind(ProjectRepository).toSelf().inSingletonScope();
container.bind(ProjectFactory).toSelf().inSingletonScope();
container.bind(VideoService).toSelf().inSingletonScope();
export const mastra = new Mastra({
  workflows: {
    templateReviewerWorkflow: templateReviewerWorkflow(container),
  },
  agents: {
    templateReviewerAgent: templateReviewerAgent(container),
    claimsExtractorAgent: claimsExtractorAgent(container),
  },
  storage: new LibSQLStore({
    // stores telemetry, evals, ... into memory storage, if it needs to persist, change to file:../mastra.db
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
