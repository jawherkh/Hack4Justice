import { fileURLToPath } from "node:url";
import { setTimeout } from "node:timers/promises";
import { config } from "dotenv";
import { Client, Connection } from "@temporalio/client";
import { NativeConnection, Worker } from "@temporalio/worker";
import { PersistentRepository } from "../dossiers/persistent";
import { FileStore } from "../dossiers/files";
import { createAgentActivities } from "../agent/activity";
import { createGeminiAgentModel } from "../agent/model";
import { COMMAND_SIGNAL, DEFAULT_TASK_QUEUE, WORKFLOW_TYPE } from "./contracts";
import { createDocumentActivities } from "../jobs/worker-activities";
import { withDurableTurns } from "../jobs/agent-turn";
import type { AgentActivities } from "./contracts";
import { PostgresJobStore } from "../jobs/store";
import { createKnowledgeSearch } from "../knowledge/search";

// Match the API's root .env loading while allowing deployment-provided variables to win.
config({ path: fileURLToPath(new URL("../../../../.env", import.meta.url)), quiet: true });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL before starting the worker");
const address = process.env.TEMPORAL_ADDRESS || "127.0.0.1:7233";
const namespace = process.env.TEMPORAL_NAMESPACE || "default";
const taskQueue = process.env.TEMPORAL_TASK_QUEUE || DEFAULT_TASK_QUEUE;
const repository = new PersistentRepository(
  url,
  new FileStore(process.env.DOCUMENT_STORAGE_DIR || ".local-data/documents"),
);
const geminiApiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
const turnStore = new PostgresJobStore(url);
const agentActivities = geminiApiKey
  ? createAgentActivities(repository, {
      model: createGeminiAgentModel({
        apiKey: geminiApiKey,
        model: process.env.AGENT_MODEL || process.env.GEMINI_LLM_MODEL || "gemini-2.5-flash",
        baseURL:
          process.env.GEMINI_AGENT_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai/",
      }),
      sandbox: {
        image: process.env.SANDBOX_IMAGE || "alpine:3.20",
        workspaceBaseDir: process.env.SANDBOX_BASE_DIR || ".local-data/agent-sandboxes",
      },
      knowledge: createKnowledgeSearch(process.env.GRAPHITI_URL || "http://localhost:8010"),
      jobs: turnStore,
    })
  : {};
const connection = await Connection.connect({ address });
const nativeConnection = await NativeConnection.connect({ address });
const client = new Client({ connection, namespace });
const documents = createDocumentActivities(url, {
  deepSeekOcrEndpoint: process.env.DEEPSEEK_OCR_ENDPOINT || "https://api.deepseek.com/chat/completions",
  deepSeekOcrApiKey: process.env.DEEPSEEK_API_KEY,
  deepSeekOcrModel: process.env.DEEPSEEK_OCR_MODEL || "deepseek-flash",
  workspaceBaseDir: process.env.DOCUMENT_STORAGE_DIR || ".local-data/documents",
  image: process.env.SANDBOX_IMAGE || "alpine:3.20",
  // Documents are read here, from the store the API already writes them to, so their bytes
  // never travel as an activity argument.
  documents: {
    async read({ documentId }) {
      const document = await repository.document(documentId);
      if (!document) throw new Error(`document ${documentId} not found`);
      return {
        bytes: await repository.readContent(documentId),
        filename: document.filename,
        contentType: document.mimeType,
      };
    },
  },
});
const worker = await Worker.create({
  connection: nativeConnection,
  namespace,
  taskQueue,
  workflowsPath: fileURLToPath(new URL("./workflows.ts", import.meta.url)),
  activities: {
    prepare: repository.prepare.bind(repository),
    commit: repository.commit.bind(repository),
    // A turn is answered once: a retry returns what the first attempt produced rather than
    // calling the model again.
    ...(agentActivities ? withDurableTurns(agentActivities as AgentActivities, turnStore) : undefined),
    ...documents.activities,
  },
  maxConcurrentActivityTaskExecutions: 5,
});
let stopped = false;
async function relay() {
  while (!stopped) {
    try {
      for (const reference of await repository.claimCommands()) {
        if (stopped) break;
        await client.workflow.signalWithStart(WORKFLOW_TYPE, {
          workflowId: `dossier/${reference.dossierId}`,
          taskQueue,
          args: [reference.dossierId],
          signal: COMMAND_SIGNAL,
          signalArgs: [reference],
        });
      }
    } catch {
      console.error("Command delivery unavailable; persisted requests will be retried.");
    }
    await setTimeout(1000);
  }
}
const delivery = relay();
try {
  await worker.run();
} finally {
  stopped = true;
  await delivery;
  await Promise.all([
    connection.close(),
    nativeConnection.close(),
    repository.close(),
    documents.close(),
    turnStore.close(),
  ]);
}
