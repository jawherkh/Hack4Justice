import type {
  DependencyRecord,
  DossierDetail,
  FindingRecord,
  NodeAction,
  NodeRecord,
  RequirementRecord,
} from "../dossiers/store";

export type RequirementEvaluationStatus =
  "satisfied" | "missing" | "inconsistent" | "needs_review" | "not_applicable";

export interface RequirementEvaluation {
  readonly requirementId: string;
  readonly code: string;
  readonly agency: DossierDetail["dossier"]["agency"];
  readonly mandatory: boolean;
  readonly status: RequirementEvaluationStatus;
  readonly explanation: string;
  readonly evidenceIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly ruleVersionId: string;
  readonly sourceIds: readonly string[];
  readonly sourceRefs: readonly string[];
  readonly remediationRoute?: string;
}

export interface RequirementEvaluationReport {
  readonly dossierId: string;
  readonly procedureVersionId: string;
  readonly evaluatedAt: string;
  readonly readiness: "incomplete" | "needs_review" | "ready";
  readonly requirements: readonly RequirementEvaluation[];
}

export type GateDecision = "allowed" | "blocked" | "needs_review";

export interface GatePrerequisite {
  readonly id: string;
  readonly kind: "requirement" | "authority" | "node_dependency";
  readonly agency: DossierDetail["dossier"]["agency"];
  readonly status: RequirementEvaluationStatus;
  readonly mandatory: boolean;
  readonly explanation: string;
  readonly sourceRefs: readonly string[];
  readonly remediationRoute: string;
  readonly ruleVersionId?: string;
  readonly evidenceIds?: readonly string[];
  readonly authorityStatus?:
    | "fulfilled"
    | "unfulfilled"
    | "unknown"
    | "disputed"
    | "satisfied"
    | "unsatisfied"
    | "not_applicable"
    | "expired"
    | "unavailable";
}

export interface ActionGateEvaluation {
  readonly dossierId: string;
  readonly nodeId: string;
  readonly agency: DossierDetail["dossier"]["agency"];
  readonly action: NodeAction;
  readonly evaluatedAt: string;
  readonly decision: GateDecision;
  readonly prerequisites: readonly GatePrerequisite[];
}

const GATED_ACTIONS = new Set<NodeAction>(["submit", "resubmit", "execute_external"]);

const unique = (values: readonly string[]): string[] => [...new Set(values)];

function sourceRefs(detail: DossierDetail, sourceIds: readonly string[]): string[] {
  const wanted = new Set(sourceIds);
  return unique(detail.sources.filter((source) => wanted.has(source.id)).map((source) => source.uri));
}

function currentEvidence(detail: DossierDetail, requirementId: string) {
  const replaced = new Set(
    detail.evidence.map((document) => document.replacesId).filter((id): id is string => Boolean(id)),
  );
  return detail.evidence.filter(
    (document) => !replaced.has(document.id) && document.requirementIds.includes(requirementId),
  );
}

function requirementFindings(detail: DossierDetail, requirementId: string): readonly FindingRecord[] {
  return detail.findings.filter((finding) => finding.requirementId === requirementId);
}

function result(
  detail: DossierDetail,
  requirement: RequirementRecord,
  status: RequirementEvaluationStatus,
  explanation: string,
  evidenceIds: readonly string[],
  findings: readonly FindingRecord[],
): RequirementEvaluation {
  const sourceIds = unique([...requirement.sourceIds, ...findings.flatMap((finding) => finding.sourceIds)]);
  const remediationRoute =
    status === "missing" || status === "inconsistent"
      ? `/api/v1/dossiers/${detail.dossier.id}/documents`
      : status === "needs_review"
        ? `/api/v1/dossiers/${detail.dossier.id}/commands`
        : undefined;
  return {
    requirementId: requirement.id,
    code: requirement.code,
    agency: detail.dossier.agency,
    mandatory: requirement.minimumCount > 0 && requirement.applicability !== "not_applicable",
    status,
    explanation,
    evidenceIds: unique(evidenceIds),
    findingIds: unique(findings.map((finding) => finding.id)),
    ruleVersionId: requirement.procedureVersionId,
    sourceIds,
    sourceRefs: sourceRefs(detail, sourceIds),
    ...(remediationRoute ? { remediationRoute } : {}),
  };
}

