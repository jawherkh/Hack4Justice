import { Elysia } from "elysia";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createAccessRoutes } from "../access/routes";
import {
  createDemoDossierRepository,
  InMemoryDossierRepository,
  type DocumentRecord,
  type DossierDetail,
  type FindingRecord,
  type NodeAction,
  type NodeRecord,
  type ProcedureVersionRecord,
  type RequirementRecord,
} from "../dossiers/store";
import { errorHandler } from "../errors";
import type { PrerequisiteObservation } from "../lifecycle/contracts";
import type { ObligationRecord } from "../obligations/contracts";
import { evaluateActionGate, evaluateRequirements, resolveActionNode } from "./evaluator";

const source = {
  id: "source-rule",
  kind: "synthetic" as const,
  uri: "https://example.invalid/rule",
  passage: "Synthetic rule used for testing.",
  sha256: "source-checksum",
  retrievedAt: "2030-01-01T00:00:00.000Z",
};

afterEach(() => vi.useRealTimers());

function requirement(
  id: string,
  applicability: RequirementRecord["applicability"] = "applicable",
): RequirementRecord {
  return {
    id,
    procedureVersionId: "procedure-test-v1",
    code: id.toUpperCase(),
    description: "Synthetic evidence requirement",
    evidenceType: "synthetic_document",
    minimumCount: 1,
    applicability,
    sourceIds: [source.id],
  };
}

function node(
  id: string,
  actions: readonly NodeAction[],
  dependencies: readonly string[],
  requirementIds: readonly string[] = [],
): NodeRecord {
  return {
    id,
    companyId: "company-test",
    dossierId: "dossier-test",
    agency: "RNE",
    version: 2,
    procedureVersionId: "procedure-test-v1",
    type: actions.includes("submit") ? "submission" : "document_evidence",
    state: "not_started",
    title: id,
    content: "",
    responsibleActor: { id: "member-test", kind: "business_member" },
    dependencies,
    requirementIds,
    findingIds: [],
    sourceIds: [source.id],
    allowedActions: actions,
    blockers: [],
    readiness: "unknown",
    agencyAcceptance: "not_submitted",
    prerequisiteStatus: "unknown",
  };
}

function document(
  id: string,
  requirementIds: readonly string[],
  reviewStatus: DocumentRecord["reviewStatus"],
): DocumentRecord {
  return {
    id,
    companyId: "company-test",
    dossierId: "dossier-test",
    agency: "RNE",
    nodeId: "evidence-node",
    filename: `${id}.txt`,
    originalText: "synthetic",
    version: 1,
    requirementIds,
    storageRef: `memory://${id}`,
    sha256: `${id}-checksum`,
    mimeType: "text/plain",
    sizeBytes: 9,
    uploadedBy: "member-test",
    uploadedAt: "2030-01-01T00:00:00.000Z",
    reviewStatus,
    immutable: true,
  };
}

function finding(
  id: string,
  requirementId: string,
  evidenceIds: readonly string[],
  outcome: FindingRecord["outcome"],
  validity: FindingRecord["validity"] = "current",
): FindingRecord {
  return {
    id,
    companyId: "company-test",
    dossierId: "dossier-test",
    agency: "RNE",
    nodeId: "evidence-node",
    requirementId,
    evidenceIds,
    evaluatedDossierVersion: 2,
    outcome,
    message: "Synthetic evaluation",
    sourceIds: [source.id],
    validity,
  };
}

