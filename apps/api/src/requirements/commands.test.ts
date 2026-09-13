import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { FileStore } from "../dossiers/files";
import { PersistentRepository } from "../dossiers/persistent";
import {
  createDemoDossierRepository,
  InMemoryDossierRepository,
  type LifecycleCommandInput,
} from "../dossiers/store";
import { transition } from "../lifecycle/state";
import type { CommandResult } from "../lifecycle/contracts";

// An in-memory SQL double exercises the durable repository without opening a connection.
const database = vi.hoisted(() => ({
  snapshot: undefined as unknown,
  commands: new Map<string, { payload: LifecycleCommandInput; result: CommandResult }>(),
}));

vi.mock("postgres", () => {
  const unsafe = async (statement: string, parameters: unknown[] = []) => {
    if (statement.startsWith("SELECT snapshot")) return [{ snapshot: structuredClone(database.snapshot) }];
    if (statement.includes("repository SET snapshot")) {
      database.snapshot = structuredClone(parameters[0]);
      return [];
    }
    if (statement.includes("INSERT INTO") && statement.includes("lifecycle_commands")) {
      const id = parameters[0] as string;
      if (!database.commands.has(id))
        database.commands.set(id, {
          payload: structuredClone(parameters[2]) as LifecycleCommandInput,
          result: structuredClone(parameters[3]) as CommandResult,
        });
      return [];
    }
    if (statement.startsWith("SELECT") && statement.includes("lifecycle_commands")) {
      const row = database.commands.get(parameters[0] as string);
      return row ? [structuredClone(row)] : [];
    }
    if (statement.includes("lifecycle_commands SET result")) {
      database.commands.get(parameters[0] as string)!.result = structuredClone(
        parameters[1],
      ) as CommandResult;
      return [];
    }
    if (statement.includes("INSERT INTO") && statement.includes("lifecycle_events")) return [];
    throw new Error(`Unexpected offline query: ${statement}`);
  };
  return {
    default: () => ({
      unsafe,
      begin: async (run: (sql: { unsafe: typeof unsafe }) => Promise<unknown>) => run({ unsafe }),
      end: async () => {},
    }),
  };
});

const dossierId = "dossier-alpha-dgi";
const nodeId = "node-alpha-dgi-submission";
const now = "2030-01-01T00:00:00.000Z";

function observation() {
  return {
    id: "synthetic-submission-gate",
    companyId: "company-alpha",
    agency: "DGI" as const,
    consumerAgencies: [],
    sourceVersion: 1,
    status: "fulfilled" as const,
    authority: { agency: "DGI" as const, kind: "synthetic" as const, sourceId: "synthetic-registry" },
    evidence: { kind: "synthetic_fixture" as const, reference: "https://example.invalid/receipt" },
    effectiveAt: now,
    observedAt: now,
    recordedAt: now,
    expiresAt: "2030-01-01T00:01:00.000Z",
    verificationState: "synthetic" as const,
    ruleVersionId: "procedure-dgi-v1",
    relationships: [{ dossierId, nodeId, agency: "DGI" as const, action: "submit" as const }],
  };
}

function connect() {
  return new PersistentRepository(
    "postgres://example.invalid/offline",
    new FileStore("unused-offline-files"),
  );
}

async function enqueue(repository: PersistentRepository, idempotencyKey = "submit-test") {
  const dossier = (await repository.dossier(dossierId))!;
  const ack = await repository.dispatchCommand({
    dossierId,
    nodeId,
    actorId: "demo-member-alpha",
    type: "submission_requested",
    expectedVersion: dossier.version,
    confirmed: true,
    idempotencyKey,
  });
  return { dossierId, commandId: ack.commandId };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(now));
  database.snapshot = createDemoDossierRepository().snapshot();
  database.commands.clear();
});
afterEach(() => vi.useRealTimers());

