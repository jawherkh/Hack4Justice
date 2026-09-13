import { ApplicationFailure, CancelledFailure, Context } from "@temporalio/activity";

import { createTikaClient } from "../ocr/tika";
import { extractDocumentText, runSandboxCommand, type DocumentSource, type ExtractTextInput, type SandboxCommandInput } from "./activities";
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
/**
 * Hands a finished job back to the workflow.
 *
 * A job the workflow should act on must fail the activity: Temporal applies its retry and
 * cancellation policy to a failed activity, and sees a returned value as work that
 * completed. A job that failed in a way no retry would change is returned, because the
 * record of that refusal is the useful answer.
 */
export function settleForTest(receipt: JobReceipt): JobReceipt {
  return settle(receipt);
}

function settle(receipt: JobReceipt): JobReceipt {
  if (receipt.error === "job_cancelled") {
    // Cancellation has its own failure type. A plain error would be read as an ordinary
    // failure and retried, spending the retry budget on work the caller already stopped.
    throw new CancelledFailure("job_cancelled");
  }
  if (receipt.status === "running") {
    // Another worker holds this job. Returning the record would tell the workflow the work
    // finished while it is still going, so this fails and the retry reads the finished
    // record instead.
    throw ApplicationFailure.retryable("job_in_progress", "JobInProgress");
  }
  if (receipt.status === "failed" && receipt.retryable) {
    throw ApplicationFailure.retryable(receipt.error ?? "job_failed", "RetryableJobFailure");
  }
  // A failure no retry would change is returned, not thrown: that record is the answer the
  // workflow needs, and Temporal would only repeat a call that cannot succeed.
  return forHistory(receipt);
}

export function forHistory(receipt: JobReceipt): JobReceipt {
  const output = receipt.output;
  if (!output) return receipt;
  const { text, ...rest } = output as Record<string, unknown>;
  return {
    ...receipt,
    output: {
      ...rest,
      ...(typeof text === "string" ? { textCharacters: text.length } : {}),
    },
  };
}

/**
 * Builds the document activities the worker registers.
 *
 * Each one records its own receipt, so a workflow that replays, or a worker that restarts,
 * reads what already happened rather than doing the work a second time.
 */
export interface DocumentActivitySettings {
  /** Reads stored documents inside the worker, so bytes never cross the activity boundary. */
  documents: DocumentSource;
  /** Where Tika is reachable. */
  tikaUrl: string;
  /** Root for per-run sandbox workspaces. */
  workspaceBaseDir: string;
  /** Image the sandbox runs. */
  image: string;
}

export function createDocumentActivities(databaseUrl: string, settings: DocumentActivitySettings) {
  const store = new PostgresJobStore(databaseUrl);
  const tika = createTikaClient(settings.tikaUrl);

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
    close: () => store.close(),
    activities: {
      async extractDocumentText(input: ExtractTextInput) {
        const { receipt } = await extractDocumentText(store, extractor, settings.documents, input, activityContext());
        return settle(receipt);
      },
      async runSandboxCommand(input: SandboxCommandInput) {
        return settle(await runSandboxCommand(
          store,
          {
            baseDir: settings.workspaceBaseDir,
            image: settings.image,
          },
          settings.documents,
          input,
          activityContext(),
        ));
      },
    },
  };
}