function detail(
  options: {
    requirements?: readonly RequirementRecord[];
    evidence?: readonly DocumentRecord[];
    findings?: readonly FindingRecord[];
    nodes?: readonly NodeRecord[];
    prerequisite?: PrerequisiteObservation;
  } = {},
): DossierDetail {
  const requirements = options.requirements ?? [requirement("required-document")];
  const nodes = options.nodes ?? [
    node(
      "evidence-node",
      ["view", "upload_evidence", "correct_evidence", "request_review"],
      [],
      requirements.map((item) => item.id),
    ),
    node("submission-node", ["view", "submit", "resubmit"], ["evidence-node"]),
  ];
  return {
    dossier: {
      id: "dossier-test",
      dossierId: "dossier-test",
      companyId: "company-test",
      agency: "RNE",
      title: "Synthetic dossier",
      simulated: true,
      version: 2,
      procedureVersionId: "procedure-test-v1",
      lifecycle: "active",
      readiness: "needs_review",
      agencyAcceptance: "not_submitted",
      prerequisiteStatus: "unknown",
      nodeIds: nodes.map((item) => item.id),
      confirmedFacts: {},
      updatedAt: "2030-01-01T00:00:00.000Z",
      ...(options.prerequisite
        ? {
            lifecycleContext: {
              prerequisites: { [options.prerequisite.obligationId]: options.prerequisite },
              correctionNodeIds: [],
            },
          }
        : {}),
    },
    nodes,
    requirements,
    sources: [source],
    evidence: options.evidence ?? [],
    findings: options.findings ?? [],
    decisions: [],
  };
}

const dependency = (
  status: "satisfied" | "unsatisfied" | "unknown",
  observedAt = "2030-01-01T00:00:00.000Z",
): ObligationRecord => ({
  id: "dependency-dgi-registration",
  companyId: "company-test",
  agency: "DGI",
  consumerAgencies: ["RNE"],
  status: status === "satisfied" ? "fulfilled" : status === "unsatisfied" ? "unfulfilled" : "unknown",
  observedAt,
  simulated: true,
  version: 1,
  sourceVersion: 1,
  lastEventId: "dependency-dgi-registration:1",
  authority: { agency: "DGI", kind: "synthetic", sourceId: "synthetic-registry" },
  evidence: { kind: "synthetic_fixture", reference: "https://example.invalid/registration" },
  effectiveAt: "2026-01-01T00:00:00.000Z",
  expiresAt: "2031-01-01T00:00:00.000Z",
  recordedAt: observedAt,
  verificationState: "synthetic",
  ruleVersionId: "procedure-test-v1",
  ruleVersionStatus: "synthetic",
  relationships: [{ dossierId: "dossier-test", nodeId: "submission-node", agency: "RNE", action: "submit" }],
});

function actionGate(
  dossier: DossierDetail,
  dependencies: readonly ObligationRecord[] = [],
  action: NodeAction = "submit",
) {
  const target = resolveActionNode(dossier, action);
  if (!target) throw new Error("Missing action node in fixture");
  return evaluateActionGate(dossier, dependencies, target, action, "2030-01-02T00:00:00.000Z");
}

function seedRepository(dossier: DossierDetail): InMemoryDossierRepository {
  const repository = new InMemoryDossierRepository();
  const procedure: ProcedureVersionRecord = {
    id: dossier.dossier.procedureVersionId,
    code: "synthetic_test",
    version: "1",
    agency: dossier.dossier.agency,
    title: "Synthetic procedure",
    status: "synthetic",
    sourceIds: [source.id],
    requirements: dossier.requirements,
    nodes: dossier.nodes.map((item) => ({
      key: item.id,
      type: item.type,
      title: item.title,
      dependsOnKeys: item.dependencies,
      requirementCodes: dossier.requirements
        .filter((candidate) => item.requirementIds.includes(candidate.id))
        .map((candidate) => candidate.code),
      responsible: item.responsibleActor.kind,
      allowedActions: item.allowedActions,
    })),
  };
  repository.addProcedure(procedure, [source]);
  for (const item of dossier.nodes) repository.addNode(item);
  for (const item of dossier.evidence) repository.addDocument(item);
  for (const item of dossier.findings) repository.addFinding(item);
  repository.addDossier(dossier.dossier);
  return repository;
}

