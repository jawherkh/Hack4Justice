import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractDocumentText, runSandboxCommand, type TextExtractor } from "./activities";
import { defaultRunLimits } from "../sandbox/runner";
import { PostgresJobStore } from "./store";
import { JobCancelled, type JobReceipt, type JobRequest, type JobStore } from "./contracts";
import { abandonedJobs, RetryableJobError, runJob } from "./runner";

class MemoryJobStore implements JobStore {
  readonly receipts: JobReceipt[] = [];

  async findReceipt(jobId: string) {
    const found = this.receipts.find((receipt) => receipt.jobId === jobId);
    // A database read hands back a detached row; sharing the live object would hide races.
    return found ? { ...found } : undefined;
  }

  async claim(request: JobRequest, startedAt: string) {
    if (this.receipts.some((receipt) => receipt.jobId === request.jobId)) {
      throw new Error("duplicate job id");
    }
    const receipt: JobReceipt = {
      jobId: request.jobId,
      dossierId: request.dossierId,
      kind: request.kind,
      status: "running",
      attempts: 1,
      startedAt,
      updatedAt: startedAt,
    };
    this.receipts.push(receipt);
    return { ...receipt };
  }

  async complete(jobId: string, outcome: Pick<JobReceipt, "status" | "output" | "error" | "retryable">) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId);
    if (!receipt) throw new Error("unknown job");
    Object.assign(receipt, outcome, { updatedAt: new Date().toISOString() });
    return { ...receipt };
  }

  async abandoned(olderThan: string) {
    return this.receipts
      .filter((receipt) => receipt.status === "running" && receipt.updatedAt < olderThan)
      .map((receipt) => ({ ...receipt }));
  }
}

const request = (jobId = "job-1"): JobRequest => ({ jobId, dossierId: "dossier-1", kind: "sandbox_command" });

describe("durable jobs", () => {
  test("records a result and returns it without running the work twice", async () => {
    const store = new MemoryJobStore();
    let runs = 0;
    const work = async () => { runs += 1; return { output: { produced: "report.pdf" } }; };

    const first = await runJob(store, request(), work);
    const second = await runJob(store, request(), work);

    expect(runs).toBe(1);
    expect(first.status).toBe("succeeded");
    expect(second.output).toEqual({ produced: "report.pdf" });
    expect(store.receipts).toHaveLength(1);
  });

  test("two workers handed the same job perform its effect once", async () => {
    const store = new MemoryJobStore();
    let runs = 0;
    const work = async () => { runs += 1; return {}; };

    await Promise.all([runJob(store, request(), work), runJob(store, request(), work)]);

    expect(runs).toBe(1);
    expect(store.receipts).toHaveLength(1);
  });

  test("a failure is recorded and returned rather than thrown at the workflow", async () => {
    const store = new MemoryJobStore();

    const receipt = await runJob(store, request(), async () => { throw new Error("tool_exploded"); });

    expect(receipt.status).toBe("failed");
    expect(receipt.error).toBe("tool_exploded");
    expect(receipt.retryable).toBeFalsy();
  });

  test("an unavailable service is marked retryable, a refused input is not", async () => {
    const store = new MemoryJobStore();

    const transient = await runJob(store, request("job-a"), async () => {
      throw new RetryableJobError("service_unavailable");
    });
    const permanent = await runJob(store, request("job-b"), async () => {
      throw new Error("unreadable_document");
    });

    expect(transient.retryable).toBe(true);
    expect(permanent.retryable).toBeFalsy();
  });

  test("cancellation stops the work and stays eligible for a later run", async () => {
    const store = new MemoryJobStore();
    const controller = new AbortController();
    controller.abort();
    let runs = 0;

    const receipt = await runJob(store, request(), async () => { runs += 1; return {}; }, { signal: controller.signal });

    expect(runs).toBe(0);
    expect(receipt.status).toBe("failed");
    expect(receipt.error).toBe("job_cancelled");
    expect(receipt.retryable).toBe(true);
  });

  test("cancellation raised inside the work is reported as cancelled, not as a defect", async () => {
    const store = new MemoryJobStore();

    const receipt = await runJob(store, request(), async () => { throw new JobCancelled("stopped midway"); });

    expect(receipt.error).toBe("job_cancelled");
    expect(receipt.retryable).toBe(true);
  });

  test("progress is reported so a long job is not mistaken for a stalled one", async () => {
    const store = new MemoryJobStore();
    const beats: unknown[] = [];

    await runJob(store, request(), async ({ heartbeat }) => {
      heartbeat({ phase: "halfway" });
      return {};
    }, { heartbeat: (details) => beats.push(details) });

    expect(beats.length).toBeGreaterThanOrEqual(2);
  });

  test("a job left running by a stopped worker is reported, not silently retried", async () => {
    const store = new MemoryJobStore();
    await store.claim(request("stranded"), new Date(Date.now() - 60_000).toISOString());
    store.receipts[0]!.updatedAt = new Date(Date.now() - 60_000).toISOString();

    const stranded = await abandonedJobs(store, 30_000);

    expect(stranded.map((receipt) => receipt.jobId)).toEqual(["stranded"]);
    expect(stranded[0]!.status).toBe("running");
  });
});

