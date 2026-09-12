import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3001),
    WEB_ORIGIN: z.string().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEMO_ACCESS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
    DATABASE_URL: z.string().url(),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.string().url().default("http://localhost:3001"),
    DOCUMENT_STORAGE_DIR: z.string().default(".local-data/documents"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
