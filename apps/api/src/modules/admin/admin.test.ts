import { Elysia } from "elysia";
import { describe, expect, test } from "vitest";

import { createDemoRepository } from "../../access/fixtures";
import { createDemoIdentity } from "../../access/identity";
import { createAccessRoutes } from "../../access/routes";
import type { Agency } from "../../access/policy";
import type { LifecycleCommandInput } from "../../dossiers/store";
import { errorHandler } from "../../errors";
import { createAdminRoutes } from "./index";

const officerByAgency: Record<Agency, string> = {
  DGI: "demo-officer-dgi",
  RNE: "demo-officer-rne",
  APII: "demo-officer-apii",
};

function request(path: string, user: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/v1/admin${path}`, {
    method,
    headers: { "x-demo-user": user, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

function pendingRepository() {
  const repository = createDemoRepository();
  for (const agency of ["DGI", "RNE", "APII"] as const) {
    const dossier = repository.dossier(`dossier-alpha-${agency.toLowerCase()}`)!;
    repository.addDossier({
      ...dossier,
      lifecycle: "awaiting_review",
      agencyAcceptance: "pending",
      updatedAt: `2026-09-13T0${agency === "DGI" ? 1 : agency === "RNE" ? 2 : 3}:00:00.000Z`,
    });
  }
  const returned = repository.dossier("dossier-beta-dgi")!;
  repository.addDossier({
    ...returned,
    lifecycle: "correction_requested",
    agencyAcceptance: "modification_requested",
    updatedAt: "2026-09-13T04:00:00.000Z",
  });
  return repository;
}

function app(repository = pendingRepository()) {
  return new Elysia({ prefix: "/api/v1" })
    .use(errorHandler)
    .use(createAccessRoutes(repository, createDemoIdentity(true, "test")))
    .use(createAdminRoutes(repository, createDemoIdentity(true, "test")));
}

function genericRequest(path: string, user: string, method = "GET", body?: unknown) {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: { "x-demo-user": user, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("agency review workspace", () => {
  test.each(["DGI", "RNE", "APII"] as const)("isolates and paginates the %s queues", async (agency) => {
    const response = await app().handle(
      request(`/${agency.toLowerCase()}/queue?view=pending&page=1&limit=1`, officerByAgency[agency]),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      agency: Agency;
      data: { agency: Agency; agencyAcceptance: string }[];
      meta: { page: number; limit: number; total: number; totalPages: number };
      statusCounts: { recent: number; pending: number; returned: number };
    };
    expect(payload.agency).toBe(agency);
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({ agency, agencyAcceptance: "pending" });
    expect(payload.meta).toEqual({ page: 1, limit: 1, total: 1, totalPages: 1 });
    expect(payload.statusCounts).toMatchObject({ recent: 2, pending: 1, returned: agency === "DGI" ? 1 : 0 });
  });

  test("prevents officers and business members from crossing agency scopes", async () => {
    const server = app();
    const wrongAgency = await server.handle(request("/rne/queue", "demo-officer-dgi"));
    const businessMember = await server.handle(request("/dgi/queue", "demo-member-alpha"));
    const hiddenDossier = await server.handle(request("/dgi/dossiers/dossier-alpha-rne", "demo-officer-dgi"));
    expect(wrongAgency.status).toBe(403);
    expect(businessMember.status).toBe(403);
    expect(hiddenDossier.status).toBe(404);
  });

  test("excludes cancelled dossiers from actionable queues and counts", async () => {
    const repository = pendingRepository();
    const pending = repository.dossier("dossier-alpha-dgi")!;
    repository.addDossier({
      ...pending,
      lifecycle: "cancelled",
      assignedOfficerId: "demo-officer-dgi",
      assignedAt: "2026-09-13T05:00:00.000Z",
    });
    const returned = repository.dossier("dossier-beta-dgi")!;
    repository.addDossier({ ...returned, lifecycle: "cancelled" });
    const server = app(repository);

    for (const view of ["pending", "assigned", "returned"]) {
      const response = await server.handle(request(`/dgi/queue?view=${view}`, "demo-officer-dgi"));
      const payload = (await response.json()) as {
        data: unknown[];
        statusCounts: { pending: number; assigned: number; returned: number };
      };
      expect(payload.data).toHaveLength(0);
      expect(payload.statusCounts).toMatchObject({ pending: 0, assigned: 0, returned: 0 });
    }
  });

  test("claims a pending dossier exactly once and exposes it in the assigned queue", async () => {
    const repository = pendingRepository();
    const server = app(repository);
    const claim = await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/assignment", "demo-officer-dgi", "POST", {
        expectedVersion: 1,
      }),
    );
    expect(claim.status).toBe(200);
    expect(await claim.json()).toMatchObject({
      dossier: {
        id: "dossier-alpha-dgi",
        version: 2,
        assignedOfficerId: "demo-officer-dgi",
      },
    });

    const retry = await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/assignment", "demo-officer-dgi", "POST", {
        expectedVersion: 2,
      }),
    );
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({ dossier: { version: 2 } });

    const assigned = await server.handle(request("/dgi/queue?view=assigned", "demo-officer-dgi"));
    const assignedPayload = (await assigned.json()) as {
      data: { id: string }[];
      statusCounts: { assigned: number };
    };
    expect(assignedPayload.data.map(({ id }) => id)).toEqual(["dossier-alpha-dgi"]);
    expect(assignedPayload.statusCounts.assigned).toBe(1);

    try {
      repository.assignDossier({
        dossierId: "dossier-alpha-dgi",
        expectedVersion: 2,
        officerId: "another-dgi-officer",
      });
      throw new Error("Expected a competing assignment to fail");
    } catch (error) {
      expect(error).toMatchObject({ status: 409, code: "assignment_conflict" });
    }
  });

  test("returns the review evidence, source passages, prerequisites and decision history", async () => {
    const repository = pendingRepository();
    const dossier = repository.dossier("dossier-alpha-dgi")!;
    repository.addDossier({
      ...dossier,
      lifecycleContext: {
        correctionNodeIds: [],
        prerequisites: {
          registration: {
            obligationId: "registration",
            version: 2,
            status: "fulfilled",
            ruleVersionId: "rule-v2",
            sourceRef: "registry-event-2",
            expiresAt: "2027-09-13T00:00:00.000Z",
            actions: ["submission_requested"],
          },
        },
      },
    });
    repository.addDecision({
      companyId: dossier.companyId,
      dossierId: dossier.id,
      agency: dossier.agency,
      id: "decision-existing",
      nodeId: "node-alpha-dgi-human_review",
      actorId: "demo-officer-dgi",
      action: "request_modification",
      reason: "Replace the unreadable page",
      evidenceIds: ["document-alpha-dgi"],
      targetNodeIds: ["node-alpha-dgi-document_evidence"],
      dossierVersion: 1,
      createdAt: "2026-09-12T14:00:00.000Z",
    });

    const response = await app(repository).handle(
      request("/dgi/dossiers/dossier-alpha-dgi", "demo-officer-dgi"),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      documents: Record<string, unknown>[];
      findings: unknown[];
      sources: { passage: string }[];
      prerequisites: { obligationId: string; status: string }[];
      decisions: { actorId: string; reason: string; evidenceIds: string[] }[];
    };
    expect(payload.documents[0]).toMatchObject({ id: "document-alpha-dgi", version: 1 });
    expect(payload.documents[0]).not.toHaveProperty("originalText");
    expect(payload.documents[0]).not.toHaveProperty("storageRef");
    expect(payload.findings).toHaveLength(1);
    expect(payload.sources[0]?.passage).toBeTruthy();
    expect(payload.prerequisites).toContainEqual(
      expect.objectContaining({ obligationId: "registration", status: "fulfilled" }),
    );
    expect(payload.decisions).toContainEqual(
      expect.objectContaining({
        actorId: "demo-officer-dgi",
        reason: "Replace the unreadable page",
        evidenceIds: ["document-alpha-dgi"],
      }),
    );
  });

  test("validates and hands an auditable decision to the durable lifecycle", async () => {
    const repository = pendingRepository();
    let dispatched: LifecycleCommandInput | undefined;
    const dispatch = repository.dispatchCommand.bind(repository);
    repository.dispatchCommand = (input) => {
      dispatched = input;
      return dispatch(input);
    };
    const server = app(repository);
    await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/assignment", "demo-officer-dgi", "POST", {
        expectedVersion: 1,
      }),
    );
    const decision = {
      expectedVersion: 2,
      idempotencyKey: "decision-alpha-1",
      correlationId: "review-session-7",
      nodeId: "node-alpha-dgi-human_review",
      action: "request_modification",
      reason: "Replace the unreadable page",
      targetNodeIds: ["node-alpha-dgi-document_evidence"],
      evidenceIds: ["document-alpha-dgi"],
    };

    const accepted = await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", decision),
    );
    expect(accepted.status).toBe(202);
    const first = (await accepted.json()) as { commandId: string; status: string };
    expect(first.status).toBe("accepted");
    expect(dispatched).toMatchObject({
      dossierId: "dossier-alpha-dgi",
      actorId: "demo-officer-dgi",
      type: "decision_recorded",
      expectedVersion: 2,
      decision: {
        action: "request_modification",
        reason: "Replace the unreadable page",
        targetNodeIds: ["node-alpha-dgi-document_evidence"],
        evidenceIds: ["document-alpha-dgi"],
      },
    });

    const retry = await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", decision),
    );
    expect(((await retry.json()) as { commandId: string }).commandId).toBe(first.commandId);

    const conflict = await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", {
        ...decision,
        reason: "A different reason",
      }),
    );
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "idempotency_conflict" } });
  });

  test("enforces assignment through the shared command endpoint", async () => {
    const repository = pendingRepository();
    repository.assignDossier({
      dossierId: "dossier-alpha-dgi",
      expectedVersion: 1,
      officerId: "another-dgi-officer",
    });
    const response = await app(repository).handle(
      genericRequest("/dossiers/dossier-alpha-dgi/commands", "demo-officer-dgi", "POST", {
        expectedVersion: 2,
        idempotencyKey: "bypass-attempt",
        type: "decision_recorded",
        nodeId: "node-alpha-dgi-human_review",
        decision: { action: "accept", reason: "Attempted bypass" },
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: { code: "dossier_not_assigned" } });
  });

  test("rejects unassigned, stale and incorrectly scoped decisions", async () => {
    const repository = pendingRepository();
    const server = app(repository);
    const base = {
      expectedVersion: 1,
      idempotencyKey: "invalid-decision",
      nodeId: "node-alpha-dgi-human_review",
      action: "accept",
      reason: "Evidence is complete",
      targetNodeIds: [],
      evidenceIds: ["document-alpha-dgi"],
    };
    expect(
      (
        await server.handle(
          request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", base),
        )
      ).status,
    ).toBe(409);

    await server.handle(
      request("/dgi/dossiers/dossier-alpha-dgi/assignment", "demo-officer-dgi", "POST", {
        expectedVersion: 1,
      }),
    );
    expect(
      (
        await server.handle(
          request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-rne", "POST", {
            ...base,
            expectedVersion: 2,
          }),
        )
      ).status,
    ).toBe(403);
    expect(
      (
        await server.handle(
          request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", {
            ...base,
            expectedVersion: 2,
            evidenceIds: ["document-alpha-rne"],
          }),
        )
      ).status,
    ).toBe(422);
    expect(
      (
        await server.handle(
          request("/dgi/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", {
            ...base,
            expectedVersion: 1,
          }),
        )
      ).status,
    ).toBe(409);
  });
});
