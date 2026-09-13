import { Elysia } from "elysia";
import { describe, expect, test } from "vitest";

import { createAccessRoutes } from "../access/routes";
import {
  createDemoDossierRepository,
  InMemoryDossierRepository,
  type DependencyRecord,
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
import { evaluateActionGate, evaluateRequirements, resolveActionNode } from "./evaluator";

const source = {
  id: "source-rule",
  kind: "synthetic" as const,
  uri: "https://example.invalid/rule",
  passage: "Synthetic rule used for testing.",
  sha256: "source-checksum",
  retrievedAt: "2030-01-01T00:00:00.000Z",
};

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
  status: DependencyRecord["status"],
  observedAt = "2030-01-01T00:00:00.000Z",
): DependencyRecord => ({
  id: "dependency-dgi-registration",
  companyId: "company-test",
  agency: "DGI",
  consumerAgencies: ["RNE"],
  status,
  observedAt,
  simulated: true,
});

function actionGate(
  dossier: DossierDetail,
  dependencies: readonly DependencyRecord[] = [],
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
        authorityStatus: "satisfied",
        sourceRefs: ["/api/v1/dependencies/dependency-dgi-registration"],
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
        authorityStatus: "unsatisfied",
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
    const dgiTarget = resolveActionNode(dgi, "submit")!;
    const rneTarget = resolveActionNode(rne, "submit")!;

    expect(
      evaluateActionGate(
        dgi,
        repository.dependencies(dgi.dossier.companyId, dgi.dossier.agency),
        dgiTarget,
        "submit",
      ).decision,
    ).toBe("allowed");
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
    const rneGate = evaluateActionGate(
      rne,
      repository.dependencies(rne.dossier.companyId, rne.dossier.agency),
      rneTarget,
      "submit",
    );
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
