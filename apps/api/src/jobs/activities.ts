import { createHash } from "node:crypto";

import { DockerRunner, defaultRunLimits, type RunLimits } from "../sandbox/runner";
import { Workspace } from "../sandbox/workspace";
import { JobCancelled, type JobContext, type JobReceipt, type JobStore } from "./contracts";
import { RetryableJobError, runJob } from "./runner";

/** The container runtime's own exit code for a run it could not start. */
const containerStartFailure = 125;

/*
 * The receipt keeps the whole extracted text. A repeated call returns the receipt without
 * extracting again, so anything left out would be lost for precisely the long documents
 * that cost the most to read. The value handed to the workflow is trimmed separately, so
 * keeping it here does not enlarge a workflow history.
 */

/**
 * Reads a stored document. The worker holds this, so a document's bytes never travel as an
 * activity argument and never enter a workflow history.
 */
export interface DocumentSource {
  read(reference: DocumentReference): Promise<{ bytes: Uint8Array; filename: string; contentType?: string }>;
}

/** Identifies a stored document. Small enough to sit in a workflow history. */
export interface DocumentReference {
  documentId: string;
  storageKey?: string;
}

export interface ExtractTextInput {
  jobId: string;
  dossierId: string;
  /** A reference, not the document. The worker reads the bytes. */
  document: DocumentReference;
  languages?: string;
}

/** Reads text out of an uploaded document. */
export interface TextExtractor {
  extract(input: {
    bytes: Uint8Array;
    filename: string;
    languages?: string;
    contentType?: string;
  }): Promise<{ text: string; pageCount?: number | null }>;
}

/**
 * Extracts a document's text as a durable job.
 *
 * The extracted text is not placed in the result: a workflow history is not the place for
 * document contents. The receipt carries its length and checksum, and the text is handed
 * to the caller for storage alongside the document it came from.
 */
export async function extractDocumentText(
  store: JobStore,
  extractor: TextExtractor,
  documents: DocumentSource,
  input: ExtractTextInput,
  context: JobContext = {},
): Promise<{ receipt: JobReceipt; text?: string }> {
  let text: string | undefined;

  const receipt = await runJob(
    store,
    { jobId: input.jobId, dossierId: input.dossierId, kind: "document_text_extraction" },
    async ({ heartbeat, signal }) => {
      heartbeat({ jobId: input.jobId, phase: "extracting", documentId: input.document.documentId });
      if (signal?.aborted) throw new JobCancelled("cancelled before extraction");

      let stored: { bytes: Uint8Array; filename: string; contentType?: string };
      try {
        stored = await documents.read(input.document);
      } catch (error) {
        // Storage being briefly unreachable is worth another attempt.
        throw new RetryableJobError(error instanceof Error ? error.message : "document_unreadable");
      }

      let result: { text: string; pageCount?: number | null };
      try {
        result = await extractor.extract({
          bytes: stored.bytes,
          filename: stored.filename,
          languages: input.languages,
          contentType: stored.contentType,
        });
      } catch (error) {
        // The extraction service being unavailable is worth another attempt; a document it
        // refuses to read is not, and will be reported for a person to look at.
        throw new RetryableJobError(error instanceof Error ? error.message : "extraction_unavailable");
      }

      text = result.text;
      return {
        output: {
          documentId: input.document.documentId,
          characters: result.text.length,
          checksum: createHash("sha256").update(result.text).digest("hex"),
          pageCount: result.pageCount ?? null,
          text: result.text,
        },
      };
    },
    context,
  );

  return { receipt, text: text ?? storedText(receipt) };
}

/** The text a receipt kept, for a call that did not extract again. */
function storedText(receipt: JobReceipt): string | undefined {
  if (receipt.status !== "succeeded") return undefined;
  return typeof receipt.output?.text === "string" ? receipt.output.text : undefined;
}

export interface SandboxCommandInput {
  jobId: string;
  dossierId: string;
  runId: string;
  command: readonly string[];
  /**
   * Documents placed in the workspace before the command runs, given as references. The
   * worker reads them, so their bytes never travel as an activity argument.
   */
  inputs?: { path: string; document: DocumentReference }[];
  /** Files collected afterwards, each recorded with its checksum. */
  artifacts?: string[];
}

export interface SandboxSettings {
  baseDir: string;
  image: string;
  limits?: RunLimits;
}

/**
 * Runs a command in this dossier's sandbox as a durable job.
 *
 * A repeat of the same job returns the stored receipt rather than running the command
 * again, so a workflow replay cannot produce a second copy of a generated document.
 * Cancellation removes the container, so nothing keeps running once the workflow stops
 * waiting for it.
 */
export async function runSandboxCommand(
  store: JobStore,
  settings: SandboxSettings,
  documents: DocumentSource,
  input: SandboxCommandInput,
  context: JobContext = {},
): Promise<JobReceipt> {
  return await runJob(
    store,
    { jobId: input.jobId, dossierId: input.dossierId, kind: "sandbox_command" },
    async ({ heartbeat, signal }) => {
      const workspace = await Workspace.create(settings.baseDir, input.dossierId, input.runId);
      const runner = new DockerRunner(settings.image, settings.limits ?? defaultRunLimits);

      const stop = () => {
        void runner.terminate(workspace);
      };
      signal?.addEventListener("abort", stop, { once: true });

      try {
        for (const file of input.inputs ?? []) {
          const stored = await documents.read(file.document);
          await workspace.writeFile(file.path, stored.bytes);
        }

        heartbeat({ jobId: input.jobId, phase: "running", runId: input.runId });
        if (signal?.aborted) throw new JobCancelled("cancelled before the command started");

        const result = await runner.run(workspace, input.command);
        heartbeat({ jobId: input.jobId, phase: "finished", exitCode: result.exitCode });

        if (result.timedOut) throw new RetryableJobError("sandbox_run_timed_out");
        if (signal?.aborted) throw new JobCancelled("cancelled during the command");
        // The command never ran: either the runtime refused the run, or the client could
        // not be started at all and reports no exit code. Recording either as a completed
        // run would be a success that never happened.
        if (result.exitCode === containerStartFailure || result.exitCode === null) {
          throw new RetryableJobError(
            `sandbox_did_not_start: ${result.stderr.trim().slice(0, 200) || "runtime_unavailable"}`,
          );
        }

        const artifacts = [];
        for (const path of input.artifacts ?? []) {
          const { provenance } = await workspace.exportArtifact(path);
          artifacts.push(provenance);
        }

        return {
          output: {
            runId: input.runId,
            exitCode: result.exitCode,
            truncated: result.truncated,
            limitExceeded: result.limitExceeded,
            durationMs: result.durationMs,
            artifacts,
          },
        };
      } finally {
        signal?.removeEventListener("abort", stop);
      }
    },
    context,
  );
}
