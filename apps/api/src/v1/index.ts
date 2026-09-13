import { Elysia } from "elysia";

import { authModule } from "../modules/auth/index";
import { uploadsModule } from "../modules/uploads/index";
import { projectsModule } from "../modules/projects/index";
import { helloModule } from "../modules/hello/index";
import { itemsModule } from "../modules/items/index";
import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";
import { env } from "../env";
import { PersistentRepository } from "../dossiers/persistent";
import { FileStore } from "../dossiers/files";

const repository = env.DATABASE_URL
  ? new PersistentRepository(env.DATABASE_URL, new FileStore(env.DOCUMENT_STORAGE_DIR))
  : createDemoRepository();

export const v1 = new Elysia({ prefix: "/api/v1" })
  .use(authModule)
  .use(uploadsModule)
  .use(projectsModule)
  .use(helloModule)
  .use(itemsModule)
  .use(createAccessRoutes(repository, createDemoIdentity(env.DEMO_ACCESS_ENABLED, env.NODE_ENV)));
