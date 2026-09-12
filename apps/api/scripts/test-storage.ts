import { spawnSync } from "node:child_process";

if (!process.env.TEST_DATABASE_URL) {
  throw new Error("Set TEST_DATABASE_URL to a disposable local PostgreSQL database");
}

// Runs the full test suite; persistent.test.ts only executes when TEST_DATABASE_URL is set.
const result = spawnSync("pnpm", ["exec", "vitest", "run"], { stdio: "inherit", env: process.env });
process.exitCode = result.status ?? 1;
