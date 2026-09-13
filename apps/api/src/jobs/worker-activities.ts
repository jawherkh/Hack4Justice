import { Context } from "@temporalio/activity";

import { env } from "../env";
import { createTikaClient } from "../ocr/tika";
import { extractDocumentText, runSandboxCommand, type ExtractTextInput, type SandboxCommandInput } from "./activities";
import { retrieveLegalContext, runAgentTurn, type AgentRunner, type AgentTurnInput, type LegalContextInput, type LegalKnowledge } from "./agent";
import type { JobContext, JobReceipt } from "./contracts";
import { PostgresJobStore } from "./store";

/**
 * Reports progress and cancellation from the running activity.
 *
 * Temporal cancels an activity by aborting this signal, and a heartbeat is what tells the
 * service the work is still moving. Outside an activity, both fall away and the job simply
 * runs to completion, which is what the tests rely on.
 */
function activityContext(): JobContext {
  try {
    const current = Context.current();
    return {
      heartbeat: (details) => current.heartbeat(details),
      signal: current.cancellationSignal,
    };
  } catch {
    return {};
  }
}

/**
 * Trims a receipt to what a workflow history should carry.
 *
 * The stored receipt keeps the whole result so a repeated call can hand back the same
 * answer. A workflow history is different: it is replayed, retained, and readable by
 * anyone who can inspect the workflow, so it carries references and counts rather than a
 * second copy of a dossier's documents or of what the agent said about them.
 */
export function forHistory(receipt: JobReceipt): JobReceipt {
  const output = receipt.output;
  if (!output) return receipt;
  const { text, sources, reply, question, proposals, ...rest } = output as Record<string, unknown>;
  return {
    ...receipt,
    output: {
      ...rest,
      ...(typeof text === "string" ? { textCharacters: text.length } : {}),
      ...(Array.isArray(sources)
        ? { sourceRefs: (sources as { sourceRef: string }[]).map((source) => source.sourceRef) }
        : {}),
      ...(typeof reply === "string" ? { replyCharacters: reply.length } : {}),
      ...(question === undefined ? {} : { askedQuestion: typeof question === "string" }),
      // The actions and the sources they rest on, without the wording that explains them.
      ...(Array.isArray(proposals)
        ? {
            proposals: (proposals as { action: string; nodeId?: string; sourceRefs: string[] }[]).map(
              ({ action, nodeId, sourceRefs }) => ({ action, nodeId, sourceRefs }),
            ),
          }
        : {}),
    },
  };
}

export interface DocumentActivityInputs {
  extractDocumentText: Omit<ExtractTextInput, "bytes"> & { bytes: ArrayBuffer | Uint8Array };
  runSandboxCommand: SandboxCommandInput;
}

/**
 * Builds the document activities the worker registers.
 *
 * Each one records its own receipt, so a workflow that replays, or a worker that restarts,
 * reads what already happened rather than doing the work a second time.
 */
export interface AgentDependencies {
  /** Supplied once the conversational agent exists; until then its activities report it. */
  agent?: AgentRunner;
  knowledge?: LegalKnowledge;
}

export function createDocumentActivities(databaseUrl: string, dependencies: AgentDependencies = {}) {
  const store = new PostgresJobStore(databaseUrl);
  const tika = createTikaClient(env.TIKA_URL);

  const extractor = {
    async extract(input: { bytes: Uint8Array; filename: string; languages?: string; contentType?: string }) {
      const result = await tika.extract(input.bytes as Uint8Array<ArrayBuffer>, {
        contentType: input.contentType ?? "application/pdf",
        ocrLanguages: input.languages,
        // Cancelling the activity stops the extraction request rather than leaving it running.
        signal: activityContext().signal,
      });
      return { text: result.text, pageCount: result.pageCount };
    },
  };

  return {
    /** Created once so the table exists before the first job runs. */
    initialize: () => store.initialize(),
    close: () => store.close(),
    activities: {
      async extractDocumentText(input: DocumentActivityInputs["extractDocumentText"]) {
        const bytes = input.bytes instanceof Uint8Array ? input.bytes : new Uint8Array(input.bytes);
        const { receipt } = await extractDocumentText(store, extractor, { ...input, bytes }, activityContext());
        return forHistory(receipt);
      },
      async runAgentTurn(input: AgentTurnInput) {
        if (!dependencies.agent) throw new Error("agent_not_configured");
        const { receipt } = await runAgentTurn(store, dependencies.agent, input, activityContext());
        return forHistory(receipt);
      },
      async retrieveLegalContext(input: LegalContextInput) {
        if (!dependencies.knowledge) throw new Error("knowledge_not_configured");
        const { receipt } = await retrieveLegalContext(store, dependencies.knowledge, input, activityContext());
        return forHistory(receipt);
      },
      async runSandboxCommand(input: SandboxCommandInput) {
        return forHistory(await runSandboxCommand(
          store,
          {
            baseDir: env.DOCUMENT_STORAGE_DIR,
            image: process.env.SANDBOX_IMAGE ?? "alpine:3.20",
          },
          input,
          activityContext(),
        ));
      },
    },
  };
}
