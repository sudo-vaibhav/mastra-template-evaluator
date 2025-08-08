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
import { ProjectRepository } from "./infra/repositories/project.js";
import { ProjectFactory } from "./domain/aggregates/project/index.js";
import { VideoService } from "./infra/services/video/index.js";
import { getModel, MODEL_SYMBOL } from "./infra/model/index.js";
import type { LanguageModel } from "ai";

await connectToDatabase();
const container = new Container();
container
  .bind(Config)
  .toDynamicValue(() => new Config())
  .inSingletonScope();
container.bind(DB_SYMBOL).toConstantValue(getDB(container));
container.bind(ProjectRepository).toSelf().inSingletonScope();
container.bind(ProjectFactory).toSelf().inSingletonScope();
container.bind(VideoService).toSelf().inSingletonScope();
container
  .bind<LanguageModel>(MODEL_SYMBOL)
  .toDynamicValue(() => {
    return getModel(container);
  })
  .inSingletonScope();
export const mastra = new Mastra({
  workflows: {
    templateReviewerWorkflow: templateReviewerWorkflow(container),
  },
  agents: {
    templateReviewerAgent: templateReviewerAgent(container),
  },
  storage: new LibSQLStore({
    url: ":memory:",
  }),
  logger: new PinoLogger({
    name: "Mastra",
    level: "info",
  }),
});
