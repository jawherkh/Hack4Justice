import { Connection, Client } from "@temporalio/client";
import { logger } from "./logger";

let _client: Client | undefined;

export async function getTemporalClient(): Promise<Client> {
  if (!_client) {
    const connection = await Connection.connect({
      address: process.env.TEMPORAL_ADDRESS ?? "localhost:7233",
    });
    _client = new Client({
      connection,
      namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
    });
  }
  return _client;
}

/**
 * Lightweight connectivity check — used by the readiness probe.
 */
export async function checkTemporal(): Promise<void> {
  const client = await getTemporalClient();
  await client.connection.workflowService.getSystemInfo({});
  logger.debug("temporal: ok");
}

// ── Queue name constants ──────────────────────────────────────
export const QUEUES = {
  GRAPH_INGESTION:
    process.env.QUEUE_GRAPH_INGESTION ?? "graph-ingestion",
  DOSSIER_ORCHESTRATION:
    process.env.QUEUE_DOSSIER_ORCHESTRATION ?? "dossier-orchestration",
  SANDBOX_EXECUTION:
    process.env.QUEUE_SANDBOX_EXECUTION ?? "sandbox-execution",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];
