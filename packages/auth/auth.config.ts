// Used only by the Better Auth CLI (`pnpm auth:generate`) to derive the
// Drizzle schema. postgres.js connects lazily, so no database is contacted.
import { createDb } from "@hack4justice/db";

import { createAuth } from "./src/server";

export const auth = createAuth({
  db: createDb("postgres://cli:cli@localhost:5432/cli"),
  baseURL: "http://localhost:3001",
  secret: "cli-only-placeholder-secret-not-used-at-runtime",
});