describe("document text extraction", () => {
  const extractor: TextExtractor = {
    async extract() { return { text: "Quittance fiscale", pageCount: 2 }; },
  };

  test("keeps the text out of the result and records its size and checksum", async () => {
    const store = new MemoryJobStore();

    const { receipt, text } = await extractDocumentText(store, extractor, {
      jobId: "extract-1", dossierId: "dossier-1", documentId: "doc-1", filename: "scan.pdf", bytes: new Uint8Array([1]),
    });

    expect(receipt.status).toBe("succeeded");
    expect(text).toBe("Quittance fiscale");
    expect(receipt.output).toMatchObject({ documentId: "doc-1", characters: 17, pageCount: 2 });
    expect(JSON.stringify(receipt.output)).not.toContain("Quittance fiscale");
  });

  test("repeating the job does not call the extraction service again", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const counting: TextExtractor = {
      async extract() { calls += 1; return { text: "once" }; },
    };
    const input = {
      jobId: "extract-2", dossierId: "dossier-1", documentId: "doc-1", filename: "scan.pdf", bytes: new Uint8Array([1]),
    };

    await extractDocumentText(store, counting, input);
    const repeat = await extractDocumentText(store, counting, input);

    expect(calls).toBe(1);
    expect(repeat.receipt.status).toBe("succeeded");
  });

  test("an unavailable extraction service is retryable", async () => {
    const store = new MemoryJobStore();
    const broken: TextExtractor = {
      async extract() { throw new Error("connect ECONNREFUSED"); },
    };

    const { receipt } = await extractDocumentText(store, broken, {
      jobId: "extract-3", dossierId: "dossier-1", documentId: "doc-1", filename: "scan.pdf", bytes: new Uint8Array([1]),
    });

    expect(receipt.status).toBe("failed");
    expect(receipt.retryable).toBe(true);
  });
});

// The sandbox checks need a container daemon, so they run on request like the sandbox suite.
const live = process.env.SANDBOX_DOCKER_TESTS ? describe : describe.skip;
const image = process.env.SANDBOX_IMAGE ?? "alpine:3.20";

