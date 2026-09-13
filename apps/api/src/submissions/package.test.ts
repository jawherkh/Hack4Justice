import { describe, expect, test } from "vitest";
import { unzipSync } from "fflate";
import { Elysia } from "elysia";
import { createDemoDossierRepository, InMemoryDossierRepository } from "../dossiers/store";
import { createAccessRoutes } from "../access/routes";
import { createDemoIdentity } from "../access/identity";
import { errorHandler } from "../errors";
import { exportDossierPackage, packageChanges } from "./package";
import { SyntheticSubmissionAdapter } from "./receipts";
import type { SubmissionReceipt } from "./receipts";
import type { LifecycleCommandAcknowledgement } from "../dossiers/store";

const dossierId = "dossier-alpha-dgi";
const actorId = "demo-member-alpha";
const seed = () => createDemoDossierRepository();
const preview = (repository = seed()) => repository.dossierPackage(dossierId, { action: "submit" });

describe("versioned dossier packages", () => {
  test("pins rules, facts, findings, sources and current document versions without storage internals", () => {
    const snapshot = preview();
    expect(snapshot.gate.decision).toBe("allowed");
    expect(snapshot.procedure.id).toBe(snapshot.dossier.procedureVersionId);
    expect(snapshot.sources.length).toBeGreaterThan(0);
    expect(snapshot.documents.length).toBeGreaterThan(0);
    expect(snapshot.documents[0]).toMatchObject({ version: 1, immutable: true });
    expect(snapshot.documents[0]).not.toHaveProperty("originalText");
    expect(snapshot.documents[0]).not.toHaveProperty("storageRef");
    expect(snapshot).toMatchObject({ simulated: true, officialSubmission: false });
  });

  test("omitted evidence cannot borrow readiness from the full dossier", () => {
    const repository = seed();
    expect(repository.dossierPackage(dossierId, { action: "submit", documentIds: [] }).gate.decision).toBe(
      "blocked",
    );
    expect(() =>
      repository.dispatchCommand({
        dossierId,
        actorId,
        type: "submission_requested",
        expectedVersion: repository.dossier(dossierId)!.version,
        idempotencyKey: "omit",
        confirmed: true,
        submission: { documentIds: [] },
      }),
    ).toThrow(expect.objectContaining({ code: "prerequisite_blocked" }));
    expect(repository.submissions(dossierId)).toEqual([]);
  });

  test("rejects foreign, superseded, duplicate documents and an unrelated action node", () => {
    const repository = seed();
    const document = repository.dossierDetail(dossierId)!.evidence[0]!;
    repository.addDocument({ ...document, id: "replacement", version: 2, replacesId: document.id });
    for (const documentIds of [[document.id], ["foreign-document"], ["replacement", "replacement"]])
      expect(() => repository.dossierPackage(dossierId, { action: "submit", documentIds })).toThrow(
        expect.objectContaining({ code: "invalid_document_selection" }),
      );
    expect(() => repository.dossierPackage(dossierId, { action: "submit", nodeId: "foreign-node" })).toThrow(
      expect.objectContaining({ code: "action_not_available" }),
    );
    expect(preview(repository).documents.map((item) => item.id)).not.toContain(document.id);
  });

  test("omitting conflicting evidence cannot bypass the current dossier gate", () => {
    const repository = seed();
    const document = repository.dossierDetail(dossierId)!.evidence[0]!;
    repository.addDocument({ ...document, id: "conflicting-extra", reviewStatus: "needs_correction" });
    expect(
      repository.dossierPackage(dossierId, { action: "submit", documentIds: [document.id] }).gate.decision,
    ).toBe("blocked");
  });

  test("exports immutable original bytes and checks their checksum", async () => {
    const repository = seed();
    const snapshot = preview(repository);
    const exported = await exportDossierPackage(snapshot, "zip", async (document) =>
      new TextEncoder().encode(repository.document(document.id)!.originalText),
    );
    const files = unzipSync(new Uint8Array(await exported.arrayBuffer()));
    expect(JSON.parse(new TextDecoder().decode(files["manifest.json"]))).toEqual(snapshot);
    expect(Object.keys(files).length).toBe(snapshot.documents.length + 1);
    expect(exported.headers.get("cache-control")).toBe("no-store");
    await expect(
      exportDossierPackage(snapshot, "zip", async () => new Uint8Array([0])),
    ).rejects.toMatchObject({ code: "document_integrity_mismatch" });
    await expect(
      exportDossierPackage(
        { ...snapshot, documents: snapshot.documents.map((d) => ({ ...d, sizeBytes: 65 * 1024 * 1024 })) },
        "zip",
        async () => new Uint8Array(),
      ),
    ).rejects.toMatchObject({ code: "package_too_large" });
  });

  test("retries preserve one reference and snapshot across restart and later edits", () => {
    let repository = seed();
    const command = {
      dossierId,
      actorId,
      type: "submission_requested" as const,
      expectedVersion: repository.dossier(dossierId)!.version,
      idempotencyKey: "stable",
      confirmed: true,
    };
    const ack = repository.dispatchCommand(command);
    const receipt = repository.submissions(dossierId)[0]!;
    expect(receipt).toMatchObject({
      id: ack.submissionId,
      reference: ack.reference,
      status: "queued",
      officialSubmission: false,
    });
    repository = InMemoryDossierRepository.restore(repository.snapshot());
    repository.updateConfirmedFacts({
      dossierId,
      expectedVersion: command.expectedVersion,
      changes: { name: "Changed" },
    });
    expect(repository.dispatchCommand(command)).toEqual(ack);
    expect(repository.submissions(dossierId)).toEqual([receipt]);
    expect(() =>
      repository.dispatchCommand({ ...command, submission: { mode: "simulated_agency" } }),
    ).toThrow(expect.objectContaining({ code: "idempotency_conflict" }));
    expect(() => repository.dispatchCommand({ ...command, idempotencyKey: "new" })).toThrow(
      expect.objectContaining({ code: "version_conflict" }),
    );
    Object.assign(receipt.snapshot.documents[0]!, { filename: "local-copy-only" });
    expect(repository.submissions(dossierId)[0]!.snapshot.documents[0]!.filename).not.toBe("local-copy-only");
  });

  test("changed items identify versions, facts and rules without JSON property-order noise", () => {
    const previous = { ...preview(), confirmedFacts: { company: { a: 1, b: 2 }, removed: true } };
    const next = {
      ...previous,
      confirmedFacts: { company: { b: 2, a: 1 }, added: "new" },
      documents: previous.documents.map((d) => ({ ...d, id: "replacement", version: d.version + 1 })),
    };
    expect(packageChanges(previous, next)).toMatchObject({
      facts: [
        { key: "added", before: null, after: "new" },
        { key: "removed", before: true, after: null },
      ],
      documents: { added: ["replacement"], removed: previous.documents.map((d) => d.id) },
      findingsChanged: false,
      rulesChanged: false,
    });
  });

  test("the adapter is explicitly synthetic, scoped and idempotent", async () => {
    const adapter = new SyntheticSubmissionAdapter("DGI");
    const input = { idempotencyKey: "synthetic-only", snapshot: preview() };
    expect(await adapter.lookup(input.idempotencyKey)).toBeUndefined();
    const receipt = await adapter.submit(input);
    expect(receipt).toMatchObject({ simulated: true, status: "received" });
    expect(receipt.reference).toMatch(/^SIM-DGI-/);
    expect(await adapter.submit(input)).toEqual(receipt);
    expect(await adapter.lookup(input.idempotencyKey)).toEqual(receipt);
    await expect(
      adapter.submit({ ...input, snapshot: { ...input.snapshot, confirmedFacts: { changed: true } } }),
    ).rejects.toMatchObject({ code: "idempotency_conflict" });
    await expect(new SyntheticSubmissionAdapter("RNE").submit(input)).rejects.toThrow(
      "Agency scope mismatch",
    );
  });
});

