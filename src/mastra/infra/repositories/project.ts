import { inject, injectable } from "inversify";
import { DB_SYMBOL, type DB } from "../database/mongodb.js";
import { Project, ProjectFactory } from "../../domain/aggregates/project/index.js";

@injectable()
export class ProjectRepository {
  @inject(DB_SYMBOL)
  db!: DB;
  @inject(ProjectFactory)
  projectFactory!: ProjectFactory;
  get collection() {
    return this.db.collection("projects");
  }

  async list(): Promise<Project[]> {
    const projects = await this.collection.find().toArray();
    console.log("Projects found:", projects);
    return projects.map(
      (proj) =>
        this.projectFactory.create(
         proj as unknown as ConstructorParameters<typeof Project>[0]
        )
    );
  }

  async save(project: Project) {
    this.collection.updateOne(
      { id: project.id.value },
      { $set: project.toDTO() },
      { upsert: true }
    );
  }
}
