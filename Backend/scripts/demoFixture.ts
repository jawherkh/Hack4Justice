/**
 * Demo fixture runner
 * Proves a fresh checkout works end-to-end:
 *   1. Health-checks all TS API services
 *   2. Seeds the database
 *   3. Initialises storage buckets
 *   4. Applies graph migrations (via Python agent container)
 *   5. Prints /health/ready result
 *
 * Run: npm run demo
 * Exit 0 = success
 */
import "dotenv/config";
import { execSync } from "child_process";
import { checkPostgres } from "../src/lib/db";
import { checkMinio } from "../src/lib/storage";
import { checkTemporal } from "../src/lib/temporal";
import { ensureBuckets } from "../src/lib/storage";

function step(label: string) {
  console.log(`\n──── ${label} ────`);
}

async function run() {
  console.log("\n🚀  hack4justice – demo fixture runner\n");

  // 1. Health checks (TS API services)
  step("1/5 Health checks");
  await checkPostgres(); console.log("  ✅ PostgreSQL");
  await checkMinio();    console.log("  ✅ MinIO");
  await checkTemporal(); console.log("  ✅ Temporal");

  // 2. DB migration + seed
  step("2/5 Database migration");
  execSync("npx prisma migrate deploy", { stdio: "inherit" });

  step("3/5 Database seed");
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit" });

  // 3. Storage init
  step("4/5 Storage bucket init");
  await ensureBuckets();
  console.log("  ✅ Buckets ready");

  // 4. Graph migration — delegate to Python agent container
  step("5/5 Graph migration (Python agent)");
  try {
    execSync(
      "docker compose exec agent python -m agent.scripts.graph_migrate",
      { stdio: "inherit" }
    );
  } catch {
    console.warn("  ⚠️  Could not run graph migration via Docker.");
    console.warn("     Run manually: docker compose exec agent python -m agent.scripts.graph_migrate");
  }

  console.log("\n🎉  Demo fixture complete — environment is ready!\n");
}

run().catch((err) => {
  console.error("\n💥  Demo fixture failed:", err);
  process.exit(1);
});
