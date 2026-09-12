import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { auth } from "./auth";
import { env } from "./env";
import { v1 } from "./v1/index";

const PORT = env.PORT;

const app = new Elysia()
  .use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization", "Idempotency-Key", ...(env.DEMO_ACCESS_ENABLED ? ["x-demo-user"] : [])],
    }),
  )
  .use(openapi())
  // Unversioned: load balancers / uptime checks.
  .get("/health", () => ({ ok: true }))
  // Better Auth: /api/auth/*
  .mount(auth.handler)
  .use(v1)
  .listen({ port: PORT, hostname: env.DEMO_ACCESS_ENABLED ? "127.0.0.1" : "0.0.0.0", maxRequestBodySize: 21 * 1024 * 1024 });

console.log(`API listening on http://localhost:${PORT}`);
console.log(`Docs at http://localhost:${PORT}/openapi`);

export type App = typeof app;
