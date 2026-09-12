import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { PersistentRepository } from "../dossiers/persistent";
import { FileStore } from "../dossiers/files";
import { COMMAND_SIGNAL, DEFAULT_TASK_QUEUE, WORKFLOW_TYPE } from "./contracts";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL before starting the worker");
const address = process.env.TEMPORAL_ADDRESS || "127.0.0.1:7233";
const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE || DEFAULT_TASK_QUEUE;
const repository = new PersistentRepository(url, new FileStore(process.env.DOCUMENT_STORAGE_DIR || ".local-data/documents"));
const connection = await Connection.connect({ address });
const nativeConnection = await NativeConnection.connect({ address });
const client = new Client({ connection, namespace });
const worker = await Worker.create({ connection: nativeConnection, namespace, taskQueue,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  activities: { prepare: repository.prepare.bind(repository), commit: repository.commit.bind(repository) },
  maxConcurrentActivityTaskExecutions: 5,
});
let stopped = false;
async function relay() {
  while (!stopped) {
    try {
      for (const reference of await repository.claimCommands()) {
        if (stopped) break;
        await client.workflow.signalWithStart(WORKFLOW_TYPE, { workflowId: `dossier/${reference.dossierId}`,
          taskQueue, args: [reference.dossierId], signal: COMMAND_SIGNAL, signalArgs: [reference] });
      }
    } catch { console.error("Command delivery unavailable; persisted requests will be retried."); }
    await setTimeout(1000);
  }
}
const delivery = relay();
try { await worker.run(); }
finally {
  stopped = true;
  await delivery;
  await Promise.all([connection.close(), nativeConnection.close(), repository.close()]);
}
