import "dotenv/config";
import express from "express";
import { logger } from "../lib/logger";
import { healthRouter } from "./routes/health";

const app = express();
const PORT = process.env.API_PORT ?? 3000;

app.use(express.json());

// ── Routes ────────────────────────────────────
app.use("/health", healthRouter);

// ── Start ─────────────────────────────────────
app.listen(PORT, () => {
  logger.info({ port: PORT }, "API server started");
});

export default app;
