import { describe, expect, test } from "vitest";
import { Elysia } from "elysia";
import { createAccessRoutes } from "../access/routes";
import { createDemoIdentity } from "../access/identity";
import { createDemoDossierRepository } from "../dossiers/store";
import { transition } from "./state";
import type { PreparedCommand, LifecycleState, PrerequisiteObservation } from "./contracts";

const initial: LifecycleState = { version: 1, lifecycle: "draft", agencyAcceptance: "not_submitted", readiness: "unknown",
  prerequisiteStatus: "unknown", context: { prerequisites: {}, correctionNodeIds: [] } };
const observation: PrerequisiteObservation = { obligationId: "obligation-test", version: 1, status: "unfulfilled", ruleVersionId: "synthetic-rule",
  sourceRef: "synthetic-reference", expiresAt: "2030-02-01T00:00:00Z", actions: ["submission_requested"] };
function input(command: Partial<PreparedCommand["command"]> = {}, state = initial): PreparedCommand {
  return { reference: { dossierId: "dossier-test", commandId: "command-test" }, now: "2030-01-01T00:00:00Z", state,
    command: { dossierId: "dossier-test", actorId: "synthetic-member", expectedVersion: state.version, idempotencyKey: "test-command", type: "review_requested", ...command } };
}
function apply(command: Partial<PreparedCommand["command"]>, state = initial) {
  const result = transition(input(command, state));
  if ("error" in result) throw new Error(result.error);
  return result.state;
}

