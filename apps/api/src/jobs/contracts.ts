/** Work that runs outside the workflow: reading a document, or running a command in a sandbox. */
export type JobKind = "document_text_extraction" | "sandbox_command" | "agent_turn";

export type JobStatus = "running" | "succeeded" | "failed";

/** How many times a job whose failure looked temporary may be tried. */
export const maxJobAttempts = 3;

export interface JobRequest {
  /** Stable for one logical piece of work. Repeating it must not repeat the effect. */
  jobId: string;
  dossierId: string;
  kind: JobKind;
}

export interface JobReceipt {
  jobId: string;
  dossierId: string;
  kind: JobKind;
  status: JobStatus;
  /** What the work produced. Kept small: references and extracted facts, never document bytes. */
  output?: Record<string, unknown>;
  error?: string;
  /** A failure the caller may retry, as opposed to one that will fail the same way again. */
  retryable?: boolean;
  attempts: number;
  startedAt: string;
  updatedAt: string;
}

/**
 * Records what ran and what it produced.
 *
 * The workflow history carries only references, so this is where a result outlives the
 * worker that produced it. A job claimed once and never finished is visible as running,
 * which is what lets an abandoned job be found rather than silently lost.
 */
export interface JobStore {
  findReceipt(jobId: string): Promise<JobReceipt | undefined>;
  /**
   * Records the start of a job. Must reject when the id already exists, so two workers
   * handed the same job cannot both perform its effect.
   */
  claim(request: JobRequest, startedAt: string): Promise<JobReceipt>;
  complete(jobId: string, outcome: Pick<JobReceipt, "status" | "output" | "error" | "retryable">): Promise<JobReceipt>;
  /**
   * Takes a failed job back for another attempt, raising its attempt count.
   *
   * Must apply only while the record still shows `expectedAttempts`, and must return
   * undefined when another caller took it first, so two retries cannot run at once.
   */
  reattempt(jobId: string, expectedAttempts: number): Promise<JobReceipt | undefined>;
  /** Jobs still marked running after the cutoff. A worker that stopped leaves these behind. */
  abandoned(olderThan: string): Promise<JobReceipt[]>;
}

/** Reports progress so a long job is not mistaken for a stalled one. */
export type Heartbeat = (details?: unknown) => void;

export interface JobContext {
  heartbeat?: Heartbeat;
  /** Cancellation from the workflow. Work should stop and leave nothing half-applied. */
  signal?: AbortSignal;
  now?: () => Date;
}

export class JobCancelled extends Error {
  readonly code = "job_cancelled";
}
