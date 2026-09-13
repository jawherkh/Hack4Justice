import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { extractDocumentText, runSandboxCommand, type TextExtractor } from "./activities";
import { defaultRunLimits } from "../sandbox/runner";
import { forHistory } from "./worker-activities";
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

  async reattempt(jobId: string, expectedAttempts: number) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId);
    if (!receipt || receipt.attempts !== expectedAttempts) return undefined;
    receipt.attempts += 1;
    receipt.status = "running";
    receipt.updatedAt = new Date().toISOString();
    return { ...receipt };
  }

  async abandoned(olderThan: string) {
    return this.receipts
      .filter((receipt) => receipt.status === "running" && receipt.updatedAt < olderThan)
      .map((receipt) => ({ ...receipt }));
  }
}

/** Stands in for the worker's document store. */
const documents = (contents: Record<string, string> = { "doc-1": "%PDF stored bytes", "doc-long": "%PDF long", "doc-missing-not": "x" }) => ({
  async read({ documentId }: { documentId: string }) {
    const text = contents[documentId];
    if (text === undefined) throw new Error(`document ${documentId} not found`);
    return { bytes: new TextEncoder().encode(text), filename: `${documentId}.pdf`, contentType: "application/pdf" };
  },
});

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

  test("cancellation stops the work and does not leave it pending", async () => {
    const store = new MemoryJobStore();
    const controller = new AbortController();
    controller.abort();
    let runs = 0;

    const receipt = await runJob(store, request(), async () => { runs += 1; return {}; }, { signal: controller.signal });

    expect(runs).toBe(0);
    expect(receipt.status).toBe("failed");
    expect(receipt.error).toBe("job_cancelled");
    // Not retryable: a later attempt must not run the work the caller stopped.
    expect(receipt.retryable).toBe(false);
  });

  test("a cancelled job is not run again by a later attempt", async () => {
    const store = new MemoryJobStore();
    const controller = new AbortController();
    controller.abort();
    let runs = 0;
    const work = async () => { runs += 1; return {}; };

    await runJob(store, request("cancelled-once"), work, { signal: controller.signal });
    // A retry arrives after the cancellation, with no signal of its own.
    const repeat = await runJob(store, request("cancelled-once"), work);

    expect(runs).toBe(0);
    expect(repeat.error).toBe("job_cancelled");
  });

  test("cancellation raised inside the work is reported as cancelled, not as a defect", async () => {
    const store = new MemoryJobStore();

    const receipt = await runJob(store, request(), async () => { throw new JobCancelled("stopped midway"); });

    expect(receipt.error).toBe("job_cancelled");
    expect(receipt.retryable).toBe(false);
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

  test("a reused id that names different work is refused", async () => {
    const store = new MemoryJobStore();
    await runJob(store, { jobId: "shared", dossierId: "dossier-1", kind: "sandbox_command" }, async () => ({}));

    // The same id for another dossier must not be answered with the first one's record.
    await expect(
      runJob(store, { jobId: "shared", dossierId: "dossier-2", kind: "sandbox_command" }, async () => ({})),
    ).rejects.toThrow(/different work/);
  });

  test("a long job keeps its record fresh so it is not read as abandoned", async () => {
    const store = new MemoryJobStore();
    const touched: string[] = [];
    const tracking = Object.assign(store, { touch: async (jobId: string) => { touched.push(jobId); } });

    await runJob(tracking, request("long"), async ({ heartbeat }) => {
      heartbeat({ phase: "still working" });
      return {};
    });

    expect(touched).toContain("long");
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

    const { receipt, text } = await extractDocumentText(store, extractor, documents(), {
      jobId: "extract-1", dossierId: "dossier-1", document: { documentId: "doc-1" },
    });

    expect(receipt.status).toBe("succeeded");
    expect(text).toBe("Quittance fiscale");
    expect(receipt.output).toMatchObject({ documentId: "doc-1", characters: 17, pageCount: 2 });
    // The workflow is told what was read, not handed the document's contents.
    expect(JSON.stringify(forHistory(receipt).output)).not.toContain("Quittance fiscale");
    expect(forHistory(receipt).output).toMatchObject({ textCharacters: 17 });
  });

  test("repeating the job does not call the extraction service again", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const counting: TextExtractor = {
      async extract() { calls += 1; return { text: "once" }; },
    };
    const input = {
      jobId: "extract-2", dossierId: "dossier-1", document: { documentId: "doc-1" },
    };

    await extractDocumentText(store, counting, documents(), input);
    const repeat = await extractDocumentText(store, counting, documents(), input);

    expect(calls).toBe(1);
    expect(repeat.receipt.status).toBe("succeeded");
  });

  test("a long document's text survives a repeated call", async () => {
    const store = new MemoryJobStore();
    const long = "Article 12. ".repeat(40_000); // well past any reasonable inline limit
    let calls = 0;
    const counting: TextExtractor = {
      async extract() { calls += 1; return { text: long, pageCount: 120 }; },
    };
    const input = {
      jobId: "extract-long", dossierId: "dossier-1", document: { documentId: "doc-long" },
    };

    const first = await extractDocumentText(store, counting, documents(), input);
    const again = await extractDocumentText(store, counting, documents(), input);

    expect(calls).toBe(1);
    expect(first.text).toBe(long);
    // The whole text comes back, not a fragment and not nothing.
    expect(again.text).toBe(long);
  });

  test("a repeated extraction returns the same text without calling the service again", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const counting: TextExtractor = {
      async extract() { calls += 1; return { text: "Quittance fiscale", pageCount: 1 }; },
    };
    const input = {
      jobId: "extract-repeat", dossierId: "dossier-1", document: { documentId: "doc-1" },
    };

    await extractDocumentText(store, counting, documents(), input);
    const again = await extractDocumentText(store, counting, documents(), input);

    expect(calls).toBe(1);
    expect(again.text).toBe("Quittance fiscale");
  });

  test("an unavailable extraction service is retryable", async () => {
    const store = new MemoryJobStore();
    const broken: TextExtractor = {
      async extract() { throw new Error("connect ECONNREFUSED"); },
    };

    const { receipt } = await extractDocumentText(store, broken, documents(), {
      jobId: "extract-3", dossierId: "dossier-1", document: { documentId: "doc-1" },
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
      inputs: [{ path: "input.txt", document: { documentId: "doc-1" } }],
      artifacts: ["produced.txt"],
    };

    const first = await runSandboxCommand(store, { baseDir: base, image }, documents(), input);
    expect(first.status).toBe("succeeded");
    const artifacts = (first.output as { artifacts: { sha256: string }[] }).artifacts;
    expect(artifacts[0]!.sha256).toMatch(/^[a-f0-9]{64}$/);

    const repeat = await runSandboxCommand(store, { baseDir: base, image }, documents(), input);
    expect(repeat.updatedAt).toBe(first.updatedAt);
    expect(store.receipts).toHaveLength(1);
  }, 180_000);

  test("a command that fails is recorded with its exit code rather than throwing", async () => {
    const store = new MemoryJobStore();

    const receipt = await runSandboxCommand(store, { baseDir: base, image }, documents(), {
      jobId: "sandbox-2", dossierId: "dossierjobs", runId: `runtwo${randomUUID().slice(0, 6)}`, command: ["sh", "-c", "exit 3"],
    });

    expect(receipt.status).toBe("succeeded");
    expect(receipt.output).toMatchObject({ exitCode: 3 });
  }, 180_000);

  test("a run that passes its time limit is retryable", async () => {
    const store = new MemoryJobStore();

    const receipt = await runSandboxCommand(store, {
      baseDir: base, image, limits: { ...defaultRunLimits, timeoutMs: 4_000 },
    }, documents(), {
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
    }, documents(), {
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