describe("requirement evaluation", () => {
  test("returns every explicit status with evidence and pinned rule references", () => {
    const requirements = [
      requirement("satisfied"),
      requirement("missing"),
      requirement("inconsistent"),
      requirement("review"),
      requirement("irrelevant", "not_applicable"),
    ];
    const evidence = [
      document("accepted-document", ["satisfied"], "unreviewed"),
      document("incorrect-document", ["inconsistent"], "needs_correction"),
      document("unreviewed-document", ["review"], "unreviewed"),
    ];
    const report = evaluateRequirements(
      detail({
        requirements,
        evidence,
        findings: [finding("accepted-finding", "satisfied", ["accepted-document"], "pass")],
      }),
      "2030-01-02T00:00:00.000Z",
    );

    expect(Object.fromEntries(report.requirements.map((item) => [item.requirementId, item.status]))).toEqual({
      satisfied: "satisfied",
      missing: "missing",
      inconsistent: "inconsistent",
      review: "needs_review",
      irrelevant: "not_applicable",
    });
    expect(report.readiness).toBe("incomplete");
    expect(report.requirements[0]).toMatchObject({
      evidenceIds: ["accepted-document"],
      findingIds: ["accepted-finding"],
      ruleVersionId: "procedure-test-v1",
      sourceIds: ["source-rule"],
      sourceRefs: ["https://example.invalid/rule"],
    });
  });

  test("blocks a submission when a transitive mandatory requirement is missing", () => {
    const requirements = [requirement("required-document")];
    const nodes = [
      node("evidence-node", ["upload_evidence"], [], ["required-document"]),
      node("validation-node", ["run_validation"], ["evidence-node"]),
      node("submission-node", ["submit"], ["validation-node"]),
    ];
    const gate = actionGate(detail({ requirements, nodes }));

    expect(gate.decision).toBe("blocked");
    expect(gate.prerequisites).toContainEqual(
      expect.objectContaining({ id: "required-document", status: "missing", kind: "requirement" }),
    );
  });

  test("clears covered actions only after evidence and authority statuses are satisfied", () => {
    const fulfilled: PrerequisiteObservation = {
      obligationId: "registration",
      version: 1,
      status: "fulfilled",
      ruleVersionId: "authority-rule-v1",
      sourceRef: "authority://registration",
      expiresAt: "2030-02-01T00:00:00.000Z",
      actions: ["submission_requested"],
    };
    const dossier = detail({
      evidence: [document("confirmed-document", ["required-document"], "confirmed")],
      prerequisite: fulfilled,
    });
    const gate = actionGate(dossier, [dependency("satisfied")]);

    expect(gate.decision).toBe("allowed");
    expect(gate.prerequisites.map((item) => item.status)).toEqual(["satisfied", "satisfied", "satisfied"]);
    expect(gate.prerequisites).toContainEqual(
      expect.objectContaining({
        id: "dependency-dgi-registration",
        agency: "DGI",
        authorityStatus: "fulfilled",
        sourceRefs: ["https://example.invalid/registration"],
      }),
    );
  });

  test("blocks an authority status that explicitly reports an unsatisfied prerequisite", () => {
    const dossier = detail({
      evidence: [document("confirmed-document", ["required-document"], "confirmed")],
    });
    const gate = actionGate(dossier, [dependency("unsatisfied")]);

    expect(gate.decision).toBe("blocked");
    expect(gate.prerequisites).toContainEqual(
      expect.objectContaining({
        id: "dependency-dgi-registration",
        status: "inconsistent",
        agency: "DGI",
        authorityStatus: "unfulfilled",
      }),
    );
  });

  test.each([
    {
      name: "unknown",
      prerequisite: undefined,
      dependency: dependency("unknown"),
    },
    {
      name: "unavailable",
      prerequisite: undefined,
      dependency: dependency("satisfied", "not-a-date"),
    },
    {
      name: "disputed",
      prerequisite: {
        obligationId: "registration",
        version: 1,
        status: "disputed" as const,
        ruleVersionId: "authority-rule-v1",
        sourceRef: "authority://registration",
        expiresAt: "2030-02-01T00:00:00.000Z",
        actions: ["submission_requested" as const],
      },
      dependency: undefined,
    },
    {
      name: "expired",
      prerequisite: {
        obligationId: "registration",
        version: 1,
        status: "fulfilled" as const,
        ruleVersionId: "authority-rule-v1",
        sourceRef: "authority://registration",
        expiresAt: "2029-12-01T00:00:00.000Z",
        actions: ["submission_requested" as const],
      },
      dependency: undefined,
    },
  ])("routes $name authority data to review", ({ prerequisite, dependency: record }) => {
    const dossier = detail({
      evidence: [document("confirmed-document", ["required-document"], "confirmed")],
      ...(prerequisite ? { prerequisite } : {}),
    });
    expect(actionGate(dossier, record ? [record] : []).decision).toBe("needs_review");
  });

  test("keeps uploads and review requests usable while prerequisites are unresolved", () => {
    const dossier = detail();
    for (const action of ["upload_evidence", "request_review"] as const) {
      const gate = actionGate(dossier, [dependency("unknown")], action);
      expect(gate).toMatchObject({ action, decision: "allowed", prerequisites: [] });
    }
  });

  test("does not apply an authority observation to an unrelated action", () => {
    const prerequisite: PrerequisiteObservation = {
      obligationId: "registration",
      version: 1,
      status: "unfulfilled",
      ruleVersionId: "authority-rule-v1",
      sourceRef: "authority://registration",
      expiresAt: "2030-02-01T00:00:00.000Z",
      actions: ["resubmission_requested"],
    };
    const dossier = detail({
      evidence: [document("confirmed-document", ["required-document"], "confirmed")],
      prerequisite,
    });

    expect(actionGate(dossier).decision).toBe("allowed");
  });

  test("reports dependency cycles for review", () => {
    const nodes = [
      node("evidence-node", ["upload_evidence"], ["submission-node"]),
      node("submission-node", ["submit"], ["evidence-node"]),
    ];
    const gate = actionGate(detail({ requirements: [], nodes }));

    expect(gate.decision).toBe("needs_review");
    expect(gate.prerequisites).toContainEqual(
      expect.objectContaining({ kind: "node_dependency", status: "needs_review" }),
    );
  });

  test("evaluates agency dossiers with their shared dependency scope", () => {
    const repository = createDemoDossierRepository();
    const dgi = repository.dossierDetail("dossier-alpha-dgi")!;
    const rne = repository.dossierDetail("dossier-alpha-rne")!;
    expect(repository.actionGate(dgi.dossier.id, "submit").decision).toBe("allowed");
    expect(
      repository.dispatchCommand({
        dossierId: dgi.dossier.id,
        type: "submission_requested",
        expectedVersion: dgi.dossier.version,
        idempotencyKey: "clear-dgi-submission",
        actorId: "demo-member-alpha",
        confirmed: true,
      }),
    ).toMatchObject({ status: "accepted" });
    const rneGate = repository.actionGate(rne.dossier.id, "submit");
    expect(rneGate.decision).toBe("needs_review");
    expect(rneGate.prerequisites.map((item) => item.agency)).toEqual(expect.arrayContaining(["DGI", "RNE"]));
  });
});

