import { Elysia } from "elysia";

import { helloModule } from "../modules/hello/index";
import { itemsModule } from "../modules/items/index";

export const v1 = new Elysia({ prefix: "/api/v1" })
  .use(helloModule)
  .use(itemsModule);
