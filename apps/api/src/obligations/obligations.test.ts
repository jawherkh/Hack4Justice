import { Elysia } from "elysia";
import { afterEach, describe, expect, test, vi } from "vitest";
import { invokeFunctionTool, RunContext } from "@openai/agents";

import { createDemoIdentity } from "../access/identity";
import { createAccessRoutes } from "../access/routes";
import { getDossierContextTool, runChecksTool } from "../agent/tools";
import { createAdminRoutes } from "../modules/admin/index";
import {
  createDemoDossierRepository,
  InMemoryDossierRepository,
  type DossierRecord,
} from "../dossiers/store";
import { errorHandler } from "../errors";
import { transition } from "../lifecycle/state";
import {
  ingestObligationObservation,
  SyntheticObligationAdapter,
  type AuthorizedAgencyObligationAdapter,
} from "./adapters";
import type { ObligationStatus } from "./contracts";
import { createObligationRoutes } from "./routes";

const now = "2026-09-13T10:00:00.000Z";
const ruleVersionId = "procedure-rne-approved-v2";
const dossierId = "dossier-alpha-rne-approved";
const nodeId = "node-alpha-rne-approved-submission";

afterEach(() => vi.useRealTimers());

function repositoryWithApprovedRule(
  status: "approved" | "candidate" = "approved",
): InMemoryDossierRepository {
  const repository = createDemoDossierRepository();
  const templateRule = repository.procedure("procedure-rne-v1")!;
  const templateDossier = repository.dossier("dossier-alpha-rne")!;
  const templateNode = repository.node("node-alpha-rne-submission")!;
  repository.addProcedure(
    {
      ...templateRule,
      id: ruleVersionId,
      version: "2",
      status,
      requirements: [],
      nodes: templateRule.nodes,
    },
    [],
  );
  repository.addNode({
    ...templateNode,
    id: nodeId,
    dossierId,
    procedureVersionId: ruleVersionId,
    version: 1,
    blockers: [],
  });
  repository.addDossier({
    ...templateDossier,
    id: dossierId,
    dossierId,
    procedureVersionId: ruleVersionId,
    nodeIds: [nodeId],
    version: 1,
    lifecycleContext: { prerequisites: {}, correctionNodeIds: [] },
  });
  return repository;
}

function adapter(
  status: ObligationStatus,
  version = 1,
  obligationId = `obligation-${status}`,
): AuthorizedAgencyObligationAdapter {
  return {
    kind: "authorized_agency",
    id: "dgi-authorized-registry",
    agency: "DGI",
    async observe(query) {
      expect(query.obligationId).toBe(obligationId);
      return {
        version,
        status,
        evidence: { kind: "official_record", reference: `DGI-REF-${version}` },
        effectiveAt: "2026-09-01T00:00:00.000Z",
        observedAt: "2026-09-13T09:55:00.000Z",
        expiresAt: "2026-12-31T23:59:59.000Z",
        verificationState: "verified",
      };
    },
  };
}

function ingest(
  repository: InMemoryDossierRepository,
  source: AuthorizedAgencyObligationAdapter | SyntheticObligationAdapter,
  obligationId: string,
) {
  return ingestObligationObservation(repository, source, {
    obligationId,
    companyId: "company-alpha",
    consumerAgencies: ["RNE"],
    ruleVersionId,
    relationships: [{ dossierId, nodeId, agency: "RNE", action: "submit" }],
    recordedAt: now,
  });
}

function app(repository: InMemoryDossierRepository) {
  return new Elysia({ prefix: "/api/v1" })
    .use(errorHandler)
    .use(createAccessRoutes(repository, createDemoIdentity(true, "test")))
    .use(createAdminRoutes(repository, createDemoIdentity(true, "test")))
    .use(createObligationRoutes(repository, createDemoIdentity(true, "test")));
}

