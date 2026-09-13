import { fileURLToPath } from "node:url";

import { createEnv } from "@t3-oss/env-core";
import { config } from "dotenv";
import { z } from "zod";

// Single .env at the repo root. Real environment variables take precedence.
config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3001),
    WEB_ORIGIN: z.string().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    DEMO_ACCESS_ENABLED: z
      .enum(["true", "false"])
      .default("false")
      .transform((value) => value === "true"),
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
    TEMPORAL_ADDRESS: z.string().default("127.0.0.1:7233"),
    TEMPORAL_NAMESPACE: z.string().default("default"),
    TEMPORAL_TASK_QUEUE: z.string().min(1).default("dossier-lifecycle"),
    S3_ENDPOINT: z.url().default("http://localhost:9000"),
    S3_REGION: z.string().default("us-east-1"),
    S3_ACCESS_KEY_ID: z.string().default("minioadmin"),
    S3_SECRET_ACCESS_KEY: z.string().default("minioadmin"),
    S3_BUCKET: z.string().default("hack4justice"),
    TIKA_URL: z.string().url().default("http://localhost:9998"),
    GRAPHITI_URL: z.string().url().default("http://localhost:8010"),
    DOCUMENT_STORAGE_DIR: z.string().default(".local-data/documents"),
    GEMINI_API_KEY: z.string().min(1).optional(),
    GOOGLE_API_KEY: z.string().min(1).optional(),
    AGENT_MODEL: z.string().min(1).default("gemini-2.5-flash"),
    GEMINI_AGENT_BASE_URL: z.url().default("https://generativelanguage.googleapis.com/v1beta/openai/"),
    SANDBOX_IMAGE: z.string().min(1).default("alpine:3.20"),
    SANDBOX_BASE_DIR: z.string().min(1).default(".local-data/agent-sandboxes"),
    TWILIO_ACCOUNT_SID: z.string().min(1).optional(),
    TWILIO_AUTH_TOKEN: z.string().min(1).optional(),
    TWILIO_WHATSAPP_FROM: z.string().min(1).optional(),
    TWILIO_SMS_FROM: z.string().min(1).optional(),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
