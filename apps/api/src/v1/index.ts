import { Elysia } from "elysia";

import { authModule } from "../modules/auth/index";
import { uploadsModule } from "../modules/uploads/index";
import { helloModule } from "../modules/hello/index";
import { itemsModule } from "../modules/items/index";
import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";
import { createAgentRoutes } from "../agent/routes";
import { createGeminiAgentModel } from "../agent/model";
import { PrincipalAgentService } from "../agent/service";
import { env } from "../env";
import { PersistentRepository } from "../dossiers/persistent";
import { FileStore } from "../dossiers/files";
import { PostgresJobStore } from "../jobs/store";
import { createKnowledgeSearch } from "../knowledge/search";

const repository = env.DATABASE_URL
  ? new PersistentRepository(env.DATABASE_URL, new FileStore(env.DOCUMENT_STORAGE_DIR))
  : createDemoRepository();
const geminiApiKey = env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY;
const agentService = geminiApiKey
  ? new PrincipalAgentService({
      repository,
      model: createGeminiAgentModel({
        apiKey: geminiApiKey,
        model: env.AGENT_MODEL,
        baseURL: env.GEMINI_AGENT_BASE_URL,
      }),
      sandbox: { image: env.SANDBOX_IMAGE, workspaceBaseDir: env.SANDBOX_BASE_DIR },
      knowledge: createKnowledgeSearch(env.GRAPHITI_URL),
      jobs: new PostgresJobStore(env.DATABASE_URL),
    })
  : undefined;

export const v1 = new Elysia({ prefix: "/api/v1" })
  .use(authModule)
  .use(uploadsModule)
  .use(helloModule)
  .use(itemsModule)
  .use(createAccessRoutes(repository, createDemoIdentity(env.DEMO_ACCESS_ENABLED, env.NODE_ENV)))
  .use(createAgentRoutes(repository, createDemoIdentity(env.DEMO_ACCESS_ENABLED, env.NODE_ENV), agentService, Boolean(geminiApiKey)));
