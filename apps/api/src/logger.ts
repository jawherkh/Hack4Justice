import { createLogger } from "@hack4justice/logger";

import { env } from "./env";

export const logger = createLogger({
  name: "api",
  level: env.LOG_LEVEL,
  pretty: env.NODE_ENV === "development",
  base: { env: env.NODE_ENV },
});
