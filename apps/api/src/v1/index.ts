import { Elysia } from "elysia";

import { authModule } from "../modules/auth/index";
import { helloModule } from "../modules/hello/index";
import { itemsModule } from "../modules/items/index";
import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";
import { env } from "../env";
import { PersistentRepository } from "../dossiers/persistent";
import { FileStore } from "../dossiers/files";

import { createExtractionRoutes } from "../extraction/routes";
import { ExtractionService } from "../extraction/service";
import { ExtractionEngine } from "../extraction/engine";
import { DeepSeekProvider } from "../extraction/deepseek";
import { PopplerReader } from "../extraction/pdf";
import { ReportStore } from "../extraction/reports";

const repository = env.DATABASE_URL
  ? new PersistentRepository(env.DATABASE_URL, new FileStore(env.DOCUMENT_STORAGE_DIR))
  : createDemoRepository();
const identity = createDemoIdentity(env.DEMO_ACCESS_ENABLED, env.NODE_ENV);
const extraction = new ExtractionService(repository,
  new ExtractionEngine(new DeepSeekProvider(env.DEEPSEEK_API_KEY, env.DEEPSEEK_OCR_MODEL), new PopplerReader()),
  new ReportStore(env.EXTRACTION_STORAGE_DIR));

export const v1 = new Elysia({ prefix: "/api/v1" })
  .use(authModule)
  .use(helloModule)
  .use(itemsModule)
  .use(createAccessRoutes(repository, identity))
  .use(createExtractionRoutes(extraction, identity));