export function evaluateRequirement(
  detail: DossierDetail,
  requirement: RequirementRecord,
): RequirementEvaluation {
  const evidence = currentEvidence(detail, requirement.id);
  const findings = requirementFindings(detail, requirement.id);
  const evidenceIds = evidence.map((document) => document.id);

  if (requirement.applicability === "not_applicable") {
    return result(
      detail,
      requirement,
      "not_applicable",
      "The pinned rule marks this requirement as not applicable.",
      evidenceIds,
      findings,
    );
  }
  if (requirement.applicability === "unknown") {
    return result(
      detail,
      requirement,
      "needs_review",
      "Applicability has not been verified against the pinned rule version.",
      evidenceIds,
      findings,
    );
  }
  if (requirement.minimumCount === 0) {
    return result(
      detail,
      requirement,
      "satisfied",
      "The pinned rule does not require evidence for this requirement.",
      evidenceIds,
      findings,
    );
  }
  if (evidence.length < requirement.minimumCount) {
    return result(
      detail,
      requirement,
      "missing",
      `The dossier has ${evidence.length} of ${requirement.minimumCount} required current evidence item(s).`,
      evidenceIds,
      findings,
    );
  }

  const currentFindings = findings.filter(
    (finding) =>
      finding.validity === "current" &&
      finding.evaluatedDossierVersion === detail.dossier.version &&
      finding.evidenceIds.length > 0 &&
      finding.evidenceIds.every((id) => evidenceIds.includes(id)),
  );
  if (
    evidence.some((document) => document.reviewStatus === "needs_correction") ||
    currentFindings.some((finding) => finding.outcome === "fail")
  ) {
    return result(
      detail,
      requirement,
      "inconsistent",
      "Current evidence conflicts with this requirement or needs correction.",
      evidenceIds,
      findings,
    );
  }

  const hasUnusableFinding = findings.some(
    (finding) =>
      finding.validity === "stale" ||
      finding.evaluatedDossierVersion !== detail.dossier.version ||
      !finding.evidenceIds.every((id) => evidenceIds.includes(id)),
  );
  if (
    currentFindings.some((finding) => finding.outcome === "unknown" || finding.outcome === "needs_review") ||
    (hasUnusableFinding && !currentFindings.some((finding) => finding.outcome === "pass")) ||
    (!currentFindings.some((finding) => finding.outcome === "pass") &&
      evidence.some((document) => document.reviewStatus === "unreviewed"))
  ) {
    return result(
      detail,
      requirement,
      "needs_review",
      "The evidence or its latest evaluation requires verification.",
      evidenceIds,
      findings,
    );
  }

  return result(
    detail,
    requirement,
    "satisfied",
    "Current confirmed evidence satisfies the pinned rule version.",
    evidenceIds,
    findings,
  );
}

function readiness(requirements: readonly RequirementEvaluation[]): RequirementEvaluationReport["readiness"] {
  if (requirements.some((item) => item.mandatory && ["missing", "inconsistent"].includes(item.status))) {
    return "incomplete";
  }
  if (requirements.some((item) => item.mandatory && item.status === "needs_review")) {
    return "needs_review";
  }
  return "ready";
}

export function evaluateRequirements(
  detail: DossierDetail,
  now = new Date().toISOString(),
): RequirementEvaluationReport {
  const requirements = detail.requirements.map((requirement) => evaluateRequirement(detail, requirement));
  return {
    dossierId: detail.dossier.id,
    procedureVersionId: detail.dossier.procedureVersionId,
    evaluatedAt: now,
    readiness: readiness(requirements),
    requirements,
  };
}