describe("dossier transitions", () => {
  test("review request preserves independent agency acceptance", () => {
    const next = apply({ type: "review_requested" });
    expect(next.lifecycle).toBe("active"); expect(next.agencyAcceptance).toBe("not_submitted");
  });
  test.each(["accept", "refuse"] as const)("correction and resubmission can finish with %s", (action) => {
    let state = apply({ type: "submission_requested", confirmed: true });
    state = apply({ type: "decision_recorded", decision: { action: "request_modification", reason: "Unreadable page", targetNodeIds: ["node-test"], evidenceIds: [] } }, state);
    expect(state.lifecycle).toBe("correction_requested"); expect(state.context.correctionNodeIds).toEqual(["node-test"]);
    state = apply({ type: "evidence_changed" }, state);
    expect(state.lifecycle).toBe("correction_requested");
    state = apply({ type: "resubmission_requested", confirmed: true }, state);
    state = apply({ type: "decision_recorded", decision: { action, reason: "Synthetic review", targetNodeIds: [], evidenceIds: [] } }, state);
    expect(state.lifecycle).toBe("closed"); expect(state.agencyAcceptance).toBe(action === "accept" ? "accepted" : "refused");
    expect(transition(input({ type: "cancellation_requested" }, state))).toEqual({ error: "dossier_closed" });
  });
  test("requires explicit confirmation and rejects illegal or stale transitions", () => {
    expect(transition(input({ type: "submission_requested" }))).toEqual({ error: "explicit_confirmation_required" });
    expect(transition(input({ type: "resubmission_requested", confirmed: true }))).toEqual({ error: "invalid_transition" });
    expect(transition(input({ expectedVersion: 99 }))).toEqual({ error: "version_conflict" });
    const pending = apply({ type: "submission_requested", confirmed: true });
    expect(transition(input({ type: "decision_recorded", decision: { action: "request_modification", reason: "fix", targetNodeIds: [], evidenceIds: [] } }, pending))).toEqual({ error: "correction_targets_required" });
  });
  test("unfulfilled, unknown, disputed and expired prerequisites do not permit covered submission", () => {
    for (const status of ["unfulfilled", "unknown", "disputed"] as const) {
      const state = apply({ type: "prerequisite_changed", prerequisite: { ...observation, status } });
      expect(transition(input({ type: "submission_requested", confirmed: true }, state))).toEqual({ error: status === "unfulfilled" ? "prerequisite_blocked" : "prerequisite_needs_review" });
      expect(apply({ type: "evidence_changed" }, state).readiness).toBe("needs_review");
      expect(apply({ type: "review_requested" }, state).agencyAcceptance).toBe("not_submitted");
    }
    const expired = apply({ type: "prerequisite_changed", prerequisite: { ...observation, status: "fulfilled", expiresAt: "2029-01-01T00:00:00Z" } });
    expect(transition(input({ type: "submission_requested", confirmed: true }, expired))).toEqual({ error: "prerequisite_needs_review" });
  });
  test("fresh observations clear the wait; stale observations cannot overwrite them", () => {
    let state = apply({ type: "prerequisite_changed", prerequisite: observation });
    state = apply({ type: "prerequisite_changed", prerequisite: { ...observation, version: 2, status: "fulfilled" } }, state);
    expect(transition(input({ type: "prerequisite_changed", prerequisite: observation }, state))).toEqual({ error: "stale_observation" });
    expect(apply({ type: "submission_requested", confirmed: true }, state).agencyAcceptance).toBe("pending");
  });
  test("a prerequisite does not block an unrelated action", () => {
    const state = apply({ type: "prerequisite_changed", prerequisite: { ...observation, actions: ["resubmission_requested"] } });
    expect(apply({ type: "submission_requested", confirmed: true }, state).agencyAcceptance).toBe("pending");
  });
  test("cancellation preserves review history state and prevents later changes", () => {
    const pending = apply({ type: "submission_requested", confirmed: true });
    const cancelled = apply({ type: "cancellation_requested" }, pending);
    expect(cancelled.agencyAcceptance).toBe("pending");
    expect(transition(input({ type: "evidence_changed" }, cancelled))).toEqual({ error: "dossier_closed" });
  });
  test("transitions are deterministic and do not mutate their inputs", () => {
    const prepared = input({ type: "prerequisite_changed", prerequisite: observation });
    const before = structuredClone(prepared);
    expect(transition(prepared)).toEqual(transition(prepared)); expect(prepared).toEqual(before);
  });
  test("nested decision payload changes cannot reuse an idempotency key", () => {
    const repository = createDemoDossierRepository();
    const dossier = repository.dossier("dossier-alpha-dgi")!;
    repository.addDossier({ ...dossier, lifecycle: "awaiting_review", agencyAcceptance: "pending" });
    repository.assignDossier({ dossierId: dossier.id, expectedVersion: 1, officerId: "synthetic-officer" });
    const command = { dossierId: dossier.id, actorId: "synthetic-officer", expectedVersion: 2, idempotencyKey: "same-key", type: "decision_recorded" as const,
      decision: { action: "accept" as const, reason: "One reason", targetNodeIds: [], evidenceIds: [] } };
    const first = repository.dispatchCommand(command);
    expect(repository.dispatchCommand({ ...command, decision: { ...command.decision } })).toEqual(first);
    let failure: unknown;
    try {
      repository.dispatchCommand({ ...command, decision: { ...command.decision, reason: "Changed reason" } });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "idempotency_conflict" });
  });
  test("business callers cannot forge decisions or service prerequisite observations", async () => {
    const app = new Elysia().use(createAccessRoutes(createDemoDossierRepository(), createDemoIdentity(true, "test")));
    const request = (body: unknown, actor = "demo-member-alpha") => app.handle(new Request("http://localhost/dossiers/dossier-alpha-dgi/commands", {
      method: "POST", headers: { "x-demo-user": actor, "content-type": "application/json" }, body: JSON.stringify(body),
    }));
    const common = { expectedVersion: 1, idempotencyKey: "access-test" };
    expect((await request({ ...common, type: "prerequisite_changed", prerequisite: observation })).status).toBe(422);
    expect((await request({ ...common, type: "decision_recorded", nodeId: "node-alpha-dgi-decision", decision: { action: "accept", reason: "claim" } })).status).toBe(403);
    expect((await request({ ...common, type: "review_requested" }, "demo-member-beta")).status).toBe(403);
  });
});
