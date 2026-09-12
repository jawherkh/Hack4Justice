import { cors } from "@elysiajs/cors";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { auth } from "./auth";
import { env } from "./env";
import { errorHandler } from "./errors";
import { logger } from "./logger";
import { requestLogger } from "./logging";
import { v1 } from "./v1/index";

const PORT = env.PORT;
// Leave room for multipart boundaries and form fields around the 25 MB file limit.
const MAX_UPLOAD_REQUEST_BYTES = 26 * 1024 * 1024;

const app = new Elysia()
  .use(errorHandler)
  .use(requestLogger)
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
  // Better Auth. Explicit route rather than `.mount(auth.handler)`, which
  // would also swallow every unmatched path and bypass the 404 handler.
  .all("/api/auth/*", ({ request }) => auth.handler(request), { detail: { hide: true } })
  .use(v1)
  .listen({
    port: PORT,
    hostname: env.DEMO_ACCESS_ENABLED ? "127.0.0.1" : "0.0.0.0",
    maxRequestBodySize: MAX_UPLOAD_REQUEST_BYTES,
  });

logger.info({ port: PORT, docs: `http://localhost:${PORT}/openapi` }, "API listening");

export type App = typeof app;