describe("gate API enforcement", () => {
  test("rejects blocked commands without disabling review requests", () => {
    const repository = seedRepository(detail());

    expect(() =>
      repository.dispatchCommand({
        dossierId: "dossier-test",
        type: "submission_requested",
        expectedVersion: 2,
        idempotencyKey: "blocked-submission",
        actorId: "member-test",
        confirmed: true,
      }),
    ).toThrowError(expect.objectContaining({ code: "prerequisite_blocked" }));

    expect(
      repository.dispatchCommand({
        dossierId: "dossier-test",
        type: "review_requested",
        expectedVersion: 2,
        idempotencyKey: "review-request",
        actorId: "member-test",
      }),
    ).toMatchObject({ status: "accepted" });
  });

  test("exposes requirement and gate evaluations to an authorized dossier member", async () => {
    const repository = seedRepository(detail());
    const resolvePrincipal = async () => ({
      id: "member-test",
      roles: ["business_member" as const],
      companyIds: ["company-test"],
    });
    const app = new Elysia().use(errorHandler).use(createAccessRoutes(repository, resolvePrincipal));

    const requirements = await app.handle(new Request("http://localhost/dossiers/dossier-test/requirements"));
    expect(requirements.status).toBe(200);
    expect(await requirements.json()).toMatchObject({
      dossierId: "dossier-test",
      readiness: "incomplete",
      requirements: [{ requirementId: "required-document", status: "missing" }],
    });

    const gate = await app.handle(new Request("http://localhost/dossiers/dossier-test/actions/submit/gate"));
    expect(gate.status).toBe(200);
    expect(await gate.json()).toMatchObject({
      dossierId: "dossier-test",
      nodeId: "submission-node",
      action: "submit",
      decision: "blocked",
    });
  });
});