export function resolveActionNode(
  detail: DossierDetail,
  action: NodeAction,
  nodeId?: string,
): NodeRecord | undefined {
  const node = nodeId
    ? detail.nodes.find((candidate) => candidate.id === nodeId)
    : detail.nodes.find((candidate) => candidate.allowedActions.includes(action));
  return node?.allowedActions.includes(action) ? node : undefined;
}

function dependencyNodes(detail: DossierDetail, target: NodeRecord) {
  const nodes = new Map(detail.nodes.map((node) => [node.id, node]));
  const visited = new Set<string>();
  const active: string[] = [];
  const selected: NodeRecord[] = [];
  const problems: GatePrerequisite[] = [];

  const visit = (node: NodeRecord): void => {
    const cycleIndex = active.indexOf(node.id);
    if (cycleIndex >= 0) {
      const cycle = [...active.slice(cycleIndex), node.id];
      problems.push({
        id: `cycle:${cycle.join(":")}`,
        kind: "node_dependency",
        agency: detail.dossier.agency,
        status: "needs_review",
        mandatory: true,
        explanation: `A dependency cycle must be reviewed: ${cycle.join(" -> ")}.`,
        sourceRefs: sourceRefs(detail, node.sourceIds),
        remediationRoute: `/api/v1/dossiers/${detail.dossier.id}/nodes/${node.id}`,
      });
      return;
    }
    if (visited.has(node.id)) return;
    active.push(node.id);
    for (const dependencyId of node.dependencies) {
      const dependency = nodes.get(dependencyId);
      if (!dependency) {
        problems.push({
          id: `unavailable:${dependencyId}`,
          kind: "node_dependency",
          agency: detail.dossier.agency,
          status: "needs_review",
          mandatory: true,
          explanation: `Dependency ${dependencyId} is unavailable and must be verified.`,
          sourceRefs: sourceRefs(detail, node.sourceIds),
          remediationRoute: `/api/v1/dossiers/${detail.dossier.id}/nodes/${node.id}`,
        });
      } else {
        visit(dependency);
      }
    }
    active.pop();
    visited.add(node.id);
    selected.push(node);
  };

  visit(target);
  return { nodes: selected, problems };
}

function asGateRequirement(detail: DossierDetail, item: RequirementEvaluation): GatePrerequisite {
  return {
    id: item.requirementId,
    kind: "requirement",
    agency: item.agency,
    status: item.status,
    mandatory: item.mandatory,
    explanation: item.explanation,
    sourceRefs: item.sourceRefs,
    remediationRoute: item.remediationRoute ?? `/api/v1/dossiers/${detail.dossier.id}/requirements`,
    ruleVersionId: item.ruleVersionId,
    evidenceIds: item.evidenceIds,
  };
}