describe("durable action gates", () => {
  test("rechecks expired authority between preparation and commit, including old prepared payloads", async () => {
    const repository = connect();
    await repository.recordObligationObservation(observation());
    const reference = await enqueue(repository);
    const prepared = (await repository.prepare(reference))!;
    expect(prepared.gate?.decision).toBe("allowed");
    const proposed = transition(prepared);
    expect(proposed).toHaveProperty("state");
    vi.setSystemTime(new Date(observation().expiresAt));
    const { gate: _gate, ...oldPayload } = prepared;
    const result = await repository.commit(oldPayload, proposed);
    expect(result).toMatchObject({ status: "rejected", error: "prerequisite_needs_review" });
    expect((await repository.dossier(dossierId))!.agencyAcceptance).toBe("not_submitted");
    expect((await repository.submissions(dossierId))[0]).toMatchObject({
      status: "rejected",
      error: "prerequisite_needs_review",
      officialSubmission: false,
    });
    expect((await repository.submissions(dossierId))[0]).not.toHaveProperty("delivery");
    expect(await repository.commit(prepared, proposed)).toEqual(result);
  });

  test("expiry before preparation rejects in the deterministic transition", async () => {
    const repository = connect();
    await repository.recordObligationObservation(observation());
    const reference = await enqueue(repository);
    vi.setSystemTime(new Date(observation().expiresAt));
    const prepared = (await repository.prepare(reference))!;
    expect(transition(prepared)).toEqual({ error: "prerequisite_needs_review" });
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({ status: "rejected" });
  });

  test("commits an unrelated submission despite an unresolved sibling-node observation", async () => {
    const seed = InMemoryDossierRepository.restore(
      database.snapshot as ReturnType<InMemoryDossierRepository["snapshot"]>,
    );
    const dossier = seed.dossier(dossierId)!;
    const original = seed.node(nodeId)!;
    const sibling = { ...original, id: "second-submission", procedureNodeKey: "second-submission" };
    const rule = seed.procedure(dossier.procedureVersionId)!;
    const definition = rule.nodes.find((node) => node.key === original.procedureNodeKey)!;
    seed.addProcedure(
      { ...rule, nodes: [...rule.nodes, { ...definition, key: sibling.procedureNodeKey }] },
      [],
    );
    seed.addNode(sibling);
    seed.addDossier({ ...dossier, nodeIds: [...dossier.nodeIds, sibling.id] });
    database.snapshot = seed.snapshot();
    const repository = connect();
    await repository.recordObligationObservation({
      ...observation(),
      status: "unfulfilled",
      relationships: [{ dossierId, nodeId: sibling.id, agency: "DGI", action: "submit" }],
    });
    expect((await repository.actionGate(dossierId, "submit", sibling.id)).decision).toBe("blocked");
    const reference = await enqueue(repository);
    const prepared = (await repository.prepare(reference))!;
    expect(Object.values(prepared.state.context.prerequisites)[0]!.status).toBe("unfulfilled");
    expect(prepared.gate?.decision).toBe("allowed");
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({ status: "completed" });
  });

  test("a version change between preparation and commit rejects the old submission", async () => {
    const repository = connect();
    const reference = await enqueue(repository);
    const prepared = (await repository.prepare(reference))!;
    await repository.updateConfirmedFacts({
      dossierId,
      expectedVersion: prepared.state.version,
      changes: { name: "Synthetic correction" },
      actorId: "demo-member-alpha",
    });
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({
      status: "rejected",
      error: "version_conflict",
    });
    expect((await repository.submissions(dossierId))[0]).toMatchObject({
      status: "rejected",
      error: "version_conflict",
    });
  });

  test("legacy queued commands are checked against current evidence at commit", async () => {
    const repository = connect();
    const reference = await enqueue(repository);
    const prepared = (await repository.prepare(reference))!;
    const seed = InMemoryDossierRepository.restore(
      database.snapshot as ReturnType<InMemoryDossierRepository["snapshot"]>,
    );
    const evidence = seed.dossierDetail(dossierId)!.evidence[0]!;
    seed.addDocument({ ...evidence, reviewStatus: "needs_correction" });
    database.snapshot = seed.snapshot();
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({
      status: "rejected",
      error: "prerequisite_blocked",
    });
  });

  test("completed commands remain idempotent after authority expiry", async () => {
    const repository = connect();
    await repository.recordObligationObservation(observation());
    const reference = await enqueue(repository);
    const prepared = (await repository.prepare(reference))!;
    const result = await repository.commit(prepared, transition(prepared));
    expect(result.status).toBe("completed");
    vi.setSystemTime(new Date(observation().expiresAt));
    expect(await connect().commit(prepared, transition(prepared))).toEqual(result);
    expect(await repository.prepare(reference)).toBeNull();
  });

  test("old queued commands with invalid targets are rejected without endless activity retries", async () => {
    const repository = connect();
    const reference = await enqueue(repository);
    const row = database.commands.get(reference.commandId)!;
    row.payload = { ...row.payload, nodeId: "missing-node" };
    const prepared = (await repository.prepare(reference))!;
    expect(transition(prepared)).toEqual({ error: "action_not_available" });
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({
      status: "rejected",
      error: "action_not_available",
    });
  });
});

