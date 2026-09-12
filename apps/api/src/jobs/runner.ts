import { JobCancelled, type JobContext, type JobReceipt, type JobRequest, type JobStore } from "./contracts";

export interface JobOutcome {
  output?: Record<string, unknown>;
}

export type JobWork = (context: Required<Pick<JobContext, "heartbeat">> & JobContext) => Promise<JobOutcome>;

/** A failure worth another attempt: a service was briefly unavailable, not a bad request. */
export class RetryableJobError extends Error {
  readonly retryable = true;
}

function describe(error: unknown) {
  return error instanceof Error ? error.message : "job_failed";
}

/**
 * Runs one job once.
 *
 * A finished job returns its stored result instead of running again, so a workflow that
 * replays, or a worker that is handed the same job twice, cannot produce a second file or
 * repeat an external call. A job already claimed by another worker is reported as running
 * rather than duplicated.
 *
 * Failures are recorded and returned, never thrown, so the workflow decides what happens
 * next from a stored status rather than from an exception that may not survive a restart.
 */
export async function runJob(
  store: JobStore,
  request: JobRequest,
  work: JobWork,
  context: JobContext = {},
): Promise<JobReceipt> {
  const now = context.now ?? (() => new Date());
  const heartbeat = context.heartbeat ?? (() => {});

  const existing = await store.findReceipt(request.jobId);
  if (existing && existing.status !== "running") return existing;
  // Another worker holds this job. Reporting it as running keeps the effect to one worker.
  if (existing) return existing;

  const claimed = await claim(store, request, now().toISOString());
  if (!claimed.owned) return claimed.receipt;

  if (context.signal?.aborted) {
    return await store.complete(request.jobId, {
      status: "failed", error: "job_cancelled", retryable: true,
    });
  }

  try {
    heartbeat({ jobId: request.jobId, phase: "started" });
    const outcome = await work({ ...context, heartbeat });
    return await store.complete(request.jobId, { status: "succeeded", output: outcome.output });
  } catch (error) {
    const cancelled = error instanceof JobCancelled || context.signal?.aborted === true;
    return await store.complete(request.jobId, {
      status: "failed",
      error: cancelled ? "job_cancelled" : describe(error),
      // A cancelled job did not fail on its merits, so it stays eligible for a later run.
      retryable: cancelled || error instanceof RetryableJobError,
    });
  }
}

async function claim(store: JobStore, request: JobRequest, startedAt: string) {
  try {
    return { receipt: await store.claim(request, startedAt), owned: true };
  } catch (error) {
    const winner = await store.findReceipt(request.jobId);
    if (winner) return { receipt: winner, owned: false };
    throw error;
  }
}

/**
 * Finds jobs left running by a worker that stopped.
 *
 * These are reported rather than retried automatically: the job may have completed its
 * effect before the worker died, and repeating it could produce a second artifact.
 */
export async function abandonedJobs(store: JobStore, olderThanMs: number, now = () => new Date()) {
  return await store.abandoned(new Date(now().getTime() - olderThanMs).toISOString());
}