function request(path: string, user: string, method = "GET", body?: object) {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: {
      "x-demo-user": user,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("authoritative obligation observations", () => {
  for (const status of ["fulfilled", "unfulfilled", "unknown", "disputed"] as const) {
    test(`stores ${status} with authority, evidence, freshness and verification`, async () => {
      const repository = repositoryWithApprovedRule();
      const obligationId = `obligation-${status}`;
      const result = await ingest(repository, adapter(status), obligationId);

      expect(result).toMatchObject({
        applied: true,
        record: {
          id: obligationId,
          status,
          version: 1,
          authority: { agency: "DGI", kind: "authorized_agency", sourceId: "dgi-authorized-registry" },
          evidence: { kind: "official_record", reference: "DGI-REF-1" },
          effectiveAt: "2026-09-01T00:00:00.000Z",
          expiresAt: "2026-12-31T23:59:59.000Z",
          verificationState: "verified",
          ruleVersionStatus: "approved",
          simulated: false,
        },
        event: { id: `obligation:${obligationId}:v1`, version: 1, sourceVersion: 1 },
      });
      expect(repository.obligationEvents(obligationId, 0)).toHaveLength(1);
    });
  }

  test("publishes stable versions, ignores stale observations and updates affected gates", async () => {
    const repository = repositoryWithApprovedRule();
    const obligationId = "obligation-tax-clearance";
    const first = await ingest(repository, adapter("fulfilled", 2, obligationId), obligationId);
    const dossierVersion = repository.dossier(dossierId)!.version;
    const stale = await ingest(repository, adapter("unfulfilled", 1, obligationId), obligationId);

    expect(first.event).toMatchObject({
      id: "obligation:obligation-tax-clearance:v1",
      version: 1,
      sourceVersion: 2,
    });
    expect(stale).toMatchObject({ applied: false, reason: "stale_or_duplicate" });
    expect(stale.event).toBeUndefined();
    expect(repository.obligationEvents(obligationId, 0).map((event) => event.version)).toEqual([1]);
    expect(repository.dossier(dossierId)!.version).toBe(dossierVersion);
    expect(repository.dossier(dossierId)!.lifecycleContext?.prerequisites[obligationId]).toMatchObject({
      status: "fulfilled",
      actions: ["submission_requested"],
    });
    expect(repository.node(nodeId)!.blockers).toContainEqual(
      expect.objectContaining({ obligationId, action: "submit", status: "satisfied" }),
    );
  });

  test("keeps dependency relationships stable and aggregates all blockers on a node", async () => {
    const repository = repositoryWithApprovedRule();
    await ingest(repository, adapter("unfulfilled", 1, "obligation-blocking"), "obligation-blocking");
    await ingest(repository, adapter("fulfilled", 1, "obligation-fulfilled"), "obligation-fulfilled");
    expect(repository.node(nodeId)).toMatchObject({
      prerequisiteStatus: "unsatisfied",
      blockers: [
        expect.objectContaining({ obligationId: "obligation-blocking", status: "unsatisfied" }),
        expect.objectContaining({ obligationId: "obligation-fulfilled", status: "satisfied" }),
      ],
    });

    await expect(
      ingestObligationObservation(repository, adapter("fulfilled", 2, "obligation-blocking"), {
        obligationId: "obligation-blocking",
        companyId: "company-alpha",
        consumerAgencies: [],
        ruleVersionId,
        relationships: [{ dossierId, nodeId, agency: "RNE", action: "submit" }],
        recordedAt: now,
      }),
    ).rejects.toMatchObject({ code: "obligation_relationship_conflict" });
  });

  test("activates a future-effective observation when the gated action is attempted later", async () => {
    const repository = repositoryWithApprovedRule();
    const obligationId = "obligation-future-effective";
    const futureAdapter: AuthorizedAgencyObligationAdapter = {
      kind: "authorized_agency",
      id: "dgi-authorized-registry",
      agency: "DGI",
      async observe() {
        return {
          version: 1,
          status: "fulfilled",
          evidence: { kind: "official_record", reference: "DGI-FUTURE-1" },
          effectiveAt: "2026-09-14T00:00:00.000Z",
          observedAt: "2026-09-13T09:55:00.000Z",
          expiresAt: "2026-12-31T23:59:59.000Z",
          verificationState: "verified",
        };
      },
    };
    await ingest(repository, futureAdapter, obligationId);
    const dossier = repository.dossier(dossierId)!;
    expect(dossier.prerequisiteStatus).toBe("unknown");

    const result = transition({
      reference: { dossierId, commandId: "future-effective-submit" },
      command: {
        dossierId,
        type: "submission_requested",
        expectedVersion: dossier.version,
        idempotencyKey: "future-effective-submit",
        actorId: "demo-member-alpha",
        confirmed: true,
      },
      state: {
        version: dossier.version,
        lifecycle: dossier.lifecycle,
        agencyAcceptance: dossier.agencyAcceptance,
        readiness: dossier.readiness,
        prerequisiteStatus: dossier.prerequisiteStatus,
        context: dossier.lifecycleContext!,
      },
      now: "2026-09-15T00:00:00.000Z",
    });
    expect(result).toMatchObject({
      state: { agencyAcceptance: "pending", prerequisiteStatus: "satisfied" },
    });
  });

  test("degrades the legacy dependency projection after an obligation expires", async () => {
    const repository = repositoryWithApprovedRule();
    const obligationId = "obligation-expired-dependency";
    const historicalAdapter: AuthorizedAgencyObligationAdapter = {
      kind: "authorized_agency",
      id: "dgi-authorized-registry",
      agency: "DGI",
      async observe() {
        return {
          version: 1,
          status: "fulfilled",
          evidence: { kind: "official_record", reference: "DGI-HISTORICAL-1" },
          effectiveAt: "1999-01-01T00:00:00.000Z",
          observedAt: "1999-06-01T00:00:00.000Z",
          expiresAt: "2000-01-01T00:00:00.000Z",
          verificationState: "verified",
        };
      },
    };
    await ingestObligationObservation(repository, historicalAdapter, {
      obligationId,
      companyId: "company-alpha",
      consumerAgencies: ["RNE"],
      ruleVersionId,
      relationships: [{ dossierId, nodeId, agency: "RNE", action: "submit" }],
      recordedAt: "1999-07-01T00:00:00.000Z",
    });

    expect(repository.obligation(obligationId)?.status).toBe("fulfilled");
    expect(repository.dependency(obligationId)?.status).toBe("unknown");
    expect(repository.dependencies("company-alpha", "RNE")).toContainEqual(
      expect.objectContaining({ id: obligationId, status: "unknown" }),
    );
  });

  test("keeps the hackathon adapter and rules explicitly synthetic", async () => {
    const repository = createDemoDossierRepository();
    const obligationId = "obligation-synthetic-registration";
    const source = new SyntheticObligationAdapter("fixture-adapter", "DGI", [
      {
        obligationId,
        companyId: "company-alpha",
        version: 1,
        status: "fulfilled",
        evidence: { kind: "synthetic_fixture", reference: "synthetic://registration/1" },
        effectiveAt: "2026-09-01T00:00:00.000Z",
        observedAt: "2026-09-13T09:55:00.000Z",
        expiresAt: "2026-12-31T23:59:59.000Z",
        verificationState: "synthetic",
      },
    ]);
    const result = await ingestObligationObservation(repository, source, {
      obligationId,
      companyId: "company-alpha",
      consumerAgencies: ["RNE"],
      ruleVersionId: "procedure-rne-v1",
      relationships: [
        {
          dossierId: "dossier-alpha-rne",
          nodeId: "node-alpha-rne-submission",
          agency: "RNE",
          action: "submit",
        },
      ],
      recordedAt: now,
    });

    expect(result.record).toMatchObject({
      simulated: true,
      verificationState: "synthetic",
      ruleVersionStatus: "synthetic",
      authority: { kind: "synthetic" },
      evidence: { kind: "synthetic_fixture" },
    });
  });

  test("rejects an authoritative relationship that cites an unapproved rule version", async () => {
    await expect(
      ingest(
        repositoryWithApprovedRule("candidate"),
        adapter("fulfilled", 1, "obligation-unapproved-rule"),
        "obligation-unapproved-rule",
      ),
    ).rejects.toMatchObject({ code: "obligation_rule_or_source_not_authoritative" });
  });

  test("round-trips obligation records and their event stream through repository snapshots", async () => {
    const repository = repositoryWithApprovedRule();
    const obligationId = "obligation-persisted";
    await ingest(repository, adapter("fulfilled", 1, obligationId), obligationId);

    const restored = InMemoryDossierRepository.restore(repository.snapshot());
    expect(restored.obligation(obligationId)).toEqual(repository.obligation(obligationId));
    expect(restored.obligationEvents(obligationId, 0)).toEqual(repository.obligationEvents(obligationId, 0));
  });

  test("an uploaded document cannot assert an official obligation status", async () => {
    const repository = createDemoDossierRepository();
    repository.uploadDocument({
      dossierId: "dossier-alpha-dgi",
      nodeId: "node-alpha-dgi-document_evidence",
      filename: "claim.txt",
      mimeType: "text/plain",
      content: "Unverified user claim",
      expectedVersion: 1,
      uploadedBy: "demo-member-alpha",
    });
    expect(repository.obligation("obligation-from-upload")).toBeUndefined();

    const invalidAdapter = {
      ...adapter("fulfilled", 1, "obligation-from-upload"),
      async observe() {
        return {
          version: 1,
          status: "fulfilled",
          evidence: { kind: "uploaded_document", reference: "document-alpha-dgi" },
          effectiveAt: "2026-09-01T00:00:00.000Z",
          observedAt: "2026-09-13T09:55:00.000Z",
          expiresAt: "2026-12-31T23:59:59.000Z",
          verificationState: "verified",
        };
      },
    } as unknown as AuthorizedAgencyObligationAdapter;
    await expect(
      ingest(repositoryWithApprovedRule(), invalidAdapter, "obligation-from-upload"),
    ).rejects.toMatchObject({ code: "invalid_obligation_observation" });
  });
});

function submit(dossier: DossierRecord, at: string) {
  return transition({
    reference: { dossierId: dossier.id, commandId: "test-submission" },
    command: {
      dossierId: dossier.id,
      type: "submission_requested",
      expectedVersion: dossier.version,
      idempotencyKey: "test-submission",
      actorId: "demo-member-alpha",
      confirmed: true,
    },
    state: {
      version: dossier.version,
      lifecycle: dossier.lifecycle,
      agencyAcceptance: dossier.agencyAcceptance,
      readiness: dossier.readiness,
      prerequisiteStatus: dossier.prerequisiteStatus,
      context: dossier.lifecycleContext ?? { prerequisites: {}, correctionNodeIds: [] },
    },
    now: at,
  });
}

describe("obligations shared with dossier consumers", () => {
  test("inherits external-action blockers without applying them to submission", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const repository = repositoryWithApprovedRule();
    const original = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: ruleVersionId,
    });
    const external = original.nodes.find((node) => node.procedureNodeKey === "external_action")!;
    const id = "external-action-obligation";
    await ingestObligationObservation(repository, adapter("unfulfilled", 1, id), {
      obligationId: id,
      companyId: "company-alpha",
      consumerAgencies: ["RNE"],
      ruleVersionId,
      relationships: [
        { dossierId: original.dossier.id, nodeId: external.id, agency: "RNE", action: "execute_external" },
      ],
      recordedAt: now,
    });
    const created = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: ruleVersionId,
    });
    expect(created.nodes.find((node) => node.procedureNodeKey === "external_action")?.blockers).toEqual([
      expect.objectContaining({ obligationId: id, action: "execute_external", status: "unsatisfied" }),
    ]);
    expect(created.nodes.find((node) => node.procedureNodeKey === "submission")?.blockers).toEqual([]);
    expect(
      repository.snapshot().dossiers.find((dossier) => dossier.id === created.dossier.id)?.prerequisiteStatus,
    ).toBe("unsatisfied");
    expect(submit(created.dossier, now)).toMatchObject({ state: { agencyAcceptance: "pending" } });
  });

  test.each(["pending", "rejected"] as const)(
    "keeps %s verification out of fulfilled dossier views",
    async (verificationState) => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date(now));
      const repository = repositoryWithApprovedRule();
      const id = "unverified-obligation";
      const source = adapter("fulfilled", 1, id);
      await ingest(
        repository,
        {
          ...source,
          async observe(query) {
            return { ...(await source.observe(query)), verificationState };
          },
        },
        id,
      );
      expect(repository.dossier(dossierId)?.prerequisiteStatus).toBe("unknown");
      expect(repository.node(nodeId)?.prerequisiteStatus).toBe("unknown");
      expect(repository.dependency(id)?.status).toBe("unknown");
      expect(submit(repository.dossier(dossierId)!, now)).toEqual({ error: "prerequisite_needs_review" });
    },
  );

  test("keeps officer, agent, node and dependency views fresh without rewriting stored history", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const seed = repositoryWithApprovedRule();
    const id = "time-sensitive-obligation";
    const source = adapter("fulfilled", 1, id);
    await ingest(
      seed,
      {
        ...source,
        async observe(query) {
          return { ...(await source.observe(query)), effectiveAt: "2026-09-14T00:00:00.000Z" };
        },
      },
      id,
    );
    const snapshot = seed.snapshot();
    const repository = InMemoryDossierRepository.restore(snapshot);
    const server = app(repository);
    const context = {
      repository,
      dossierId,
      sessionId: "test-session",
      principal: { id: "demo-member-alpha", roles: ["business_member"], companyIds: ["company-alpha"] },
    };

    for (const [at, status] of [
      [now, "unknown"],
      ["2026-09-15T00:00:00.000Z", "satisfied"],
      ["2027-01-01T00:00:00.000Z", "unknown"],
    ] as const) {
      vi.setSystemTime(new Date(at));
      expect(repository.dossier(dossierId)?.prerequisiteStatus).toBe(status);
      expect(repository.dossiers().find((dossier) => dossier.id === dossierId)?.prerequisiteStatus).toBe(
        status,
      );
      expect(repository.dossierDetail(dossierId)?.dossier.prerequisiteStatus).toBe(status);
      expect(repository.node(nodeId)?.prerequisiteStatus).toBe(status);
      expect(repository.dependency(id)?.status).toBe(status);
      for (const tool of [getDossierContextTool, runChecksTool]) {
        const result = await invokeFunctionTool({ tool, runContext: new RunContext(context), input: "{}" });
        expect(result).toMatchObject({
          nodes: expect.arrayContaining([
            expect.objectContaining({
              id: nodeId,
              blockers: [expect.objectContaining({ obligationId: id, status })],
            }),
          ]),
        });
      }
      const officer = await (
        await server.handle(request(`/admin/rne/dossiers/${dossierId}`, "demo-officer-rne"))
      ).json();
      expect(officer).toMatchObject({
        dossier: { prerequisiteStatus: status },
        nodes: [expect.objectContaining({ id: nodeId, prerequisiteStatus: status })],
      });
      const queue = await (await server.handle(request("/admin/rne/queue", "demo-officer-rne"))).json();
      expect(queue).toMatchObject({
        data: expect.arrayContaining([
          expect.objectContaining({ id: dossierId, prerequisiteStatus: status }),
        ]),
      });
      const nodeResponse = await (
        await server.handle(request(`/dossiers/${dossierId}/nodes/${nodeId}`, "demo-member-alpha"))
      ).json();
      expect(nodeResponse).toMatchObject({ prerequisiteStatus: status });
      const gate = submit(repository.dossier(dossierId)!, at);
      expect(gate).toMatchObject(
        status === "satisfied"
          ? { state: { agencyAcceptance: "pending" } }
          : { error: "prerequisite_needs_review" },
      );
      expect(repository.snapshot()).toEqual(snapshot);
    }
  });

  test("new matching dossiers inherit only the pinned action and remain attached across source refreshes", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(now));
    const repository = repositoryWithApprovedRule();
    const id = "inherited-obligation";
    await ingest(repository, adapter("unfulfilled", 1, id), id);
    const originalVersion = repository.dossier(dossierId)!.version;
    const created = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: ruleVersionId,
      dossierId: "new-rne-dossier",
    });
    expect(repository.dossier(dossierId)!.version).toBe(originalVersion);
    const target = created.nodes.find((node) => node.procedureNodeKey === "submission")!;
    expect(created.dossier.lifecycleContext?.prerequisites[id]).toMatchObject({
      status: "unfulfilled",
      actions: ["submission_requested"],
    });
    expect(target.blockers).toEqual([
      expect.objectContaining({ obligationId: id, action: "submit", status: "unsatisfied" }),
    ]);
    expect(created.nodes.filter((node) => node.id !== target.id).every((node) => !node.blockers.length)).toBe(
      true,
    );
    expect(submit(created.dossier, now)).toEqual({ error: "prerequisite_blocked" });
    expect(repository.obligation(id)).toMatchObject({
      sourceVersion: 1,
      version: 2,
      relationships: expect.arrayContaining([
        { dossierId: created.dossier.id, nodeId: target.id, agency: "RNE", action: "submit" },
      ]),
    });
    expect(repository.obligationEvents(id, 1)).toMatchObject([
      { type: "obligation_dependencies_changed", version: 2, sourceVersion: 1 },
    ]);
    repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: ruleVersionId,
      dossierId: created.dossier.id,
    });
    expect(repository.obligationEvents(id, 0)).toHaveLength(2);

    const beforeInvalidAction = repository.snapshot();
    await expect(
      ingestObligationObservation(repository, adapter("fulfilled", 2, id), {
        obligationId: id,
        companyId: "company-alpha",
        consumerAgencies: ["RNE"],
        ruleVersionId,
        relationships: [
          { dossierId: created.dossier.id, nodeId: target.id, agency: "RNE", action: "resubmit" },
        ],
        recordedAt: now,
      }),
    ).rejects.toMatchObject({ code: "obligation_relationship_conflict" });
    expect(repository.snapshot()).toEqual(beforeInvalidAction);

    const result = await ingestObligationObservation(repository, adapter("fulfilled", 2, id), {
      obligationId: id,
      companyId: "company-alpha",
      consumerAgencies: ["RNE"],
      ruleVersionId,
      relationships: [{ dossierId: created.dossier.id, nodeId: target.id, agency: "RNE", action: "submit" }],
      recordedAt: now,
    });
    expect(result.record.relationships).toHaveLength(2);
    const restored = InMemoryDossierRepository.restore(repository.snapshot());
    for (const affectedId of [dossierId, created.dossier.id]) {
      expect(submit(restored.dossier(affectedId)!, now)).toMatchObject({
        state: { agencyAcceptance: "pending" },
      });
    }
    const affected = await (
      await app(restored).handle(request(`/obligations/${id}/affected`, "demo-officer-rne"))
    ).json();
    expect(affected).toMatchObject({
      affectedDossiers: expect.arrayContaining([
        expect.objectContaining({ dossierId: created.dossier.id, actions: ["submit"] }),
      ]),
    });
  });

  test("matches dossiers that exist before observation and excludes other companies, agencies and rule versions", async () => {
    const repository = repositoryWithApprovedRule();
    const matching = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: ruleVersionId,
    });
    const otherCompany = repository.createDossier({
      companyId: "company-beta",
      procedureVersionId: ruleVersionId,
    });
    const otherAgency = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: "procedure-dgi-v1",
    });
    repository.addProcedure({ ...repository.procedure(ruleVersionId)!, id: "different-rule" }, []);
    const otherRule = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: "different-rule",
    });
    await ingest(repository, adapter("unfulfilled", 1, "matching-obligation"), "matching-obligation");
    expect(
      repository
        .obligation("matching-obligation")
        ?.relationships.map((relationship) => relationship.dossierId)
        .sort(),
    ).toEqual([dossierId, matching.dossier.id].sort());
    for (const unrelated of [otherCompany, otherAgency, otherRule]) {
      expect(
        repository.dossier(unrelated.dossier.id)?.lifecycleContext?.prerequisites["matching-obligation"],
      ).toBeUndefined();
    }
    const futureOtherCompany = repository.createDossier({
      companyId: "company-beta",
      procedureVersionId: ruleVersionId,
    });
    expect(futureOtherCompany.dossier.lifecycleContext).toBeUndefined();
    expect(repository.obligationEvents("matching-obligation", 0)).toHaveLength(1);
  });

  test("restores the procedure node mapping in snapshots created before node keys were stored", () => {
    const seed = createDemoDossierRepository();
    const snapshot = seed.snapshot();
    const repository = InMemoryDossierRepository.restore({
      ...snapshot,
      nodes: snapshot.nodes.map(({ procedureNodeKey: _key, ...node }) => node),
    });
    const created = repository.createDossier({
      companyId: "company-alpha",
      procedureVersionId: "procedure-rne-v1",
    });
    expect(
      created.dossier.lifecycleContext?.prerequisites["obligation-alpha-dgi-registration"],
    ).toMatchObject({
      verificationState: "synthetic",
      actions: ["submission_requested"],
    });
    expect(repository.obligation("obligation-alpha-dgi-registration")?.relationships).toHaveLength(2);
  });

  test("officers correct demo observations without promoting them to official status", async () => {
    const repository = createDemoDossierRepository();
    const server = app(repository);
    const id = "obligation-alpha-dgi-registration";
    const path = `/admin/dgi/obligations/${id}/reassessments`;
    const body = {
      expectedVersion: 1,
      status: "disputed",
      kind: "correction",
      reason: "Correct a demo registry entry",
      evidenceReference: "synthetic://corrected-entry",
      effectiveAt: "2026-09-01T00:00:00.000Z",
      expiresAt: "2099-01-01T00:00:00.000Z",
    };
    for (const user of ["demo-member-alpha", "demo-officer-rne", "demo-officer-apii"]) {
      expect((await server.handle(request(path, user, "POST", body))).status).toBe(403);
    }
    const response = await server.handle(request(path, "demo-officer-dgi", "POST", body));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      record: {
        version: 2,
        sourceVersion: 1,
        status: "disputed",
        simulated: true,
        verificationState: "synthetic",
        ruleVersionStatus: "synthetic",
        authority: { kind: "officer_reassessment", officerId: "demo-officer-dgi" },
        evidence: { kind: "synthetic_fixture" },
        correction: { reason: body.reason, previousEventId: `obligation:${id}:v1` },
      },
      event: { version: 2, verificationState: "synthetic", evidence: { kind: "synthetic_fixture" } },
    });
    expect((await server.handle(request(path, "demo-officer-dgi", "POST", body))).status).toBe(409);
    expect(repository.obligationEvents(id, 0)).toHaveLength(2);
    const corrected = repository.obligation(id)!;
    const refresh = repository.recordObligationObservation({
      ...corrected,
      sourceVersion: 2,
      status: "fulfilled",
      correction: undefined,
      authority: { kind: "synthetic", agency: "DGI", sourceId: "synthetic-registry" },
    });
    expect(refresh.record).toMatchObject({
      version: 3,
      sourceVersion: 2,
      simulated: true,
      verificationState: "synthetic",
    });
  });
});