describe("scoped obligation integration", () => {
  const ready = () =>
    detail({ evidence: [document("confirmed-document", ["required-document"], "confirmed")] });

  test.each([
    { name: "future-effective", patch: { effectiveAt: "2030-01-03T00:00:00.000Z" } },
    { name: "expired", patch: { expiresAt: "2030-01-02T00:00:00.000Z" } },
    { name: "pending", patch: { verificationState: "pending" as const } },
    { name: "rejected", patch: { verificationState: "rejected" as const } },
    { name: "disputed", patch: { status: "disputed" as const } },
    { name: "wrong rule version", patch: { ruleVersionId: "another-rule" } },
  ])("routes $name observations to review rather than declaring non-filing", ({ patch }) => {
    const record = { ...dependency("unsatisfied"), ...patch };
    const gate = actionGate(ready(), [record]);
    expect(gate.decision).toBe("needs_review");
    expect(gate.prerequisites.find((item) => item.id === record.id)).toMatchObject({
      status: "needs_review",
    });
  });

  test.each(["pending", "rejected"] as const)(
    "legacy %s observations also require review",
    (verificationState) => {
      const dossier = ready();
      const observation: PrerequisiteObservation = {
        obligationId: "legacy-observation",
        version: 1,
        status: "unfulfilled",
        verificationState,
        ruleVersionId: dossier.dossier.procedureVersionId,
        sourceRef: "https://example.invalid/legacy",
        expiresAt: "2031-01-01T00:00:00.000Z",
        actions: ["submission_requested"],
      };
      expect(
        actionGate({
          ...dossier,
          dossier: {
            ...dossier.dossier,
            lifecycleContext: { prerequisites: { legacy: observation }, correctionNodeIds: [] },
          },
        }).decision,
      ).toBe("needs_review");
    },
  );

  test.each(["resubmit", "execute_external"] as const)(
    "a %s obligation does not block submission",
    (action) => {
      const dossier = ready();
      const target = {
        ...dossier.nodes[1]!,
        allowedActions: ["submit", "resubmit", "execute_external"] as const,
      };
      const repository = seedRepository({ ...dossier, nodes: [dossier.nodes[0]!, target] });
      const record = dependency("unsatisfied");
      repository.recordObligationObservation({
        ...record,
        relationships: [{ ...record.relationships[0]!, action }],
      });
      expect(repository.dependencies("company-test", "RNE")[0]!.status).toBe("unsatisfied");
      expect(repository.actionGate("dossier-test", "submit").decision).toBe("allowed");
      expect(repository.actionGate("dossier-test", action).decision).toBe("blocked");
      expect(
        repository.dispatchCommand({
          dossierId: "dossier-test",
          expectedVersion: 3,
          actorId: "member-test",
          type: "submission_requested",
          idempotencyKey: `unrelated-${action}`,
          confirmed: true,
        }).status,
      ).toBe("accepted");
    },
  );

  test("limits the same action to its bound node, including transitive node dependencies", () => {
    const dossier = ready();
    const sibling = node("second-submission", ["submit"], ["evidence-node"]);
    const repository = seedRepository(
      detail({ evidence: dossier.evidence, nodes: [...dossier.nodes, sibling] }),
    );
    repository.recordObligationObservation(dependency("unsatisfied"));
    expect(repository.actionGate("dossier-test", "submit", "submission-node").decision).toBe("blocked");
    expect(repository.actionGate("dossier-test", "submit", sibling.id).decision).toBe("allowed");
    expect(() => repository.actionGate("dossier-test", "submit")).toThrowError(
      expect.objectContaining({ code: "action_not_available" }),
    );
    repository.addNode({ ...sibling, dependencies: ["submission-node"] });
    expect(repository.actionGate("dossier-test", "submit", sibling.id).decision).toBe("blocked");
  });

  test.each([
    { name: "another company", patch: { companyId: "company-unrelated" } },
    { name: "unshared agency", patch: { consumerAgencies: [] } },
    {
      name: "another dossier",
      patch: {
        relationships: [
          {
            dossierId: "dossier-unrelated",
            nodeId: "submission-node",
            agency: "RNE" as const,
            action: "submit" as const,
          },
        ],
      },
    },
  ])("does not apply or expose records for $name", ({ patch }) => {
    const gate = actionGate(ready(), [{ ...dependency("unsatisfied"), ...patch }]);
    expect(gate.decision).toBe("allowed");
    expect(gate.prerequisites.every((item) => item.kind !== "authority")).toBe(true);
  });

  test("unscoped legacy dependency summaries do not become mandatory gates", () => {
    const repository = seedRepository(ready());
    repository.addDependency({
      id: "legacy-summary",
      companyId: "company-test",
      agency: "DGI",
      consumerAgencies: ["RNE"],
      status: "unsatisfied",
      observedAt: "2030-01-01T00:00:00.000Z",
      simulated: true,
    });
    expect(repository.actionGate("dossier-test", "submit").decision).toBe("allowed");
  });

  test("returns one authority decision with source, freshness and simulation markers after restore", () => {
    const repository = seedRepository(ready());
    const record = dependency("satisfied");
    repository.recordObligationObservation(record);
    const restored = InMemoryDossierRepository.restore(repository.snapshot());
    const authorities = restored
      .actionGate("dossier-test", "submit")
      .prerequisites.filter((item) => item.kind === "authority");
    expect(authorities).toHaveLength(1);
    expect(authorities[0]).toMatchObject({
      id: record.id,
      agency: "DGI",
      status: "satisfied",
      authorityStatus: "fulfilled",
      ruleVersionId: record.ruleVersionId,
      sourceRefs: [record.evidence.reference],
      effectiveAt: record.effectiveAt,
      expiresAt: record.expiresAt,
      verificationState: "synthetic",
      simulated: true,
    });
  });

  test("inherits gates on matching new dossiers without imposing them on other pinned procedures", () => {
    const repository = seedRepository(ready());
    repository.recordObligationObservation(dependency("unsatisfied"));
    const create = (procedureVersionId: string) =>
      repository.createDossier({
        companyId: "company-test",
        procedureVersionId,
      });
    const matching = create("procedure-test-v1");
    expect(repository.actionGate(matching.dossier.id, "submit").prerequisites).toContainEqual(
      expect.objectContaining({ id: "dependency-dgi-registration", status: "inconsistent" }),
    );
    const procedure = repository.procedure("procedure-test-v1")!;
    repository.addProcedure(
      {
        ...procedure,
        id: "other-procedure-v1",
        requirements: procedure.requirements.map((item) => ({
          ...item,
          procedureVersionId: "other-procedure-v1",
        })),
      },
      [source],
    );
    const unrelated = create("other-procedure-v1");
    expect(
      repository
        .actionGate(unrelated.dossier.id, "submit")
        .prerequisites.every((item) => item.kind !== "authority"),
    ).toBe(true);
  });

  test("does not trust cached satisfied blockers without an authority record", () => {
    const dossier = ready();
    const target = {
      ...dossier.nodes[1]!,
      blockers: [
        {
          obligationId: "missing-authority",
          action: "submit" as const,
          status: "satisfied" as const,
          reason: "Old cached status",
        },
      ],
    };
    expect(actionGate({ ...dossier, nodes: [dossier.nodes[0]!, target] }).decision).toBe("needs_review");
  });

  test("missing documents never change the recorded authority status", () => {
    const gate = actionGate(detail(), [dependency("satisfied")]);
    expect(gate.decision).toBe("blocked");
    expect(gate.prerequisites.find((item) => item.kind === "authority")).toMatchObject({
      authorityStatus: "fulfilled",
      status: "satisfied",
    });
  });

  test("clearing an obligation does not invalidate unchanged confirmed evidence", () => {
    const repository = createDemoDossierRepository();
    const record = dependency("unknown");
    const input = {
      ...record,
      companyId: "company-alpha",
      ruleVersionId: "procedure-dgi-v1",
      relationships: [
        {
          dossierId: "dossier-alpha-dgi",
          nodeId: "node-alpha-dgi-submission",
          agency: "DGI" as const,
          action: "submit" as const,
        },
      ],
    };
    expect(repository.actionGate("dossier-alpha-dgi", "submit").decision).toBe("allowed");
    repository.recordObligationObservation(input);
    expect(repository.actionGate("dossier-alpha-dgi", "submit").decision).toBe("needs_review");
    repository.recordObligationObservation({ ...input, sourceVersion: 2, status: "fulfilled" });
    expect(repository.actionGate("dossier-alpha-dgi", "submit").decision).toBe("allowed");
    const dossier = repository.dossier("dossier-alpha-dgi")!;
    repository.updateConfirmedFacts({
      dossierId: dossier.id,
      expectedVersion: dossier.version,
      changes: { name: "Synthetic changed fact" },
    });
    expect(repository.actionGate(dossier.id, "submit").decision).toBe("needs_review");
  });

  test("a pass finding cannot confirm an additional unreviewed document", () => {
    const dossier = detail({
      evidence: [
        document("first", ["required-document"], "unreviewed"),
        document("second", ["required-document"], "unreviewed"),
      ],
      findings: [finding("partial", "required-document", ["first"], "pass")],
    });
    expect(actionGate(dossier).decision).toBe("needs_review");
  });

  test("missing and mismatched rule references require review", () => {
    const dossier = ready();
    expect(actionGate({ ...dossier, requirements: [] }).decision).toBe("needs_review");
    expect(
      actionGate({
        ...dossier,
        requirements: [{ ...dossier.requirements[0]!, procedureVersionId: "other-version" }],
      }).decision,
    ).toBe("needs_review");
  });

  test("API gates and command admission agree at expiry while access and corrections stay usable", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2030-01-02T00:00:00.000Z"));
    const repository = seedRepository(ready());
    repository.recordObligationObservation({
      ...dependency("satisfied"),
      expiresAt: "2030-01-02T00:00:01.000Z",
    });
    const app = new Elysia().use(errorHandler).use(
      createAccessRoutes(repository, async (request) => ({
        id: "member-test",
        roles: ["business_member"],
        companyIds: [request.headers.get("x-company") ?? "company-test"],
      })),
    );
    const gate = () => app.handle(new Request("http://localhost/dossiers/dossier-test/actions/submit/gate"));
    expect(await (await gate()).json()).toMatchObject({ decision: "allowed" });
    vi.setSystemTime(new Date("2030-01-02T00:00:01.000Z"));
    expect(await (await gate()).json()).toMatchObject({ decision: "needs_review" });
    const send = (type: string) =>
      app.handle(
        new Request("http://localhost/dossiers/dossier-test/commands", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ type, expectedVersion: 3, idempotencyKey: type, confirmed: true }),
        }),
      );
    expect((await send("submission_requested")).status).toBe(409);
    expect((await send("review_requested")).status).toBe(202);
    for (const action of ["view", "upload_evidence", "correct_evidence", "request_review"]) {
      const response = await app.handle(
        new Request(`http://localhost/dossiers/dossier-test/actions/${action}/gate?nodeId=evidence-node`),
      );
      expect(await response.json()).toMatchObject({ decision: "allowed" });
    }
    expect(
      (
        await app.handle(
          new Request("http://localhost/dossiers/dossier-test/actions/submit/gate", {
            headers: { "x-company": "company-other" },
          }),
        )
      ).status,
    ).toBe(403);
  });
});
