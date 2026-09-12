import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  server: {
    PORT: z.coerce.number().default(3001),
    WEB_ORIGIN: z.string().default("http://localhost:3000"),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    DEMO_ACCESS_ENABLED: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  },
  runtimeEnv: process.env,
  emptyStringAsUndefined: true,
});
