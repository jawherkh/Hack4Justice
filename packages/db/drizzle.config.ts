import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

// DATABASE_URL lives in the shared root .env.
config({ path: "../../.env", quiet: true });

const url = process.env["DATABASE_URL"];
if (!url) {
  throw new Error("DATABASE_URL is not set. Copy .env.example to .env at the repo root.");
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dbCredentials: { url },
  casing: "snake_case",
  strict: true,
  verbose: true,
});
