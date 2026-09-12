import { Router, type Request, type Response } from "express";
import { checkPostgres } from "../../lib/db";
import { checkMinio } from "../../lib/storage";
import { checkTemporal } from "../../lib/temporal";

export const healthRouter = Router();

/**
 * GET /health
 * Lightweight liveness probe — always returns 200 if the process is up.
 */
healthRouter.get("/", (_req: Request, res: Response) => {
  res.json({ status: "ok", ts: new Date().toISOString() });
});

/**
 * GET /health/ready
 * Readiness probe — checks downstream dependencies owned by this service.
 * Neo4j is owned by the Python agent; check it via /health/ready on the
 * agent service instead of directly here.
 * Returns 200 when all are healthy, 503 otherwise.
 */
healthRouter.get("/ready", async (_req: Request, res: Response) => {
  const results = await Promise.allSettled([
    checkPostgres(),
    checkMinio(),
    checkTemporal(),
  ]);

  const report = {
    postgres: results[0].status === "fulfilled" ? "ok" : "error",
    minio:    results[1].status === "fulfilled" ? "ok" : "error",
    temporal: results[2].status === "fulfilled" ? "ok" : "error",
  };

  const allHealthy = Object.values(report).every((v) => v === "ok");

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? "ready" : "degraded",
    checks: report,
    ts: new Date().toISOString(),
  });
});