function authorityPrerequisites(
  detail: DossierDetail,
  dependencies: readonly DependencyRecord[],
  action: NodeAction,
  now: string,
): GatePrerequisite[] {
  const prerequisites: GatePrerequisite[] = [];
  const commandType =
    action === "submit"
      ? "submission_requested"
      : action === "resubmit"
        ? "resubmission_requested"
        : undefined;
  const nowMs = Date.parse(now);

  if (commandType) {
    for (const observation of Object.values(detail.dossier.lifecycleContext?.prerequisites ?? {})) {
      if (!observation.actions.includes(commandType)) continue;
      const expiresAt = Date.parse(observation.expiresAt);
      const expired = !Number.isFinite(expiresAt) || !Number.isFinite(nowMs) || expiresAt <= nowMs;
      const status: RequirementEvaluationStatus = expired
        ? "needs_review"
        : observation.status === "fulfilled"
          ? "satisfied"
          : observation.status === "unfulfilled"
            ? "inconsistent"
            : "needs_review";
      prerequisites.push({
        id: observation.obligationId,
        kind: "authority",
        agency: detail.dossier.agency,
        status,
        mandatory: true,
        explanation: expired
          ? "The authority observation is expired or has no usable expiry time."
          : observation.status === "fulfilled"
            ? "The authority reports this prerequisite as fulfilled."
            : observation.status === "unfulfilled"
              ? "The authority reports this prerequisite as unfulfilled."
              : "The authority status is uncertain and requires verification.",
        sourceRefs: [observation.sourceRef],
        remediationRoute: `/api/v1/dossiers/${detail.dossier.id}/commands`,
        ruleVersionId: observation.ruleVersionId,
        authorityStatus: expired ? "expired" : observation.status,
      });
    }
  }

  for (const dependency of dependencies) {
    const observedAt = Date.parse(dependency.observedAt);
    const unavailable = !Number.isFinite(observedAt);
    const status: RequirementEvaluationStatus = unavailable
      ? "needs_review"
      : dependency.status === "satisfied"
        ? "satisfied"
        : dependency.status === "unsatisfied"
          ? "inconsistent"
          : "needs_review";
    prerequisites.push({
      id: dependency.id,
      kind: "authority",
      agency: dependency.agency,
      status,
      mandatory: true,
      explanation: unavailable
        ? "The authority status has no usable observation time and requires verification."
        : dependency.status === "satisfied"
          ? "The authoritative dependency status is satisfied."
          : dependency.status === "unsatisfied"
            ? "The authoritative dependency status is unsatisfied."
            : "The authoritative dependency status is unknown and requires verification.",
      sourceRefs: [`/api/v1/dependencies/${dependency.id}`],
      remediationRoute: `/api/v1/dependencies/${dependency.id}`,
      authorityStatus: unavailable ? "unavailable" : dependency.status,
    });
  }
  return prerequisites;
}

function decision(prerequisites: readonly GatePrerequisite[]): GateDecision {
  if (
    prerequisites.some(
      (item) => item.mandatory && (item.status === "missing" || item.status === "inconsistent"),
    )
  ) {
    return "blocked";
  }
  if (prerequisites.some((item) => item.mandatory && item.status === "needs_review")) {
    return "needs_review";
  }
  return "allowed";
}

export function evaluateActionGate(
  detail: DossierDetail,
  dependencies: readonly DependencyRecord[],
  target: NodeRecord,
  action: NodeAction,
  now = new Date().toISOString(),
): ActionGateEvaluation {
  if (!GATED_ACTIONS.has(action)) {
    return {
      dossierId: detail.dossier.id,
      nodeId: target.id,
      agency: detail.dossier.agency,
      action,
      evaluatedAt: now,
      decision: "allowed",
      prerequisites: [],
    };
  }

  const graph = dependencyNodes(detail, target);
  const requirementIds = new Set(graph.nodes.flatMap((node) => node.requirementIds));
  const requirements = detail.requirements
    .filter((requirement) => requirementIds.has(requirement.id))
    .map((requirement) => asGateRequirement(detail, evaluateRequirement(detail, requirement)));
  const blockers = graph.nodes.flatMap((node) =>
    node.blockers
      .filter((blocker) => blocker.action === action)
      .map<GatePrerequisite>((blocker) => ({
        id: blocker.obligationId,
        kind: "authority",
        agency: node.agency,
        status:
          blocker.status === "satisfied"
            ? "satisfied"
            : blocker.status === "unsatisfied"
              ? "inconsistent"
              : blocker.status === "not_applicable"
                ? "not_applicable"
                : "needs_review",
        mandatory: blocker.status !== "not_applicable",
        explanation: blocker.reason,
        sourceRefs: sourceRefs(detail, node.sourceIds),
        remediationRoute: `/api/v1/dossiers/${detail.dossier.id}/nodes/${node.id}`,
        ruleVersionId: node.procedureVersionId,
        authorityStatus: blocker.status,
      })),
  );
  const prerequisites = [
    ...requirements,
    ...blockers,
    ...authorityPrerequisites(detail, dependencies, action, now),
    ...graph.problems,
  ];
  return {
    dossierId: detail.dossier.id,
    nodeId: target.id,
    agency: detail.dossier.agency,
    action,
    evaluatedAt: now,
    decision: decision(prerequisites),
    prerequisites,
  };
}
