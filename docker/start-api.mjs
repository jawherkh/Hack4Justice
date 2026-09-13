import { spawn } from "node:child_process";
import { createRequire } from "node:module";

// This launcher lives outside a workspace package, so resolve postgres from the
// API package's dependency graph instead of relying on a root node_modules link.
const require = createRequire(new URL("../apps/api/package.json", import.meta.url));
const postgres = require("postgres");

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitForDatabase() {
  let lastError;
  for (let attempt = 1; attempt <= 60; attempt += 1) {
    const sql = postgres(process.env.DATABASE_URL, { max: 1, connect_timeout: 3, prepare: false });
    try {
      await sql`select 1`;
      await sql.end({ timeout: 2 });
      console.log("Database is ready");
      return;
    } catch (error) {
      lastError = error;
      await sql.end({ timeout: 2 }).catch(() => {});
      console.log(`Waiting for database (${attempt}/60)`);
      await sleep(2000);
    }
  }
  throw lastError ?? new Error("Database did not become ready");
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${signal ?? code}`));
    });
  });
}

await waitForDatabase();
await run("pnpm", ["--filter", "@hack4justice/db", "db:migrate"]);
await run("pnpm", ["--filter", "@hack4justice/api", "db:init"]);

const api = spawn("node", ["apps/api/dist/index.js"], { stdio: "inherit", env: process.env });
process.on("SIGTERM", () => api.kill("SIGTERM"));
process.on("SIGINT", () => api.kill("SIGINT"));
api.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
