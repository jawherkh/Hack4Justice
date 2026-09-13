import postgres from "postgres";

import type { JobKind, JobReceipt, JobRequest, JobStatus, JobStore } from "./contracts";

interface Row {
  id: string;
  dossier_id: string;
  kind: JobKind;
  status: JobStatus;
  output: Record<string, unknown> | null;
  error: string | null;
  retryable: boolean | null;
  attempts: number;
  started_at: Date;
  updated_at: Date;
}

function toReceipt(row: Row): JobReceipt {
  return {
    jobId: row.id,
    dossierId: row.dossier_id,
    kind: row.kind,
    status: row.status,
    output: row.output ?? undefined,
    error: row.error ?? undefined,
    retryable: row.retryable ?? undefined,
    attempts: row.attempts,
    startedAt: row.started_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/**
 * Keeps job receipts in the database the API already uses.
 *
 * The primary key on the job id is what stops two workers performing the same effect: the
 * second insert is rejected, and that worker reads the winner's record instead of running
 * the work again.
 */
export class PostgresJobStore implements JobStore {
  private readonly sql;

  constructor(url: string, readonly schema = "h4j_api") {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid database schema");
    this.sql = postgres(url, { max: 5, prepare: false, connect_timeout: 10, onnotice: () => {} });
  }

  private async query<T>(statement: string, parameters: unknown[] = []): Promise<T[]> {
    const scoped = statement.replaceAll("h4j_api", `"${this.schema}"`);
    return await this.sql.unsafe(scoped, parameters as never[]) as unknown as T[];
  }

  /** Creates the table this store needs. Safe to call repeatedly. */
  async initialize() {
    await this.query(`CREATE SCHEMA IF NOT EXISTS h4j_api;
CREATE TABLE IF NOT EXISTS h4j_api.document_jobs (
  id text PRIMARY KEY,
  dossier_id text NOT NULL,
  kind text NOT NULL,
  status text NOT NULL,
  output jsonb,
  error text,
  retryable boolean,
  attempts integer NOT NULL DEFAULT 1,
  started_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS document_jobs_running ON h4j_api.document_jobs(updated_at) WHERE status = 'running';`);
  }

  /** Removes the schema this store created. Intended for tests. */
  async drop() {
    await this.query(`DROP SCHEMA IF EXISTS h4j_api CASCADE`);
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }

  async findReceipt(jobId: string) {
    const rows = await this.query<Row>("SELECT * FROM h4j_api.document_jobs WHERE id = $1", [jobId]);
    return rows[0] ? toReceipt(rows[0]) : undefined;
  }

  async claim(request: JobRequest, startedAt: string) {
    const rows = await this.query<Row>(
      `INSERT INTO h4j_api.document_jobs (id, dossier_id, kind, status, attempts, started_at, updated_at)
       VALUES ($1, $2, $3, 'running', 1, $4, $4) RETURNING *`,
      [request.jobId, request.dossierId, request.kind, startedAt],
    );
    const row = rows[0];
    if (!row) throw new Error("job was not recorded");
    return toReceipt(row);
  }

  async complete(jobId: string, outcome: Pick<JobReceipt, "status" | "output" | "error" | "retryable">) {
    const rows = await this.query<Row>(
      `UPDATE h4j_api.document_jobs
         SET status = $2, output = $3::jsonb, error = $4, retryable = $5, updated_at = now()
       WHERE id = $1 RETURNING *`,
      [jobId, outcome.status, outcome.output ?? null, outcome.error ?? null, outcome.retryable ?? null],
    );
    const row = rows[0];
    if (!row) throw new Error("unknown job");
    return toReceipt(row);
  }

  async reattempt(jobId: string, expectedAttempts: number) {
    const rows = await this.query<Row>(
      `UPDATE h4j_api.document_jobs
         SET status = 'running', attempts = attempts + 1, error = NULL, retryable = NULL, updated_at = now()
       WHERE id = $1 AND attempts = $2 RETURNING *`,
      [jobId, expectedAttempts],
    );
    return rows[0] ? toReceipt(rows[0]) : undefined;
  }

  async touch(jobId: string) {
    await this.query("UPDATE h4j_api.document_jobs SET updated_at = now() WHERE id = $1 AND status = 'running'", [jobId]);
  }

  /** Backdates a running job so the abandoned-job check can be exercised. */
  async markStaleForTest(jobId: string) {
    await this.query("UPDATE h4j_api.document_jobs SET updated_at = now() - interval '2 minutes' WHERE id = $1", [jobId]);
  }

  async abandoned(olderThan: string) {
    const rows = await this.query<Row>(
      "SELECT * FROM h4j_api.document_jobs WHERE status = 'running' AND updated_at < $1 ORDER BY updated_at",
      [olderThan],
    );
    return rows.map(toReceipt);
  }
}