describe("package and receipt routes", () => {
  const setup = () => {
    const repository = seed();
    const app = new Elysia()
      .use(errorHandler)
      .use(createAccessRoutes(repository, createDemoIdentity(true, "test")));
    const request = (path: string, body?: object, user = actorId) =>
      app.handle(
        new Request(`http://localhost/dossiers/${dossierId}${path}`, {
          method: body ? "POST" : "GET",
          headers: { "x-demo-user": user, ...(body ? { "content-type": "application/json" } : {}) },
          ...(body ? { body: JSON.stringify(body) } : {}),
        }),
      );
    const body = {
      action: "submit",
      expectedVersion: repository.dossier(dossierId)!.version,
      idempotencyKey: "route",
      confirmed: true,
    };
    return { repository, request, body };
  };

  test("requires explicit confirmation, rejects connected filing and protects company scope", async () => {
    const { request, body } = setup();
    expect((await request("/submissions", { ...body, confirmed: false })).status).toBe(422);
    expect((await request("/submissions", { ...body, mode: "connected_agency" })).status).toBe(422);
    for (const path of [
      "/package",
      "/package/export?format=zip",
      "/submissions",
      "/submissions/unknown",
      "/submissions/unknown/export",
    ])
      expect((await request(path, undefined, "demo-member-beta")).status).toBe(403);
    expect((await request("/submissions", body, "demo-member-beta")).status).toBe(403);
  });

  test("previews, queues once, lists receipts and exports the saved snapshot after edits", async () => {
    const { repository, request, body } = setup();
    expect((await request("/package")).status).toBe(200);
    expect((await request("/package/export?format=zip")).status).toBe(200);
    const response = await request("/submissions", body);
    expect(response.status).toBe(202);
    const ack = (await response.json()) as LifecycleCommandAcknowledgement;
    expect(await (await request("/submissions", body)).json()).toEqual(ack);
    const receipt = (await (await request(`/submissions/${ack.submissionId}`)).json()) as SubmissionReceipt;
    expect(receipt.status).toBe("queued");
    repository.updateConfirmedFacts({
      dossierId,
      expectedVersion: body.expectedVersion,
      changes: { changed: true },
    });
    expect(await (await request(`/submissions/${ack.submissionId}/export`)).json()).toEqual(receipt.snapshot);
    expect(await (await request("/submissions")).json()).toEqual([receipt]);
    expect((await request("/submissions/unknown/export")).status).toBe(404);
    expect((await request("/package?format=pdf")).status).toBe(422);
  });
});