live("sandbox work as a durable job", () => {
  let base: string;
  beforeAll(async () => { base = await mkdtemp(join(tmpdir(), "h4j-jobs-")); });
  afterAll(async () => { if (base) await rm(base, { recursive: true, force: true }); });

  test("produces an artifact with provenance and does not produce it twice", async () => {
    const store = new MemoryJobStore();
    const input = {
      jobId: "sandbox-1", dossierId: "dossierjobs", runId: `runone${randomUUID().slice(0, 6)}`,
      command: ["sh", "-c", "cat input.txt > produced.txt"],
      inputs: [{ path: "input.txt", bytes: new TextEncoder().encode("prepared") }],
      artifacts: ["produced.txt"],
    };

    const first = await runSandboxCommand(store, { baseDir: base, image }, input);
    expect(first.status).toBe("succeeded");
    const artifacts = (first.output as { artifacts: { sha256: string }[] }).artifacts;
    expect(artifacts[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);

    const repeat = await runSandboxCommand(store, { baseDir: base, image }, input);
    expect(repeat.updatedAt).toBe(first.updatedAt);
    expect(store.receipts).toHaveLength(1);
  }, 180_000);

  test("a command that fails is recorded with its exit code rather than throwing", async () => {
    const store = new MemoryJobStore();

    const receipt = await runSandboxCommand(store, { baseDir: base, image }, {
      jobId: "sandbox-2", dossierId: "dossierjobs", runId: `runtwo${randomUUID().slice(0, 6)}`, command: ["sh", "-c", "exit 3"],
    });

    expect(receipt.status).toBe("succeeded");
    expect(receipt.output).toMatchObject({ exitCode: 3 });
  }, 180_000);

  test("a run that passes its time limit is retryable", async () => {
    const store = new MemoryJobStore();

    const receipt = await runSandboxCommand(store, {
      baseDir: base, image, limits: { ...defaultRunLimits, timeoutMs: 4_000 },
    }, {
      jobId: "sandbox-3", dossierId: "dossierjobs", runId: `runthree${randomUUID().slice(0, 6)}`, command: ["sh", "-c", "while true; do :; done"],
    });

    expect(receipt.status).toBe("failed");
    expect(receipt.retryable).toBe(true);
  }, 180_000);

  test("a stopped run leaves no container behind", async () => {
    const store = new MemoryJobStore();
    const runId = `runleak${randomUUID().slice(0, 6)}`;

    const receipt = await runSandboxCommand(store, {
      baseDir: base, image, limits: { ...defaultRunLimits, timeoutMs: 3_000 },
    }, {
      jobId: `sandbox-leak-${runId}`, dossierId: "dossierjobs", runId,
      command: ["sh", "-c", "while true; do :; done"],
    });

    expect(receipt.status).toBe("failed");
    // The run reports back only once its container is gone, so nothing keeps running here.
    const remaining = await new Promise<string>((settle) => {
      const check = spawn("docker", ["ps", "--all", "--quiet", "--filter", `name=^h4j-dossierjobs-${runId}$`],
        { stdio: ["ignore", "pipe", "ignore"] });
      let text = "";
      check.stdout.on("data", (chunk: Buffer) => { text += chunk.toString(); });
      check.on("error", () => settle(""));
      check.on("close", () => settle(text.trim()));
    });
    expect(remaining).toBe("");
  }, 180_000);
});

// The stored-receipt checks need PostgreSQL, matching how the storage suite is gated.
const url = process.env.TEST_DATABASE_URL;
const persisted = url ? describe : describe.skip;

persisted("receipts stored in the database", () => {
  const schema = `test_jobs_${randomUUID().replaceAll("-", "")}`;
  let store: PostgresJobStore;

  beforeAll(async () => {
    store = new PostgresJobStore(url!, schema);
    await store.initialize();
  }, 30_000);

  afterAll(async () => {
    if (!store) return;
    // Close the pool first: dropping the schema while its own connections are open waits
    // on locks those connections hold, which leaves the test process running.
    await store.close();
    const cleaner = new PostgresJobStore(url!, schema);
    try {
      await cleaner.drop();
    } finally {
      await cleaner.close();
    }
  }, 30_000);

  test("a receipt outlives the worker that produced it", async () => {
    const request = { jobId: `job-${randomUUID()}`, dossierId: "dossier-1", kind: "sandbox_command" as const };
    let runs = 0;

    await runJob(store, request, async () => { runs += 1; return { output: { produced: "one.pdf" } }; });
    // A second worker, with no memory of the first, is handed the same job.
    const second = new PostgresJobStore(url!, schema);
    try {
      const repeat = await runJob(second, request, async () => { runs += 1; return { output: { produced: "two.pdf" } }; });
      expect(runs).toBe(1);
      expect(repeat.output).toEqual({ produced: "one.pdf" });
    } finally {
      await second.close();
    }
  }, 30_000);

  test("the database refuses a second claim on one job id", async () => {
    const request = { jobId: `job-${randomUUID()}`, dossierId: "dossier-1", kind: "document_text_extraction" as const };
    await store.claim(request, new Date().toISOString());

    let rejected = false;
    try {
      await store.claim(request, new Date().toISOString());
    } catch {
      rejected = true;
    }
    expect(rejected).toBe(true);
  }, 30_000);

  test("a job left running is listed as abandoned", async () => {
    const request = { jobId: `job-${randomUUID()}`, dossierId: "dossier-1", kind: "sandbox_command" as const };
    await store.claim(request, new Date(Date.now() - 120_000).toISOString());
    await store.markStaleForTest(request.jobId);

    const stranded = await abandonedJobs(store, 60_000);

    expect(stranded.map((receipt) => receipt.jobId)).toContain(request.jobId);
  }, 30_000);
});
