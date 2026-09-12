import { Context } from "@temporalio/activity";

import { env } from "../env";
import { createTikaClient } from "../ocr/tika";
import { extractDocumentText, runSandboxCommand, type ExtractTextInput, type SandboxCommandInput } from "./activities";
import type { JobContext } from "./contracts";
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
export function createDocumentActivities(databaseUrl: string) {
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
        return receipt;
      },
      async runSandboxCommand(input: SandboxCommandInput) {
        return await runSandboxCommand(
          store,
          {
            baseDir: env.DOCUMENT_STORAGE_DIR,
            image: process.env.SANDBOX_IMAGE ?? "alpine:3.20",
          },
          input,
          activityContext(),
        );
      },
    },
  };
}
