import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { randomUUID } from "node:crypto";
import { mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import postgres from "postgres";
import { Elysia } from "elysia";
import { errorHandler } from "../errors";
import { createAccessRoutes } from "../access/routes";
import { createDemoIdentity } from "../access/identity";
import { FileStore, checksum } from "./files";
import { PersistentRepository } from "./persistent";
import type { DossierDetail, DocumentRecord } from "./store";

const url = process.env.TEST_DATABASE_URL;
const pdf = new TextEncoder().encode("%PDF-1.7\nsynthetic original\n%%EOF");
const base = { dossierId: "dossier-alpha-dgi", nodeId: "node-alpha-dgi-document_evidence",
  uploadedBy: "demo-member-alpha", filename: "original.pdf", mimeType: "application/pdf", expectedVersion: 1 };

async function rejected(promise: Promise<unknown>) {
  let failure: unknown;
  try { await promise; } catch (error) { failure = error; }
  expect(failure).toBeInstanceOf(Error);
  return failure as Error;
}

describe.skipIf(!url)("persistent API storage", () => {
  let schema: string;
  let directory: string;
  let repository: PersistentRepository;
  let connections: PersistentRepository[];
  function connect() {
    const connection = new PersistentRepository(url!, new FileStore(directory), schema);
    connections.push(connection);
    return connection;
  }
  beforeEach(async () => {
    schema = `test_uploads_${randomUUID().replaceAll("-", "")}`;
    directory = await mkdtemp(join(tmpdir(), "hack4justice-upload-test-"));
    connections = [];
    repository = connect();
    await repository.initialize(true);
  });
  afterEach(async () => {
    await Promise.all(connections.map((c) => c.close()));
    if (!/^test_uploads_[a-f0-9]{32}$/.test(schema)) throw new Error("Unexpected test schema");
    const sql = postgres(url!, { max: 1, onnotice: () => {} });
    try { await sql.unsafe(`DROP SCHEMA "${schema}" CASCADE`); } finally { await sql.end(); }
    const parent = await realpath(tmpdir());
    const target = await realpath(directory);
    if (!target.startsWith(parent + sep + "hack4justice-upload-test-") || resolve(target) === parent) throw new Error("Unexpected test directory");
    await rm(target, { recursive: true });
  });
  function server(connection = repository) {
    return new Elysia({ prefix: "/api/v1" }).use(errorHandler)
      .use(createAccessRoutes(connection, createDemoIdentity(true, "test")));
  }
  function request(path: string, user = "demo-member-alpha", method = "GET", body?: unknown) {
    return new Request(`http://localhost/api/v1${path}`, { method,
      headers: { "x-demo-user": user, ...(body ? { "content-type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  }
  function multipart(bytes = pdf, key = "upload-original", expectedVersion = 1, overrides: Record<string, string> = {}) {
    const form = new FormData();
    form.set("nodeId", base.nodeId);
    form.set("expectedVersion", String(expectedVersion));
    form.set("file", new File([bytes], "original.pdf", { type: "application/pdf" }));
    for (const [key, value] of Object.entries(overrides)) form.set(key, value);
    return new Request(`http://localhost/api/v1/dossiers/${base.dossierId}/documents`, {
      method: "POST", headers: { "x-demo-user": "demo-member-alpha", "idempotency-key": key }, body: form,
    });
  }

  test("creates and resumes the existing API shapes after closing every database connection", async () => {
    const created = await server().handle(request("/companies/company-alpha/dossiers", "demo-member-alpha", "POST", { procedureVersionId: "procedure-dgi-v1" }));
    expect(created.status).toBe(201);
    const first = await created.json() as DossierDetail;
    await repository.close();
    const restarted = connect();
    await restarted.initialize(true);
    const resumed = await server(restarted).handle(request("/companies/company-alpha/dossiers", "demo-member-alpha", "POST", {
      procedureVersionId: first.dossier.procedureVersionId, dossierId: first.dossier.id,
    }));
    expect(resumed.status).toBe(200);
    expect(await resumed.json()).toEqual(first);
    expect((await restarted.dossiers()).filter((d) => d.id === first.dossier.id)).toHaveLength(1);
    expect((await server(restarted).handle(request("/me"))).status).toBe(200);
  });

  test("persists real multipart bytes, retries once and keeps metadata compatible", async () => {
    const first = await server().handle(multipart());
    expect(first.status).toBe(201);
    const payload = await first.json() as {document: DocumentRecord; dossier: {version: number}; invalidatedFindingIds: string[]};
    expect(payload.document.sha256).toBe(checksum(pdf));
    expect(payload.document.sizeBytes).toBe(pdf.length);
    expect(payload.document.originalText).toBe("");
    expect(payload.document.requirementIds).toHaveLength(2);
    expect(payload.invalidatedFindingIds).toContain("finding-alpha-dgi");
    const retry = await server(connect()).handle(multipart());
    expect(retry.status).toBe(201);
    expect(await retry.json()).toEqual(payload);
    expect((await repository.dossier(base.dossierId))?.version).toBe(2);
    const downloaded = await server(connect()).handle(request(`/documents/${payload.document.id}/content`));
    expect(downloaded.status).toBe(200);
    expect(downloaded.headers.get("content-type")).toBe("application/pdf");
    expect(downloaded.headers.get("content-disposition")).toContain("attachment");
    expect(downloaded.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(pdf);
    expect((await server().handle(multipart(new TextEncoder().encode("%PDF-changed")))).status).toBe(409);
  });

  test("preserves every original and rejects duplicate replacement branches", async () => {
    const first = await repository.uploadFile({ ...base, bytes: pdf });
    const replacementBytes = new TextEncoder().encode("%PDF-corrected");
    const second = await repository.uploadFile({ ...base, bytes: replacementBytes, expectedVersion: 2, replacesDocumentId: first.document.id });
    expect(second.document.version).toBe(2);
    expect(second.document.replacesId).toBe(first.document.id);
    expect(await connect().readContent(first.document.id)).toEqual(Buffer.from(pdf));
    expect(await repository.readContent(second.document.id)).toEqual(Buffer.from(replacementBytes));
    expect(await rejected(repository.uploadFile({ ...base, bytes: pdf, expectedVersion: 3, replacesDocumentId: first.document.id }))).toMatchObject({ status: 409 });
    const sql = postgres(url!, { max: 1 });
    try {
      expect(await rejected(sql.unsafe(`UPDATE "${schema}".originals SET metadata='{}'::jsonb WHERE id=$1`, [first.document.id]))).toMatchObject({ code: "P0001" });
      expect(await rejected(sql.unsafe(`DELETE FROM "${schema}".originals WHERE id=$1`, [first.document.id]))).toMatchObject({ code: "P0001" });
    } finally { await sql.end(); }
  });

  test("only one concurrent write from independent API instances can commit a revision", async () => {
    const input = { dossierId: base.dossierId, expectedVersion: 1, changes: { headcount: 12 } };
    const results = await Promise.allSettled([repository.updateConfirmedFacts(input), connect().updateConfirmedFacts(input)]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const failure = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(failure.reason).toMatchObject({ status: 409, code: "version_conflict" });
    const detail = await repository.dossierDetail(base.dossierId);
    expect(detail?.dossier.version).toBe(2);
    expect(detail?.dossier.agencyAcceptance).toBe("not_submitted");
    expect(detail?.findings.find((f) => f.id === "finding-alpha-dgi")?.validity).toBe("stale");
  });

  test("persists command acknowledgements and deduplicates after restarting", async () => {
    const command = { dossierId: base.dossierId, type: "review_requested" as const, expectedVersion: 1,
      idempotencyKey: "review", actorId: base.uploadedBy, nodeId: base.nodeId };
    const first = await repository.dispatchCommand(command);
    await repository.close();
    const restarted = connect();
    expect(await restarted.dispatchCommand(command)).toEqual(first);
    expect(await rejected(restarted.dispatchCommand({ ...command, expectedVersion: 2 }))).toMatchObject({ code: "idempotency_conflict" });
    expect((await restarted.dossier(base.dossierId))?.agencyAcceptance).toBe("not_submitted");
  });

  test("keeps JSON text uploads working and persists their original UTF-8 bytes", async () => {
    const response = await server().handle(request(`/dossiers/${base.dossierId}/documents`, "demo-member-alpha", "POST", {
      nodeId: base.nodeId, filename: "evidence.txt", mimeType: "text/plain", content: "وثيقة عربية", expectedVersion: 1,
    }));
    expect(response.status).toBe(201);
    const result = await response.json() as {document: DocumentRecord};
    expect(result.document.originalText).toBe("وثيقة عربية");
    expect(new TextDecoder().decode(await connect().readContent(result.document.id))).toBe("وثيقة عربية");
  });

  test("enforces membership and agency permissions on persisted downloads and writes", async () => {
    const uploaded = await repository.uploadFile({ ...base, bytes: pdf });
    for (const user of ["demo-member-beta", "demo-officer-rne", "demo-rule-maintainer"]) {
      expect((await server().handle(request(`/documents/${uploaded.document.id}/content`, user))).status).toBe(403);
    }
    expect((await server().handle(request(`/documents/${uploaded.document.id}/content`, "demo-officer-dgi"))).status).toBe(200);
    expect((await server().handle(request(`/documents/${uploaded.document.id}/content`, "invented-user"))).status).toBe(401);
    const req = multipart(pdf, "forged", 2);
    req.headers.set("x-demo-user", "demo-officer-dgi");
    expect((await server().handle(req)).status).toBe(403);
    expect((await repository.dossier(base.dossierId))?.version).toBe(2);
  });

  test("rejects disguised, empty, oversized files and malformed multipart fields without mutation", async () => {
    expect((await server().handle(multipart(new TextEncoder().encode("not a PDF")))).status).toBe(415);
    expect((await server().handle(multipart(new Uint8Array()))).status).toBe(422);
    expect((await server().handle(multipart(pdf, "bad-links", 1, { requirementIds: "not-json" }))).status).toBe(422);
    expect((await server().handle(multipart(pdf, "bad-version", 1, { expectedVersion: "abc" }))).status).toBe(422);
    expect(await rejected(repository.uploadFile({ ...base, bytes: new Uint8Array(20 * 1024 * 1024 + 1) }))).toMatchObject({ status: 413 });
    expect((await repository.dossier(base.dossierId))?.version).toBe(1);
  });

  test("detects corrupted stored bytes and leaves metadata unchanged", async () => {
    const uploaded = await repository.uploadFile({ ...base, bytes: pdf });
    const key = uploaded.document.storageRef.slice("file://".length);
    await writeFile(join(directory, key), "tampered");
    const response = await server().handle(request(`/documents/${uploaded.document.id}/content`));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: { code: "file_integrity_failure" } });
    expect((await repository.document(uploaded.document.id))?.sha256).toBe(checksum(pdf));
  });

  test("a failed file write rolls back the revision and document metadata", async () => {
    const occupied = join(directory, "occupied");
    await writeFile(occupied, "not a directory");
    const broken = new PersistentRepository(url!, new FileStore(occupied), schema);
    connections.push(broken);
    await rejected(broken.uploadFile({ ...base, bytes: pdf }));
    expect((await repository.dossier(base.dossierId))?.version).toBe(1);
    expect((await repository.dossierDetail(base.dossierId))?.evidence).toHaveLength(1);
    const valid = await repository.uploadFile({ ...base, bytes: pdf });
    expect(valid.detail.dossier.version).toBe(2);
  });
});