describe("scoped obligation API", () => {
  test("exposes cross-agency relationships and affected dossiers only inside the sharing scope", async () => {
    const server = app(createDemoDossierRepository());
    const id = "obligation-alpha-dgi-registration";

    for (const user of ["demo-member-alpha", "demo-officer-dgi", "demo-officer-rne"]) {
      expect((await server.handle(request(`/obligations/${id}`, user))).status).toBe(200);
    }
    expect((await server.handle(request(`/obligations/${id}`, "demo-officer-apii"))).status).toBe(403);

    const dependencies = (await (
      await server.handle(request(`/obligations/${id}/dependencies`, "demo-officer-rne"))
    ).json()) as Record<string, unknown>;
    expect(dependencies).toMatchObject({
      ruleVersion: { id: "procedure-rne-v1", status: "synthetic" },
      responsibleAgency: "DGI",
      consumerAgencies: ["RNE"],
    });
    const affected = await (
      await server.handle(request(`/obligations/${id}/affected`, "demo-officer-rne"))
    ).json();
    expect(affected).toMatchObject({
      eventId: "obligation:obligation-alpha-dgi-registration:v1",
      affectedDossiers: [
        {
          dossierId: "dossier-alpha-rne",
          agency: "RNE",
          actions: ["submit"],
        },
      ],
    });
  });

  test("records an officer reassessment with its reason and prior event", async () => {
    const repository = repositoryWithApprovedRule();
    const obligationId = "obligation-reassessed";
    await ingest(repository, adapter("fulfilled", 1, obligationId), obligationId);
    const server = app(repository);
    const response = await server.handle(
      request(`/admin/dgi/obligations/${obligationId}/reassessments`, "demo-officer-dgi", "POST", {
        expectedVersion: 1,
        status: "disputed",
        kind: "reassessment",
        reason: "Agency record is under formal review",
        evidenceReference: "DGI-OFFICER-REVIEW-2",
        effectiveAt: "2026-09-13T10:00:00.000Z",
        expiresAt: "2026-12-31T23:59:59.000Z",
      }),
    );

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      applied: true,
      record: {
        version: 2,
        status: "disputed",
        authority: { kind: "officer_reassessment", officerId: "demo-officer-dgi" },
        evidence: { kind: "officer_attestation", reference: "DGI-OFFICER-REVIEW-2" },
        correction: {
          kind: "reassessment",
          reason: "Agency record is under formal review",
          previousEventId: "obligation:obligation-reassessed:v1",
        },
      },
      event: { id: "obligation:obligation-reassessed:v2", version: 2 },
    });
    expect(
      (
        await server.handle(
          request(`/admin/rne/obligations/${obligationId}/reassessments`, "demo-officer-rne", "POST", {}),
        )
      ).status,
    ).toBe(404);
    const events = await (
      await server.handle(request(`/obligations/${obligationId}/events?afterVersion=1`, "demo-officer-rne"))
    ).json();
    expect(events).toMatchObject([{ id: "obligation:obligation-reassessed:v2" }]);

    const agencyRefresh = await ingest(repository, adapter("unfulfilled", 2, obligationId), obligationId);
    expect(agencyRefresh).toMatchObject({
      applied: true,
      record: { version: 3, sourceVersion: 2, status: "unfulfilled" },
      event: { id: "obligation:obligation-reassessed:v3" },
    });
  });
});
