/**
 * Worker: dossier-orchestration
 * Handles dossier assembly and orchestration workflows.
 */
import "dotenv/config";
import { Worker, NativeConnection } from "@temporalio/worker";
import { QUEUES } from "../lib/temporal";
import { logger } from "../lib/logger";
import * as activities from "./activities/dossierActivities";

async function run() {
  const connection = await NativeConnection.connect({
    address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
  });

  const worker = await Worker.create({
    connection,
    namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    taskQueue: QUEUES.DOSSIER_ORCHESTRATION,
    workflowsPath: require.resolve("./workflows/dossierWorkflows"),
    activities,
  });

  logger.info(
    { queue: QUEUES.DOSSIER_ORCHESTRATION },
    "Dossier orchestration worker started"
  );
  await worker.run();
}

run().catch((err) => {
  logger.error(err, "Dossier orchestration worker fatal error");
  process.exit(1);
});
