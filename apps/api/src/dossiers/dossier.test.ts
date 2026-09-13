import { describe, expect, test } from "vitest";
import { Elysia } from "elysia";

import { errorHandler } from "../errors";

import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";

function app() {
  return new Elysia({ prefix: "/api/v1" }).use(errorHandler)
    .use(createAccessRoutes(createDemoRepository(), createDemoIdentity(true, "test")));
}

function request(path: string, method = "GET", body?: unknown, user = "demo-member-alpha") {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      "x-demo-user": user,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("dossier projections", () => {
  test("creates from a pinned procedure and resumes with stable node IDs", async () => {
    const server = app();
    const create = await server.handle(request("/companies/company-alpha/dossiers", "POST", {
      procedureVersionId: "procedure-dgi-v1",
    }));
    expect(create.status).toBe(201);
    const first = await create.json() as { dossier: { id: string; version: number }; nodes: { id: string; dependencies: string[] }[] };
    expect(first.dossier.version).toBe(1);
    expect(first.nodes).toHaveLength(8);
    expect(first.nodes[0].dependencies).toEqual([]);

    const resumed = await server.handle(request("/companies/company-alpha/dossiers", "POST", {
      procedureVersionId: "procedure-dgi-v1",
      dossierId: first.dossier.id,
    }));
    expect(resumed.status).toBe(200);
    const second = await resumed.json() as { nodes: { id: string }[] };
    expect(second.nodes.map((node) => node.id)).toEqual(first.nodes.map((node) => node.id));

    const node = await server.handle(request(`/dossiers/${first.dossier.id}/nodes/${first.nodes[1].id}`));
    expect(node.status).toBe(200);
    const nodePayload = await node.json() as { sources: unknown[]; requirements: unknown[]; findings: unknown[]; allowedActions: string[] };
    expect(nodePayload.sources.length).toBeGreaterThan(0);
    expect(nodePayload.requirements.length).toBe(2);
    expect(nodePayload.findings).toHaveLength(0);
    expect(nodePayload.allowedActions).toContain("upload_evidence");
  });

  test("stores immutable uploads, supports replacements and invalidates findings", async () => {
    const server = app();
    const upload = await server.handle(request("/dossiers/dossier-alpha-dgi/documents", "POST", {
      nodeId: "node-alpha-dgi-document_evidence",
      filename: "tax.txt",
      mimeType: "text/plain",
      content: "first version",
      expectedVersion: 1,
    }));
    expect(upload.status).toBe(201);
    const first = await upload.json() as {
      document: { id: string; version: number; sha256: string; immutable: boolean; requirementIds: string[] };
      dossier: { version: number };
      invalidatedFindingIds: string[];
    };
    expect(first.document.version).toBe(1);
    expect(first.document.immutable).toBe(true);
    expect(first.document.sha256).toHaveLength(64);
    expect(first.document.requirementIds).toHaveLength(2);
    expect(first.dossier.version).toBe(2);
    expect(first.invalidatedFindingIds).toContain("finding-alpha-dgi");

    const replacement = await server.handle(request("/dossiers/dossier-alpha-dgi/documents", "POST", {
      nodeId: "node-alpha-dgi-document_evidence",
      filename: "tax-corrected.txt",
      mimeType: "text/plain",
      content: "corrected version",
      replacesDocumentId: first.document.id,
      expectedVersion: 2,
    }));
    expect(replacement.status).toBe(201);
    const second = await replacement.json() as { document: { id: string; version: number; replacesId: string } };
    expect(second.document.version).toBe(2);
    expect(second.document.replacesId).toBe(first.document.id);

    const original = await server.handle(request(`/documents/${first.document.id}`));
    const originalPayload = await original.json() as { originalText: string; version: number };
    expect(originalPayload.originalText).toBe("first version");
    expect(originalPayload.version).toBe(1);
  });

  test("rejects stale writes and invalidates findings after confirmed fact changes", async () => {
    const server = app();
    const facts = await server.handle(request("/dossiers/dossier-alpha-dgi/facts", "PATCH", {
      expectedVersion: 1,
      changes: { legalForm: "SARL" },
    }));
    expect(facts.status).toBe(200);
    const result = await facts.json() as { dossier: { version: number; confirmedFacts: Record<string, unknown> }; invalidatedFindingIds: string[] };
    expect(result.dossier.version).toBe(2);
    expect(result.dossier.confirmedFacts.legalForm).toBe("SARL");
    expect(result.invalidatedFindingIds).toContain("finding-alpha-dgi");

    const stale = await server.handle(request("/dossiers/dossier-alpha-dgi/facts", "PATCH", {
      expectedVersion: 1,
      changes: { headcount: 10 },
    }));
    expect(stale.status).toBe(409);
    expect(await stale.json()).toMatchObject({ error: { code: "version_conflict" } });
  });

  test("accepts lifecycle commands idempotently and keeps execution outside the API projection", async () => {
    const server = app();
    const command = {
      type: "review_requested",
      expectedVersion: 1,
      idempotencyKey: "review-alpha-dgi-1",
      nodeId: "node-alpha-dgi-document_evidence",
    };
    const first = await server.handle(request("/dossiers/dossier-alpha-dgi/commands", "POST", command));
    expect(first.status).toBe(202);
    const firstPayload = await first.json() as { commandId: string; status: string };
    expect(firstPayload.status).toBe("accepted");

    const retry = await server.handle(request("/dossiers/dossier-alpha-dgi/commands", "POST", command));
    expect(retry.status).toBe(202);
    const retryPayload = await retry.json() as { commandId: string };
    expect(retryPayload.commandId).toBe(firstPayload.commandId);

    const conflict = await server.handle(request("/dossiers/dossier-alpha-dgi/commands", "POST", {
      ...command,
      idempotencyKey: "review-alpha-dgi-2",
      expectedVersion: 2,
    }));
    expect(conflict.status).toBe(409);
  });
});
