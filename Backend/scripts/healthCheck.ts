/**
 * Health check CLI script
 * Validates all downstream service connections owned by the TS API.
 * Neo4j is checked by the Python agent's own health check.
 *
 * Run: npm run health
 * Exit 0 = all healthy, Exit 1 = one or more failed
 */
import "dotenv/config";
import { checkPostgres } from "../src/lib/db";
import { checkMinio } from "../src/lib/storage";
import { checkTemporal } from "../src/lib/temporal";

type CheckResult = { name: string; ok: boolean; error?: string };

async function check(name: string, fn: () => Promise<void>): Promise<CheckResult> {
  try {
    await fn();
    return { name, ok: true };
  } catch (err) {
    return { name, ok: false, error: String(err) };
  }
}

async function run() {
  console.log("\n🔍  hack4justice – API health check\n");

  const results = await Promise.all([
    check("PostgreSQL", checkPostgres),
    check("MinIO",      checkMinio),
    check("Temporal",   checkTemporal),
  ]);

  let allOk = true;
  for (const r of results) {
    const icon = r.ok ? "✅" : "❌";
    console.log(`  ${icon}  ${r.name.padEnd(12)} ${r.ok ? "OK" : (r.error ?? "FAILED")}`);
    if (!r.ok) allOk = false;
  }

  console.log();
  if (allOk) {
    console.log("All API services healthy ✅\n");
    process.exit(0);
  } else {
    console.error("One or more services are unavailable ❌\n");
    process.exit(1);
  }
}

run();
