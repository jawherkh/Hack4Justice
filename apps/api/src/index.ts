import { cors } from "@elysiajs/cors";
import { node } from "@elysiajs/node";
import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

import { auth } from "./auth";
import { env } from "./env";
import { errorHandler } from "./errors";
import { logger } from "./logger";
import { requestLogger } from "./logging";
import { v1 } from "./v1/index";

const PORT = env.PORT;

const app = new Elysia({ adapter: node() })
  .use(errorHandler)
  .use(requestLogger)
  .use(
    cors({
      origin: env.WEB_ORIGIN,
      credentials: true,
      allowedHeaders: ["Content-Type", "Authorization"],
    }),
  )
  .use(openapi())
  // Unversioned: load balancers / uptime checks.
  .get("/health", () => ({ ok: true }))
  // Better Auth. Explicit route rather than `.mount(auth.handler)`, which
  // would also swallow every unmatched path and bypass the 404 handler.
  // The response is relayed through `set` because the Node adapter collapses
  // multiple Set-Cookie headers when a Response object is returned directly.
  .all(
    "/api/auth/*",
    async ({ request, set }) => {
      const response = await auth.handler(request);
      set.status = response.status;
      response.headers.forEach((value, key) => {
        if (key !== "set-cookie") set.headers[key] = value;
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length > 0) set.headers["set-cookie"] = cookies;
      return response.arrayBuffer();
    },
    { detail: { hide: true } },
  )
  .use(v1)
  .listen({ port: PORT, hostname: env.DEMO_ACCESS_ENABLED ? "127.0.0.1" : "0.0.0.0", maxRequestBodySize: 21 * 1024 * 1024 });

logger.info({ port: PORT, docs: `http://localhost:${PORT}/openapi` }, "API listening");

export type App = typeof app;