describe("durable submission receipts", () => {
  test("completion preserves the queued snapshot, has no official delivery and survives restart", async () => {
    const repository = connect();
    const reference = await enqueue(repository);
    const queued = (await repository.submissions(dossierId))[0]!;
    expect(queued.status).toBe("queued");
    const prepared = (await repository.prepare(reference))!;
    const result = await repository.commit(prepared, transition(prepared));
    expect(result.status).toBe("completed");
    const receipt = (await connect().submissions(dossierId))[0]!;
    expect(receipt).toMatchObject({
      status: "completed",
      mode: "platform_review",
      officialSubmission: false,
      reference: queued.reference,
      snapshot: queued.snapshot,
    });
    expect(receipt).not.toHaveProperty("delivery");
    expect((await repository.dossier(dossierId))!.lifecycle).toBe("awaiting_review");
    expect(await connect().commit(prepared, transition(prepared))).toEqual(result);
    expect(await repository.submissions(dossierId)).toEqual([receipt]);
  });

  test("no confirmation produces a rejected attempt, never a simulated delivery", async () => {
    const repository = connect();
    const ack = await repository.dispatchCommand({
      dossierId,
      nodeId,
      actorId: "demo-member-alpha",
      type: "submission_requested",
      expectedVersion: (await repository.dossier(dossierId))!.version,
      idempotencyKey: "unconfirmed",
      submission: { mode: "simulated_agency" },
    });
    const prepared = (await repository.prepare(ack))!;
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({
      status: "rejected",
      error: "explicit_confirmation_required",
    });
    const receipt = (await repository.submissions(dossierId))[0]!;
    expect(receipt.status).toBe("rejected");
    expect(receipt).not.toHaveProperty("delivery");
  });

  test("a replacement invalidates a selected document while a queued package stays immutable", async () => {
    const repository = connect();
    const document = (await repository.dossierDetail(dossierId))!.evidence[0]!;
    const ack = await repository.dispatchCommand({
      dossierId,
      nodeId,
      actorId: "demo-member-alpha",
      type: "submission_requested",
      expectedVersion: (await repository.dossier(dossierId))!.version,
      idempotencyKey: "selected",
      confirmed: true,
      submission: { documentIds: [document.id] },
    });
    const prepared = (await repository.prepare(ack))!;
    const original = (await repository.submissions(dossierId))[0]!.snapshot;
    const seed = InMemoryDossierRepository.restore(
      database.snapshot as ReturnType<InMemoryDossierRepository["snapshot"]>,
    );
    seed.addDocument({ ...document, id: "replacement", replacesId: document.id, version: 2 });
    database.snapshot = seed.snapshot();
    expect(await repository.commit(prepared, transition(prepared))).toMatchObject({
      status: "rejected",
      error: "invalid_document_selection",
    });
    expect((await repository.submissions(dossierId))[0]!.snapshot).toEqual(original);
  });

  test("resubmission creates a new version with changed evidence and a clearly simulated receipt", async () => {
    const repository = connect();
    const first = await enqueue(repository);
    const prepared = (await repository.prepare(first))!;
    await repository.commit(prepared, transition(prepared));
    const original = (await repository.submissions(dossierId))[0]!;

    const detail = (await repository.dossierDetail(dossierId))!;
    const reviewNode = detail.nodes.find((node) => node.type === "human_review")!;
    await repository.assignDossier({
      dossierId,
      expectedVersion: detail.dossier.version,
      officerId: "synthetic-officer",
    });
    const review = await repository.dispatchCommand({
      dossierId,
      nodeId: reviewNode.id,
      type: "decision_recorded",
      actorId: "synthetic-officer",
      idempotencyKey: "corrections",
      expectedVersion: (await repository.dossier(dossierId))!.version,
      decision: {
        action: "request_modification",
        reason: "Synthetic correction",
        targetNodeIds: [detail.evidence[0]!.nodeId],
        evidenceIds: [detail.evidence[0]!.id],
      },
    });
    const reviewPrepared = (await repository.prepare(review))!;
    expect(await repository.commit(reviewPrepared, transition(reviewPrepared))).toMatchObject({
      status: "completed",
    });

    // Fixture represents a reviewed replacement; bytes and findings have already been verified.
    const seed = InMemoryDossierRepository.restore(
      database.snapshot as ReturnType<InMemoryDossierRepository["snapshot"]>,
    );
    const dossier = seed.dossier(dossierId)!;
    const document = detail.evidence[0]!;
    seed.addDocument({ ...document, id: "corrected-document", replacesId: document.id, version: 2 });
    seed.addDossier({
      ...dossier,
      version: dossier.version + 1,
      confirmedFacts: { ...dossier.confirmedFacts, correction: "verified" },
    });
    for (const finding of detail.findings)
      seed.addFinding({
        ...finding,
        validity: "current",
        evaluatedDossierVersion: dossier.version + 1,
        evidenceIds: finding.evidenceIds.map((id) => (id === document.id ? "corrected-document" : id)),
      });
    database.snapshot = seed.snapshot();

    const second = await repository.dispatchCommand({
      dossierId,
      nodeId,
      actorId: "demo-member-alpha",
      type: "resubmission_requested",
      expectedVersion: dossier.version + 1,
      idempotencyKey: "corrected",
      confirmed: true,
      submission: { mode: "simulated_agency" },
    });
    const secondPrepared = (await repository.prepare(second))!;
    expect(await repository.commit(secondPrepared, transition(secondPrepared))).toMatchObject({
      status: "completed",
    });
    const [receipt, previous] = await connect().submissions(dossierId);
    expect(previous).toEqual(original);
    expect(receipt).toMatchObject({
      version: 2,
      status: "completed",
      mode: "simulated_agency",
      officialSubmission: false,
      delivery: { simulated: true, status: "received" },
      changes: { documents: { added: ["corrected-document"], removed: [document.id] } },
    });
    expect(receipt!.delivery!.reference).toMatch(/^SIM-DGI-/);
    expect(receipt!.reference).not.toBe(original.reference);
    expect((await repository.dossier(dossierId))!.lifecycle).toBe("awaiting_review");
  });
});
