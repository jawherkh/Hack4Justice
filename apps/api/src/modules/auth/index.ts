import { Elysia } from "elysia";

import { authGuard } from "../../auth";

export const authModule = new Elysia({ prefix: "/me", tags: ["auth"] })
  .use(authGuard)
  .get("/", ({ user, session }) => ({ user, session }), { auth: true });
