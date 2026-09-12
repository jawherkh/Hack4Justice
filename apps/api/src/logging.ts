import { Elysia } from "elysia";

import { logger } from "./logger";

/** Logs one line per request with method, path, status and duration. */
export const requestLogger = new Elysia({ name: "request-logger" })
  .derive({ as: "global" }, () => ({ requestStartedAt: performance.now() }))
  .onAfterResponse({ as: "global" }, ({ request, set, requestStartedAt }) => {
    const url = new URL(request.url);
    const durationMs = Math.round((performance.now() - requestStartedAt) * 10) / 10;
    const status = typeof set.status === "number" ? set.status : 200;
    const entry = { method: request.method, path: url.pathname, status, durationMs };
    if (status >= 500) logger.error(entry, "request failed");
    else if (status >= 400) logger.warn(entry, "request rejected");
    else logger.info(entry, "request");
  });
