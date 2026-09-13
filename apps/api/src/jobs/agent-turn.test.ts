import { describe, expect, test } from "vitest";
import { CancelledFailure } from "@temporalio/activity";
import { randomUUID } from "node:crypto";

import type { AgentActivities, AgentTurnWorkflowInput } from "../lifecycle/contracts";
import { withDurableTurns } from "./agent-turn";
import type { JobReceipt, JobRequest, JobStore } from "./contracts";

class MemoryJobStore implements JobStore {
  readonly receipts: JobReceipt[] = [];

  async findReceipt(jobId: string) {
    const found = this.receipts.find((receipt) => receipt.jobId === jobId);
    return found ? { ...found } : undefined;
  }

  async claim(request: JobRequest, startedAt: string) {
    if (this.receipts.some((receipt) => receipt.jobId === request.jobId)) throw new Error("duplicate job id");
    const receipt: JobReceipt = {
      jobId: request.jobId, dossierId: request.dossierId, kind: request.kind,
      status: "running", attempts: 1, startedAt, updatedAt: startedAt,
    };
    this.receipts.push(receipt);
    return { ...receipt };
  }

  async complete(jobId: string, outcome: Pick<JobReceipt, "status" | "output" | "error" | "retryable">) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId)!;
    Object.assign(receipt, outcome, { updatedAt: new Date().toISOString() });
    return { ...receipt };
  }

  async reattempt(jobId: string, expectedAttempts: number) {
    const receipt = this.receipts.find((candidate) => candidate.jobId === jobId);
    if (!receipt || receipt.attempts !== expectedAttempts) return undefined;
    receipt.attempts += 1;
    receipt.status = "running";
    return { ...receipt };
  }

  async abandoned(olderThan: string) {
    return this.receipts.filter((receipt) => receipt.status === "running" && receipt.updatedAt < olderThan);
  }
}

const turn = (overrides: Partial<AgentTurnWorkflowInput> = {}): AgentTurnWorkflowInput => ({
  dossierId: "dossier-1",
  principal: { id: "member-1", roles: ["business_member"], companyIds: ["company-1"] } as AgentTurnWorkflowInput["principal"],
  message: "Quelles pieces manquent ?",
  sessionId: "session-1",
  ...overrides,
});

const answering = (onCall?: () => void): AgentActivities => ({
  async runAgentTurn(input) {
    onCall?.();
    return { sessionId: input.sessionId, finalOutput: "Il manque l'attestation.", interrupted: false };
  },
});

/** An error shaped like a provider outage. */
const outage = () => Object.assign(new Error("fetch failed"), { status: 503 });

describe("durable agent turns", () => {
  test("answers a repeated turn from what the first attempt produced", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const durable = withDurableTurns(answering(() => { calls += 1; }), store, { turnKey: "turn-1" });

    const first = await durable.runAgentTurn(turn());
    const again = await durable.runAgentTurn(turn());

    // The model is called once; the second ask is answered from the record.
    expect(calls).toBe(1);
    expect(again).toEqual(first);
    expect(store.receipts).toHaveLength(1);
  });

  test("two workers handed the same turn call the model once", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const durable = withDurableTurns(answering(() => { calls += 1; }), store, { turnKey: "turn-race" });

    const outcomes = await Promise.allSettled([durable.runAgentTurn(turn()), durable.runAgentTurn(turn())]);

    expect(calls).toBe(1);
    // One worker answers; the other is told the turn is already being answered, so the
    // workflow retries and reads that answer instead of asking the model again.
    const settled = outcomes.map((outcome) => outcome.status);
    expect(settled).toContain("fulfilled");
    const rejected = outcomes.find((outcome) => outcome.status === "rejected");
    expect((rejected as PromiseRejectedResult | undefined)?.reason?.message).toBe("agent_turn_in_progress");

    // The retry then finds the stored answer without a second model call.
    const retried = await durable.runAgentTurn(turn());
    expect(calls).toBe(1);
    expect(retried.finalOutput).toBe("Il manque l'attestation.");
  });

  test("a provider outage is retried and continues the same session", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const flaky: AgentActivities = {
      async runAgentTurn(input) {
        calls += 1;
        if (calls === 1) throw outage();
        return { sessionId: input.sessionId, finalOutput: "reprise", interrupted: false };
      },
    };
    const durable = withDurableTurns(flaky, store, { turnKey: "turn-retry" });

    await expect(durable.runAgentTurn(turn())).rejects.toThrow();
    const second = await durable.runAgentTurn(turn());

    expect(calls).toBe(2);
    expect(second.sessionId).toBe("session-1");
    expect(store.receipts).toHaveLength(1);
    expect(store.receipts[0]!.attempts).toBe(2);
  });

  test("a refusal is not retried, because the answer would not change", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const refusing: AgentActivities = {
      async runAgentTurn() {
        calls += 1;
        throw Object.assign(new Error("procedure_version_not_pinned"), { status: 422 });
      },
    };
    const durable = withDurableTurns(refusing, store, { turnKey: "turn-refused" });

    await expect(durable.runAgentTurn(turn())).rejects.toThrow();
    await expect(durable.runAgentTurn(turn())).rejects.toThrow();

    // One call, then the stored refusal: a permanent failure does not spend a second turn.
    expect(calls).toBe(1);
    expect(store.receipts[0]!.retryable).toBeFalsy();
  });

  test("a failure is raised, not returned as a successful-looking result", async () => {
    const store = new MemoryJobStore();
    const failing: AgentActivities = {
      async runAgentTurn() { throw new Error("model_refused"); },
    };
    const durable = withDurableTurns(failing, store, { turnKey: `turn-${randomUUID()}` });

    await expect(durable.runAgentTurn(turn())).rejects.toThrow(/model_refused/);
  });

  test("a cancelled turn is reported as cancelled, not as something to retry", async () => {
    const store = new MemoryJobStore();
    const controller = new AbortController();
    controller.abort();
    let calls = 0;
    const durable = withDurableTurns(answering(() => { calls += 1; }), store, { turnKey: "turn-cancelled", signal: controller.signal });

    // The model is never asked, and the boundary reports a cancellation rather than a
    // failure the service would retry.
    await expect(durable.runAgentTurn(turn())).rejects.toThrow(CancelledFailure);
    expect(calls).toBe(0);
  });

  test("a refusal is reported as not worth retrying", async () => {
    const store = new MemoryJobStore();
    const refusing: AgentActivities = {
      async runAgentTurn() { throw Object.assign(new Error("procedure_version_not_pinned"), { status: 422 }); },
    };
    const durable = withDurableTurns(refusing, store, { turnKey: "turn-nonretry" });

    await expect(durable.runAgentTurn(turn())).rejects.toMatchObject({ nonRetryable: true });
  });

  test("the answer survives a worker restart", async () => {
    const store = new MemoryJobStore();
    let calls = 0;
    const key = "turn-restart";

    const before = withDurableTurns(answering(() => { calls += 1; }), store, { turnKey: key });
    const answer = await before.runAgentTurn(turn());

    // A different worker process, with no memory of the first, is handed the same turn.
    const after = withDurableTurns(answering(() => { calls += 1; }), store, { turnKey: key });
    const resumed = await after.runAgentTurn(turn());

    expect(calls).toBe(1);
    expect(resumed).toEqual(answer);
  });
});
