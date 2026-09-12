import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { env } from "./env";
import { v1 } from "./v1/index";

const PORT = env.PORT;

const app = new Elysia()
  .use(
    cors({
      origin: env.WEB_ORIGIN,
    }),
  )
  .use(openapi())
  // Unversioned: load balancers / uptime checks.
  .get("/health", () => ({ ok: true }))
  .use(v1)
  .listen(PORT);

console.log(`API listening on http://localhost:${PORT}`);
console.log(`Docs at http://localhost:${PORT}/openapi`);

export type App = typeof app;
