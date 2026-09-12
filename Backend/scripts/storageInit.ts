/**
 * MinIO bucket initialisation script
 * Creates required buckets if they do not exist.
 * Run: npm run storage:init
 */
import "dotenv/config";
import { ensureBuckets } from "../src/lib/storage";
import { logger } from "../src/lib/logger";

async function run() {
  logger.info("Initialising MinIO buckets...");
  await ensureBuckets();
  logger.info("Storage init complete ✅");
}

run().catch((err) => {
  logger.error(err, "Storage init failed");
  process.exit(1);
});
