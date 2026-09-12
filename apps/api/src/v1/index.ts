import { Elysia } from "elysia";

import { helloModule } from "../modules/hello/index";
import { itemsModule } from "../modules/items/index";
import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";
import { env } from "../env";

export const v1 = new Elysia({ prefix: "/api/v1" })
  .use(helloModule)
  .use(itemsModule)
  .use(createAccessRoutes(createDemoRepository(), createDemoIdentity(env.DEMO_ACCESS_ENABLED, env.NODE_ENV)));
