import { createHash, randomUUID } from "node:crypto";
import type { LifecycleContext, PrerequisiteObservation } from "../lifecycle/contracts";

import {
  AccessError,
  type Agency,
  type DependencyScope,
  type DocumentGrant,
  type ResourceScope,
} from "../access/policy";

export type DossierLifecycle =
  "draft" | "active" | "awaiting_review" | "correction_requested" | "closed" | "cancelled";

export type Readiness = "unknown" | "incomplete" | "needs_review" | "ready";
export type AgencyAcceptance =
  "not_submitted" | "pending" | "modification_requested" | "accepted" | "refused";
export type PrerequisiteStatus = "unknown" | "satisfied" | "unsatisfied" | "not_applicable";

export type NodeType =
  | "information_input"
  | "document_evidence"
  | "document_preparation"
  | "validation"
  | "decision"
  | "external_action"
  | "human_review"
  | "submission";

export type NodeState =
  | "not_started"
  | "in_progress"
  | "waiting"
  | "needs_correction"
  | "completed"
  | "blocked"
  | "failed"
  | "cancelled";

export type NodeAction =
  | "view"
  | "edit_facts"
  | "upload_evidence"
  | "correct_evidence"
  | "request_review"
  | "prepare_document"
  | "run_validation"
  | "record_decision"
  | "execute_external"
  | "submit"
  | "resubmit"
  | "cancel";

export interface SourceRecord {
  readonly id: string;
  readonly kind: "official" | "synthetic";
  readonly uri: string;
  readonly passage: string;
  readonly sha256: string;
  readonly retrievedAt: string;
  readonly page?: number;
  readonly section?: string;
}

export interface RequirementRecord {
  readonly id: string;
  readonly procedureVersionId: string;
  readonly code: string;
  readonly description: string;
  readonly evidenceType: string;
  readonly minimumCount: number;
  readonly applicability: "applicable" | "not_applicable" | "unknown";
  readonly sourceIds: readonly string[];
}

export interface ProcedureNodeDefinition {
  readonly key: string;
  readonly type: NodeType;
  readonly title: string;
  readonly dependsOnKeys: readonly string[];
  readonly requirementCodes: readonly string[];
  readonly responsible: "business_member" | "officer";
  readonly allowedActions: readonly NodeAction[];
}

export interface ProcedureVersionRecord {
  readonly id: string;
  readonly code: string;
  readonly version: string;
  readonly agency: Agency;
  readonly title: string;
  readonly status: "candidate" | "approved" | "superseded" | "synthetic";
  readonly sourceIds: readonly string[];
  readonly requirements: readonly RequirementRecord[];
  readonly nodes: readonly ProcedureNodeDefinition[];
}

export interface DossierRecord extends ResourceScope {
  readonly lifecycleContext?: LifecycleContext;
  readonly assignedOfficerId?: string;
  readonly assignedAt?: string;
  readonly id: string;
  readonly title: string;
  readonly simulated: true;
  readonly version: number;
  readonly procedureVersionId: string;
  readonly lifecycle: DossierLifecycle;
  readonly readiness: Readiness;
  readonly agencyAcceptance: AgencyAcceptance;
  readonly prerequisiteStatus: PrerequisiteStatus;
  readonly nodeIds: readonly string[];
  readonly confirmedFacts: Readonly<Record<string, unknown>>;
  readonly updatedAt: string;
}

export interface DocumentRecord extends ResourceScope {
  readonly id: string;
  readonly nodeId: string;
  readonly filename: string;
  readonly originalText: string;
  readonly version: number;
  readonly replacesId?: string;
  readonly requirementIds: readonly string[];
  readonly storageRef: string;
  readonly sha256: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly uploadedBy: string;
  readonly uploadedAt: string;
  readonly reviewStatus: "unreviewed" | "confirmed" | "needs_correction";
  readonly immutable: true;
}

export interface FindingRecord extends ResourceScope {
  readonly id: string;
  readonly nodeId: string;
  readonly requirementId: string;
  readonly evidenceIds: readonly string[];
  readonly evaluatedDossierVersion: number;
  readonly outcome: "pass" | "fail" | "unknown" | "needs_review";
  readonly message: string;
  readonly sourceIds: readonly string[];
  readonly validity: "current" | "stale";
}

export interface NodeRecord extends ResourceScope {
  readonly id: string;
  readonly version: number;
  readonly procedureVersionId: string;
  readonly type: NodeType;
  readonly state: NodeState;
  readonly title: string;
  readonly content: string;
  readonly responsibleActor: {
    readonly id: string;
    readonly kind: "business_member" | "officer";
    readonly agency?: Agency;
  };
  readonly dependencies: readonly string[];
  readonly requirementIds: readonly string[];
  readonly findingIds: readonly string[];
  readonly sourceIds: readonly string[];
  readonly allowedActions: readonly NodeAction[];
  readonly blockers: readonly {
    readonly obligationId: string;
    readonly action: "submit" | "resubmit" | "execute_external";
    readonly status: PrerequisiteStatus;
    readonly reason: string;
  }[];
  readonly readiness: Readiness;
  readonly agencyAcceptance: AgencyAcceptance;
  readonly prerequisiteStatus: PrerequisiteStatus;
}

export interface DecisionRecord extends ResourceScope {
  readonly evidenceIds?: readonly string[];
  readonly targetNodeIds?: readonly string[];
  readonly id: string;
  readonly nodeId: string;
  readonly agency: Agency;
  readonly actorId: string;
  readonly action: "accept" | "refuse" | "request_modification";
  readonly reason: string;
  readonly dossierVersion: number;
  readonly createdAt: string;
}

export interface DependencyRecord extends DependencyScope {
  readonly id: string;
  readonly status: "unknown" | "satisfied" | "unsatisfied";
  readonly observedAt: string;
  readonly simulated: true;
}

export interface DossierDetail {
  readonly dossier: DossierRecord;
  readonly nodes: readonly NodeRecord[];
  readonly requirements: readonly RequirementRecord[];
  readonly sources: readonly SourceRecord[];
  readonly evidence: readonly DocumentRecord[];
  readonly findings: readonly FindingRecord[];
  readonly decisions: readonly DecisionRecord[];
}

/** JSON-safe model items persisted for an Agents SDK session. */
export type AgentSessionItem = Record<string, unknown>;

export interface AgentSessionRecord {
  readonly id: string;
  readonly dossierId: string;
  readonly principalId: string;
  readonly selectedNodeId?: string;
  readonly lastResponseId?: string;
  readonly history: readonly AgentSessionItem[];
  readonly createdAt: string;
  readonly updatedAt: string;
}

export type AgentEventType =
  | "run_started"
  | "agent_updated"
  | "text_delta"
  | "tool_started"
  | "tool_completed"
  | "tool_failed"
  | "node_selected"
  | "task_created"
  | "artifact_created"
  | "run_completed"
  | "run_failed";

export interface AgentEventRecord {
  readonly id: string;
  readonly sequence: number;
  readonly sessionId: string;
  readonly dossierId: string;
  readonly actorId: string;
  readonly type: AgentEventType;
  readonly data: Readonly<Record<string, unknown>>;
  readonly occurredAt: string;
}

export interface HelperTaskRecord extends ResourceScope {
  readonly id: string;
  readonly nodeId?: string;
  readonly title: string;
  readonly description: string;
  readonly requestedBy: string;
  readonly status: "open" | "completed" | "cancelled";
  readonly idempotencyKey: string;
  readonly createdAt: string;
}

export interface ArtifactProvenanceRecord {
  readonly path: string;
  readonly dossierId: string;
  readonly runId: string;
  readonly sourceDocumentIds: readonly string[];
  readonly sha256: string;
  readonly exportedAt: string;
}

export interface ArtifactRecord extends ResourceScope {
  readonly id: string;
  readonly nodeId: string;
  readonly draftKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly storageRef: string;
  readonly version: number;
  readonly provenance: ArtifactProvenanceRecord;
  readonly createdBy: string;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly immutable: true;
}

export interface CreateAgentSessionInput {
  readonly id?: string;
  readonly dossierId: string;
  readonly principalId: string;
  readonly selectedNodeId?: string;
}

export interface AgentEventInput {
  readonly sessionId: string;
  readonly dossierId: string;
  readonly actorId: string;
  readonly type: AgentEventType;
  readonly data?: Readonly<Record<string, unknown>>;
}

export interface CreateHelperTaskInput {
  readonly dossierId: string;
  readonly nodeId?: string;
  readonly title: string;
  readonly description: string;
  readonly requestedBy: string;
  readonly idempotencyKey: string;
}

export interface PublishArtifactInput {
  readonly dossierId: string;
  readonly nodeId: string;
  readonly draftKey: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly bytes: Uint8Array;
  readonly provenance: ArtifactProvenanceRecord;
  readonly createdBy: string;
  readonly idempotencyKey: string;
  readonly storageRef?: string;
}

export type UploadDocumentResult = ReturnType<AccessRepository["uploadDocument"]>;

export type BinaryEvidenceInput = Omit<UploadDocumentInput, "content" | "binary"> & {
  readonly bytes: Uint8Array;
  readonly idempotencyKey?: string;
};

export interface CreateDossierInput {
  readonly companyId: string;
  readonly procedureVersionId: string;
  readonly dossierId?: string;
}

export interface UploadDocumentInput {
  readonly dossierId: string;
  readonly nodeId: string;
  readonly filename: string;
  readonly mimeType: string;
  readonly content: string;
  readonly requirementIds?: readonly string[];
  readonly replacesDocumentId?: string;
  readonly expectedVersion: number;
  readonly uploadedBy: string;
  readonly idempotencyKey?: string;
  readonly binary?: { readonly bytes: Uint8Array; readonly storageRef: string; readonly sha256: string };
}

export interface ConfirmedFactsInput {
  readonly actorId?: string;
  readonly dossierId: string;
  readonly expectedVersion: number;
  readonly changes: Readonly<Record<string, unknown>>;
}

export interface ReviewAssignmentInput {
  readonly dossierId: string;
  readonly expectedVersion: number;
  readonly officerId: string;
}

export interface LifecycleCommandInput {
  readonly dossierId: string;
  readonly type:
    | "evidence_changed"
    | "review_requested"
    | "submission_requested"
    | "resubmission_requested"
    | "cancellation_requested"
    | "prerequisite_changed"
    | "decision_recorded";
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly actorId: string;
  readonly nodeId?: string;
  readonly correlationId?: string;
  readonly confirmed?: boolean;
  readonly decision?: {
    action: "accept" | "refuse" | "request_modification";
    reason: string;
    targetNodeIds: string[];
    evidenceIds: string[];
  };
  readonly prerequisite?: PrerequisiteObservation;
}

export interface LifecycleCommandAcknowledgement {
  readonly commandId: string;
  readonly dossierId: string;
  readonly type: LifecycleCommandInput["type"];
  readonly expectedVersion: number;
  readonly idempotencyKey: string;
  readonly status: "accepted";
  readonly acceptedAt: string;
}

export interface AccessRepository {
  dossiers(): readonly DossierRecord[];
  dossier(id: string): DossierRecord | undefined;
  dossierDetail(id: string): DossierDetail | undefined;
  document(id: string): DocumentRecord | undefined;
  node(id: string): NodeRecord | undefined;
  dependency(id: string): DependencyRecord | undefined;
  grants(): readonly DocumentGrant[];
  procedures(): readonly ProcedureVersionRecord[];
  procedure(id: string): ProcedureVersionRecord | undefined;
  createDossier(input: CreateDossierInput): DossierDetail;
  uploadDocument(input: UploadDocumentInput): {
    readonly document: DocumentRecord;
    readonly detail: DossierDetail;
    readonly invalidatedFindingIds: readonly string[];
  };
  updateConfirmedFacts(input: ConfirmedFactsInput): {
    readonly detail: DossierDetail;
    readonly invalidatedFindingIds: readonly string[];
  };
  assignDossier(input: ReviewAssignmentInput): DossierRecord;
  dispatchCommand(input: LifecycleCommandInput): LifecycleCommandAcknowledgement;
}

export type MaybePromise<T> = T | Promise<T>;

export interface AgentRepository {
  dossierDetail(id: string): MaybePromise<DossierDetail | undefined>;
  dependencies(companyId: string, agency: Agency): MaybePromise<readonly DependencyRecord[]>;
  procedure(id: string): MaybePromise<ProcedureVersionRecord | undefined>;
  uploadDocument(input: UploadDocumentInput): MaybePromise<UploadDocumentResult>;
  dispatchCommand(input: LifecycleCommandInput): MaybePromise<LifecycleCommandAcknowledgement>;
  agentSession(
    id: string,
    dossierId: string,
    principalId: string,
  ): MaybePromise<AgentSessionRecord | undefined>;
  createAgentSession(input: CreateAgentSessionInput): MaybePromise<AgentSessionRecord>;
  saveAgentSession(session: AgentSessionRecord): MaybePromise<AgentSessionRecord>;
  appendAgentEvent(input: AgentEventInput): MaybePromise<AgentEventRecord>;
  agentEvents(sessionId: string, after: number): MaybePromise<readonly AgentEventRecord[]>;
  createHelperTask(input: CreateHelperTaskInput): MaybePromise<HelperTaskRecord>;
  helperTask(id: string): MaybePromise<HelperTaskRecord | undefined>;
  publishArtifact(input: PublishArtifactInput): MaybePromise<ArtifactRecord>;
  artifact(id: string): MaybePromise<ArtifactRecord | undefined>;
  uploadFile?(input: BinaryEvidenceInput): MaybePromise<UploadDocumentResult>;
  readContent?(id: string): MaybePromise<Uint8Array>;
  readArtifact?(id: string): MaybePromise<Uint8Array>;
}

const ALL_NODE_TYPES: readonly NodeType[] = [
  "information_input",
  "document_evidence",
  "document_preparation",
  "validation",
  "decision",
  "external_action",
  "human_review",
  "submission",
];

const clone = <T>(value: T): T => structuredClone(value);
const timestamp = (): string => new Date().toISOString();
const checksum = (content: string): string => createHash("sha256").update(content).digest("hex");
const commandFingerprint = (input: unknown): string =>
  JSON.stringify(input, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );

function requireValue<T>(value: T | undefined, code = "not_found"): T {
  if (!value) throw new AccessError(404, code);
  return value;
}

function assertVersion(actual: number, expected: number): void {
  if (actual !== expected) throw new AccessError(409, "version_conflict");
}

export interface RepositorySnapshot {
  readonly format: 1;
  readonly sequence: number;
  readonly dossiers: DossierRecord[];
  readonly documents: DocumentRecord[];
  readonly nodes: NodeRecord[];
  readonly findings: FindingRecord[];
  readonly decisions: DecisionRecord[];
  readonly sources: SourceRecord[];
  readonly dependencies: DependencyRecord[];
  readonly procedures: ProcedureVersionRecord[];
  readonly commands: [string, { fingerprint: string; acknowledgement: LifecycleCommandAcknowledgement }][];
  readonly grants: readonly DocumentGrant[];
  readonly uploadReceipts?: [string, { fingerprint: string; response: UploadDocumentResult }][];
  readonly agentSessions?: AgentSessionRecord[];
  readonly agentEvents?: AgentEventRecord[];
  readonly agentEventSequence?: number;
  readonly helperTasks?: HelperTaskRecord[];
  readonly artifacts?: ArtifactRecord[];
  readonly artifactContents?: [string, string][];
}

export class InMemoryDossierRepository implements AgentRepository {
  private readonly dossierRows = new Map<string, DossierRecord>();
  private readonly documentRows = new Map<string, DocumentRecord>();
  private readonly nodeRows = new Map<string, NodeRecord>();
  private readonly findingRows = new Map<string, FindingRecord>();
  private readonly decisionRows = new Map<string, DecisionRecord>();
  private readonly sourceRows = new Map<string, SourceRecord>();
  private readonly dependencyRows = new Map<string, DependencyRecord>();
  private readonly procedureRows = new Map<string, ProcedureVersionRecord>();
  private readonly commandRows = new Map<
    string,
    { fingerprint: string; acknowledgement: LifecycleCommandAcknowledgement }
  >();
  private readonly uploadReceiptRows = new Map<
    string,
    { fingerprint: string; response: UploadDocumentResult }
  >();
  private readonly agentSessionRows = new Map<string, AgentSessionRecord>();
  private readonly agentEventRows = new Map<string, AgentEventRecord>();
  private readonly helperTaskRows = new Map<string, HelperTaskRecord>();
  private readonly artifactRows = new Map<string, ArtifactRecord>();
  private readonly artifactContents = new Map<string, string>();
  private sequence = 0;
  private agentEventSequence = 0;

  public constructor(private readonly documentGrants: readonly DocumentGrant[] = []) {}

  public snapshot(): RepositorySnapshot {
    return clone({
      format: 1,
      sequence: this.sequence,
      dossiers: [...this.dossierRows.values()],
      documents: [...this.documentRows.values()],
      nodes: [...this.nodeRows.values()],
      findings: [...this.findingRows.values()],
      decisions: [...this.decisionRows.values()],
      sources: [...this.sourceRows.values()],
      dependencies: [...this.dependencyRows.values()],
      procedures: [...this.procedureRows.values()],
      commands: [...this.commandRows.entries()],
      grants: this.documentGrants,
      uploadReceipts: [...this.uploadReceiptRows.entries()],
      agentSessions: [...this.agentSessionRows.values()],
      agentEvents: [...this.agentEventRows.values()],
      agentEventSequence: this.agentEventSequence,
      helperTasks: [...this.helperTaskRows.values()],
      artifacts: [...this.artifactRows.values()],
      artifactContents: [...this.artifactContents.entries()],
    });
  }

  public static restore(snapshot: RepositorySnapshot): InMemoryDossierRepository {
    if (snapshot.format !== 1) throw new Error("Unsupported repository format");
    const copy = clone(snapshot);
    const repository = new InMemoryDossierRepository(copy.grants);
    repository.sequence = copy.sequence;
    for (const row of copy.dossiers) repository.dossierRows.set(row.id, row);
    for (const row of copy.documents) repository.documentRows.set(row.id, row);
    for (const row of copy.nodes) repository.nodeRows.set(row.id, row);
    for (const row of copy.findings) repository.findingRows.set(row.id, row);
    for (const row of copy.decisions) repository.decisionRows.set(row.id, row);
    for (const row of copy.sources) repository.sourceRows.set(row.id, row);
    for (const row of copy.dependencies) repository.dependencyRows.set(row.id, row);
    for (const row of copy.procedures) repository.procedureRows.set(row.id, row);
    for (const [key, row] of copy.commands) repository.commandRows.set(key, row);
    for (const [key, row] of copy.uploadReceipts ?? []) repository.uploadReceiptRows.set(key, row);
    for (const row of copy.agentSessions ?? []) repository.agentSessionRows.set(row.id, row);
    for (const row of copy.agentEvents ?? []) repository.agentEventRows.set(row.id, row);
    repository.agentEventSequence =
      copy.agentEventSequence ?? Math.max(0, ...(copy.agentEvents ?? []).map((event) => event.sequence));
    for (const row of copy.helperTasks ?? []) repository.helperTaskRows.set(row.id, row);
    for (const row of copy.artifacts ?? []) repository.artifactRows.set(row.id, row);
    for (const [id, content] of copy.artifactContents ?? []) repository.artifactContents.set(id, content);
    return repository;
  }

  public dossiers(): readonly DossierRecord[] {
    return [...this.dossierRows.values()].map(clone);
  }

  public dossier(id: string): DossierRecord | undefined {
    const value = this.dossierRows.get(id);
    return value ? clone(value) : undefined;
  }

  public dossierDetail(id: string): DossierDetail | undefined {
    const dossier = this.dossierRows.get(id);
    if (!dossier) return undefined;
    const nodes = dossier.nodeIds
      .map((nodeId) => this.nodeRows.get(nodeId))
      .filter((node): node is NodeRecord => Boolean(node));
    const requirements = this.procedureRows.get(dossier.procedureVersionId)?.requirements ?? [];
    const sourceIds = new Set<string>([
      ...(this.procedureRows.get(dossier.procedureVersionId)?.sourceIds ?? []),
      ...nodes.flatMap((node) => node.sourceIds),
    ]);
    return clone({
      dossier,
      nodes,
      requirements,
      sources: [...sourceIds]
        .map((sourceId) => this.sourceRows.get(sourceId))
        .filter((source): source is SourceRecord => Boolean(source)),
      evidence: [...this.documentRows.values()].filter((document) => document.dossierId === id),
      findings: [...this.findingRows.values()].filter((finding) => finding.dossierId === id),
      decisions: [...this.decisionRows.values()].filter((decision) => decision.dossierId === id),
    });
  }

  public document(id: string): DocumentRecord | undefined {
    const value = this.documentRows.get(id);
    return value ? clone(value) : undefined;
  }

  public node(id: string): NodeRecord | undefined {
    const value = this.nodeRows.get(id);
    return value ? clone(value) : undefined;
  }

  public dependency(id: string): DependencyRecord | undefined {
    const value = this.dependencyRows.get(id);
    return value ? clone(value) : undefined;
  }

  public dependencies(companyId: string, agency: Agency): readonly DependencyRecord[] {
    return [...this.dependencyRows.values()]
      .filter((dependency) => dependency.companyId === companyId && dependency.agency === agency)
      .map(clone);
  }

  public grants(): readonly DocumentGrant[] {
    return clone(this.documentGrants);
  }

  public procedures(): readonly ProcedureVersionRecord[] {
    return [...this.procedureRows.values()].map(clone);
  }

  public procedure(id: string): ProcedureVersionRecord | undefined {
    const value = this.procedureRows.get(id);
    return value ? clone(value) : undefined;
  }

  public createDossier(input: CreateDossierInput): DossierDetail {
    const procedure = requireValue(this.procedureRows.get(input.procedureVersionId));
    if (procedure.status !== "approved" && procedure.status !== "synthetic") {
      throw new AccessError(422, "procedure_version_not_pinned");
    }

    if (input.dossierId) {
      const existing = this.dossierRows.get(input.dossierId);
      if (existing) {
        if (existing.companyId !== input.companyId || existing.procedureVersionId !== procedure.id) {
          throw new AccessError(409, "dossier_conflict");
        }
        return requireValue(this.dossierDetail(existing.id));
      }
    }

    const dossierId =
      input.dossierId ?? `dossier-${input.companyId}-${procedure.agency.toLowerCase()}-${++this.sequence}`;
    const sourceId = procedure.sourceIds[0];
    const requirementByCode = new Map(
      procedure.requirements.map((requirement) => [requirement.code, requirement]),
    );
    const nodeIdByKey = new Map(
      procedure.nodes.map((definition) => [definition.key, `node-${dossierId}-${definition.key}`]),
    );
    const nodeIds: string[] = [];

    for (const definition of procedure.nodes) {
      const nodeId = nodeIdByKey.get(definition.key);
      if (!nodeId) throw new AccessError(422, "invalid_procedure_nodes");
      const requirements = definition.requirementCodes
        .map((code) => requirementByCode.get(code))
        .filter((requirement): requirement is RequirementRecord => Boolean(requirement));
      const responsibleActor =
        definition.responsible === "officer"
          ? {
              id: `officer-${procedure.agency.toLowerCase()}`,
              kind: "officer" as const,
              agency: procedure.agency,
            }
          : { id: input.companyId, kind: "business_member" as const };
      const node: NodeRecord = {
        companyId: input.companyId,
        dossierId,
        agency: procedure.agency,
        id: nodeId,
        version: 1,
        procedureVersionId: procedure.id,
        type: definition.type,
        state: "not_started",
        title: definition.title,
        content: "",
        responsibleActor,
        dependencies: definition.dependsOnKeys
          .map((key) => nodeIdByKey.get(key))
          .filter((id): id is string => Boolean(id)),
        requirementIds: requirements.map((requirement) => requirement.id),
        findingIds: [],
        sourceIds: [sourceId],
        allowedActions: [...definition.allowedActions],
        blockers: [],
        readiness: "unknown",
        agencyAcceptance: "not_submitted",
        prerequisiteStatus: "unknown",
      };
      this.nodeRows.set(node.id, node);
      nodeIds.push(node.id);
    }

    const dossier: DossierRecord = {
      companyId: input.companyId,
      dossierId,
      agency: procedure.agency,
      id: dossierId,
      title: procedure.title,
      simulated: true,
      version: 1,
      procedureVersionId: procedure.id,
      lifecycle: "draft",
      readiness: "incomplete",
      agencyAcceptance: "not_submitted",
      prerequisiteStatus: "unknown",
      nodeIds,
      confirmedFacts: {},
      updatedAt: timestamp(),
    };
    this.dossierRows.set(dossier.id, dossier);
    return requireValue(this.dossierDetail(dossier.id));
  }

  public uploadDocument(input: UploadDocumentInput) {
    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    const receiptKey = input.idempotencyKey
      ? `${input.dossierId}:${input.uploadedBy}:${input.idempotencyKey}`
      : undefined;
    const fingerprint = commandFingerprint({
      dossierId: input.dossierId,
      nodeId: input.nodeId,
      filename: input.filename,
      mimeType: input.mimeType,
      contentSha256: input.binary?.sha256 ?? checksum(input.content),
      requirementIds: input.requirementIds ?? null,
      replacesDocumentId: input.replacesDocumentId ?? null,
      expectedVersion: input.expectedVersion,
      uploadedBy: input.uploadedBy,
    });
    if (receiptKey) {
      const previous = this.uploadReceiptRows.get(receiptKey);
      if (previous) {
        if (previous.fingerprint !== fingerprint) throw new AccessError(409, "idempotency_conflict");
        return clone(previous.response);
      }
    }
    if (dossier.lifecycle === "closed" || dossier.lifecycle === "cancelled")
      throw new AccessError(409, "dossier_closed");
    assertVersion(dossier.version, input.expectedVersion);
    const node = requireValue(this.nodeRows.get(input.nodeId));
    if (
      node.dossierId !== dossier.id ||
      node.companyId !== dossier.companyId ||
      node.agency !== dossier.agency
    ) {
      throw new AccessError(404, "not_found");
    }
    if (node.type !== "document_evidence") throw new AccessError(422, "node_does_not_accept_evidence");

    const requirementIds = input.requirementIds?.length
      ? [...input.requirementIds]
      : [...node.requirementIds];
    if (!requirementIds.length || requirementIds.some((id) => !node.requirementIds.includes(id))) {
      throw new AccessError(422, "invalid_requirement_scope");
    }

    let replaces: DocumentRecord | undefined;
    if (input.replacesDocumentId) {
      replaces = requireValue(this.documentRows.get(input.replacesDocumentId));
      if (replaces.dossierId !== dossier.id || replaces.nodeId !== node.id) {
        throw new AccessError(404, "not_found");
      }
      if (
        [...this.documentRows.values()].some((document) => document.replacesId === input.replacesDocumentId)
      ) {
        throw new AccessError(409, "document_already_replaced");
      }
    }

    const documentId = `document-${dossier.id}-${++this.sequence}`;
    const document: DocumentRecord = {
      companyId: dossier.companyId,
      dossierId: dossier.id,
      agency: dossier.agency,
      nodeId: node.id,
      id: documentId,
      filename: input.filename,
      originalText: input.content,
      version: replaces ? replaces.version + 1 : 1,
      ...(replaces ? { replacesId: replaces.id } : {}),
      requirementIds,
      storageRef: input.binary?.storageRef ?? `memory://${dossier.id}/${documentId}/${input.filename}`,
      sha256: input.binary?.sha256 ?? checksum(input.content),
      mimeType: input.mimeType,
      sizeBytes: input.binary?.bytes.byteLength ?? new TextEncoder().encode(input.content).byteLength,
      uploadedBy: input.uploadedBy,
      uploadedAt: timestamp(),
      reviewStatus: "unreviewed",
      immutable: true,
    };
    this.documentRows.set(document.id, document);

    const invalidatedFindingIds: string[] = [];
    for (const finding of this.findingRows.values()) {
      const affected =
        finding.dossierId === dossier.id &&
        finding.validity === "current" &&
        (finding.nodeId === node.id ||
          (finding.requirementId && requirementIds.includes(finding.requirementId)) ||
          (replaces ? finding.evidenceIds.includes(replaces.id) : false));
      if (affected) {
        invalidatedFindingIds.push(finding.id);
        this.findingRows.set(finding.id, { ...finding, validity: "stale" });
      }
    }

    const newFindingIds: string[] = [];
    for (const requirementId of requirementIds) {
      const findingId = `finding-${document.id}-${requirementId}`;
      this.findingRows.set(findingId, {
        companyId: dossier.companyId,
        dossierId: dossier.id,
        agency: dossier.agency,
        id: findingId,
        nodeId: node.id,
        requirementId,
        evidenceIds: [document.id],
        evaluatedDossierVersion: dossier.version + 1,
        outcome: "needs_review",
        message: "Evidence changed; confirmation is required.",
        sourceIds: node.sourceIds,
        validity: "current",
      });
      newFindingIds.push(findingId);
    }

    this.nodeRows.set(node.id, {
      ...node,
      version: node.version + 1,
      state: "in_progress",
      findingIds: [...node.findingIds.filter((id) => !invalidatedFindingIds.includes(id)), ...newFindingIds],
      readiness: "needs_review",
    });
    this.dossierRows.set(dossier.id, {
      ...dossier,
      version: dossier.version + 1,
      lifecycle: dossier.lifecycle,
      readiness: "needs_review",
      updatedAt: timestamp(),
    });

    const response = {
      document: clone(document),
      detail: requireValue(this.dossierDetail(dossier.id)),
      invalidatedFindingIds: [...invalidatedFindingIds],
    };
    if (receiptKey) this.uploadReceiptRows.set(receiptKey, { fingerprint, response: clone(response) });
    return response;
  }

  public updateConfirmedFacts(input: ConfirmedFactsInput) {
    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    if (dossier.lifecycle === "closed" || dossier.lifecycle === "cancelled")
      throw new AccessError(409, "dossier_closed");
    assertVersion(dossier.version, input.expectedVersion);
    if (!Object.keys(input.changes).length) throw new AccessError(422, "empty_fact_update");

    const invalidatedFindingIds: string[] = [];
    for (const finding of this.findingRows.values()) {
      if (finding.dossierId === dossier.id && finding.validity === "current") {
        invalidatedFindingIds.push(finding.id);
        this.findingRows.set(finding.id, { ...finding, validity: "stale" });
      }
    }
    for (const nodeId of dossier.nodeIds) {
      const node = this.nodeRows.get(nodeId);
      if (node) this.nodeRows.set(nodeId, { ...node, version: node.version + 1, readiness: "needs_review" });
    }
    this.dossierRows.set(dossier.id, {
      ...dossier,
      version: dossier.version + 1,
      readiness: "needs_review",
      confirmedFacts: { ...dossier.confirmedFacts, ...input.changes },
      updatedAt: timestamp(),
    });
    return {
      detail: requireValue(this.dossierDetail(dossier.id)),
      invalidatedFindingIds: [...invalidatedFindingIds],
    };
  }

  public assignDossier(input: ReviewAssignmentInput): DossierRecord {
    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    assertVersion(dossier.version, input.expectedVersion);
    if (dossier.lifecycle === "closed" || dossier.lifecycle === "cancelled")
      throw new AccessError(409, "dossier_closed");
    if (dossier.agencyAcceptance !== "pending") throw new AccessError(409, "dossier_not_pending");
    if (dossier.assignedOfficerId && dossier.assignedOfficerId !== input.officerId) {
      throw new AccessError(409, "assignment_conflict");
    }
    if (dossier.assignedOfficerId === input.officerId) return clone(dossier);
    const assigned = {
      ...dossier,
      assignedOfficerId: input.officerId,
      assignedAt: timestamp(),
      version: dossier.version + 1,
      updatedAt: timestamp(),
    };
    this.dossierRows.set(dossier.id, assigned);
    return clone(assigned);
  }

  public dispatchCommand(input: LifecycleCommandInput): LifecycleCommandAcknowledgement {
    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    const key = `${input.dossierId}:${input.actorId}:${input.idempotencyKey}`;
    const fingerprint = commandFingerprint(input);
    const previous = this.commandRows.get(key);
    if (previous) {
      if (commandFingerprint(JSON.parse(previous.fingerprint)) !== fingerprint)
        throw new AccessError(409, "idempotency_conflict");
      return clone(previous.acknowledgement);
    }
    if (input.type === "decision_recorded" && dossier.assignedOfficerId !== input.actorId) {
      throw new AccessError(409, "dossier_not_assigned");
    }
    assertVersion(dossier.version, input.expectedVersion);
    if (dossier.lifecycle === "closed" || dossier.lifecycle === "cancelled")
      throw new AccessError(409, "dossier_closed");
    if (input.nodeId && !dossier.nodeIds.includes(input.nodeId)) throw new AccessError(404, "not_found");

    const acknowledgement: LifecycleCommandAcknowledgement = {
      commandId: `command-${dossier.id}-${++this.sequence}`,
      dossierId: dossier.id,
      type: input.type,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      status: "accepted",
      acceptedAt: timestamp(),
    };
    this.commandRows.set(key, { fingerprint, acknowledgement });
    return clone(acknowledgement);
  }

  public addProcedure(procedure: ProcedureVersionRecord, sources: readonly SourceRecord[]): void {
    for (const source of sources) this.sourceRows.set(source.id, clone(source));
    this.procedureRows.set(procedure.id, clone(procedure));
  }

  public addDossier(dossier: DossierRecord): void {
    this.dossierRows.set(dossier.id, clone(dossier));
  }

  public addNode(node: NodeRecord): void {
    this.nodeRows.set(node.id, clone(node));
  }

  public addDocument(document: DocumentRecord): void {
    this.documentRows.set(document.id, clone(document));
  }

  public addFinding(finding: FindingRecord): void {
    this.findingRows.set(finding.id, clone(finding));
  }

  public addDecision(decision: DecisionRecord): void {
    if (this.decisionRows.has(decision.id)) throw new AccessError(409, "decision_already_recorded");
    this.decisionRows.set(decision.id, clone(decision));
  }

  public addDependency(dependency: DependencyRecord): void {
    this.dependencyRows.set(dependency.id, clone(dependency));
  }

  public agentSession(id: string, dossierId: string, principalId: string): AgentSessionRecord | undefined {
    const session = this.agentSessionRows.get(id);
    if (!session || session.dossierId !== dossierId || session.principalId !== principalId) return undefined;
    return clone(session);
  }

  public createAgentSession(input: CreateAgentSessionInput): AgentSessionRecord {
    const id = input.id ?? `agent-session-${randomUUID()}`;
    const existing = this.agentSessionRows.get(id);
    if (existing) {
      if (existing.dossierId !== input.dossierId || existing.principalId !== input.principalId) {
        throw new AccessError(409, "agent_session_conflict");
      }
      return clone(existing);
    }
    const now = timestamp();
    const session: AgentSessionRecord = {
      id,
      dossierId: input.dossierId,
      principalId: input.principalId,
      ...(input.selectedNodeId ? { selectedNodeId: input.selectedNodeId } : {}),
      history: [],
      createdAt: now,
      updatedAt: now,
    };
    this.agentSessionRows.set(id, session);
    return clone(session);
  }

  public saveAgentSession(session: AgentSessionRecord): AgentSessionRecord {
    const previous = this.agentSessionRows.get(session.id);
    if (
      previous &&
      (previous.dossierId !== session.dossierId || previous.principalId !== session.principalId)
    ) {
      throw new AccessError(409, "agent_session_conflict");
    }
    const saved = { ...session, updatedAt: timestamp(), history: [...session.history] };
    this.agentSessionRows.set(session.id, clone(saved));
    return clone(saved);
  }

  public appendAgentEvent(input: AgentEventInput): AgentEventRecord {
    const event: AgentEventRecord = {
      id: `${input.sessionId}:${++this.agentEventSequence}`,
      sequence: this.agentEventSequence,
      sessionId: input.sessionId,
      dossierId: input.dossierId,
      actorId: input.actorId,
      type: input.type,
      data: { ...(input.data ?? {}) },
      occurredAt: timestamp(),
    };
    this.agentEventRows.set(event.id, event);
    return clone(event);
  }

  public agentEvents(sessionId: string, after: number): readonly AgentEventRecord[] {
    return [...this.agentEventRows.values()]
      .filter((event) => event.sessionId === sessionId && event.sequence > after)
      .sort((a, b) => a.sequence - b.sequence)
      .slice(0, 100)
      .map(clone);
  }

  public createHelperTask(input: CreateHelperTaskInput): HelperTaskRecord {
    const existing = [...this.helperTaskRows.values()].find(
      (task) =>
        task.dossierId === input.dossierId &&
        task.requestedBy === input.requestedBy &&
        task.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      if (
        existing.title !== input.title ||
        existing.description !== input.description ||
        existing.nodeId !== input.nodeId
      ) {
        throw new AccessError(409, "idempotency_conflict");
      }
      return clone(existing);
    }
    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    const task: HelperTaskRecord = {
      companyId: dossier.companyId,
      dossierId: dossier.id,
      agency: dossier.agency,
      id: `helper-task-${dossier.id}-${++this.sequence}`,
      ...(input.nodeId ? { nodeId: input.nodeId } : {}),
      title: input.title,
      description: input.description,
      requestedBy: input.requestedBy,
      status: "open",
      idempotencyKey: input.idempotencyKey,
      createdAt: timestamp(),
    };
    this.helperTaskRows.set(task.id, task);
    return clone(task);
  }

  public helperTask(id: string): HelperTaskRecord | undefined {
    const task = this.helperTaskRows.get(id);
    return task ? clone(task) : undefined;
  }

  public publishArtifact(input: PublishArtifactInput): ArtifactRecord {
    const existing = [...this.artifactRows.values()].find(
      (artifact) =>
        artifact.dossierId === input.dossierId &&
        artifact.createdBy === input.createdBy &&
        artifact.idempotencyKey === input.idempotencyKey,
    );
    if (existing) {
      const checksumValue = createHash("sha256").update(input.bytes).digest("hex");
      if (
        existing.sha256 !== checksumValue ||
        existing.nodeId !== input.nodeId ||
        existing.draftKey !== input.draftKey
      ) {
        throw new AccessError(409, "idempotency_conflict");
      }
      return clone(existing);
    }

    const dossier = requireValue(this.dossierRows.get(input.dossierId));
    const currentVersions = [...this.artifactRows.values()]
      .filter(
        (artifact) =>
          artifact.dossierId === dossier.id &&
          artifact.nodeId === input.nodeId &&
          artifact.draftKey === input.draftKey,
      )
      .map((artifact) => artifact.version);
    const bytes = new Uint8Array(input.bytes);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (sha256 !== input.provenance.sha256) throw new AccessError(422, "artifact_checksum_mismatch");
    const id = `artifact-${dossier.id}-${++this.sequence}`;
    const artifact: ArtifactRecord = {
      companyId: dossier.companyId,
      dossierId: dossier.id,
      agency: dossier.agency,
      id,
      nodeId: input.nodeId,
      draftKey: input.draftKey,
      filename: input.filename,
      mimeType: input.mimeType,
      sizeBytes: bytes.byteLength,
      sha256,
      storageRef: input.storageRef ?? `memory://${dossier.id}/${id}/${input.filename}`,
      version: Math.max(0, ...currentVersions) + 1,
      provenance: clone(input.provenance),
      createdBy: input.createdBy,
      idempotencyKey: input.idempotencyKey,
      createdAt: timestamp(),
      immutable: true,
    };
    this.artifactRows.set(id, artifact);
    this.artifactContents.set(id, Buffer.from(bytes).toString("base64"));
    return clone(artifact);
  }

  public artifact(id: string): ArtifactRecord | undefined {
    const artifact = this.artifactRows.get(id);
    return artifact ? clone(artifact) : undefined;
  }

  public readArtifact(id: string): Uint8Array {
    const artifact = requireValue(this.artifactRows.get(id));
    const content = this.artifactContents.get(id);
    if (content === undefined) throw new AccessError(500, "artifact_not_available");
    const bytes = new Uint8Array(Buffer.from(content, "base64"));
    if (createHash("sha256").update(bytes).digest("hex") !== artifact.sha256) {
      throw new AccessError(500, "file_integrity_failure");
    }
    return bytes;
  }
}

const procedureSource = (agency: Agency): SourceRecord => ({
  id: `source-${agency.toLowerCase()}`,
  kind: "synthetic",
  uri: `https://example.invalid/synthetic/${agency}`,
  passage: "Synthetic test condition only; not a legal requirement.",
  sha256: checksum(`synthetic/${agency}`),
  retrievedAt: "2026-09-12T12:00:00.000Z",
});

const procedureNodes: readonly ProcedureNodeDefinition[] = ALL_NODE_TYPES.map((type, index) => ({
  key: type,
  type,
  title: type.replaceAll("_", " "),
  dependsOnKeys: index === 0 ? [] : [ALL_NODE_TYPES[index - 1]],
  requirementCodes: type === "document_evidence" ? ["SYNTHETIC-01", "SYNTHETIC-02"] : [],
  responsible: type === "decision" || type === "human_review" ? "officer" : "business_member",
  allowedActions:
    type === "information_input"
      ? ["view", "edit_facts"]
      : type === "document_evidence"
        ? ["view", "upload_evidence", "correct_evidence", "request_review"]
        : type === "document_preparation"
          ? ["view", "prepare_document"]
          : type === "validation"
            ? ["view", "run_validation"]
            : type === "decision" || type === "human_review"
              ? ["view", "record_decision"]
              : type === "submission"
                ? ["view", "submit", "resubmit"]
                : ["view", "execute_external"],
}));

export function createDemoDossierRepository(
  grants: readonly DocumentGrant[] = [],
): InMemoryDossierRepository {
  const repository = new InMemoryDossierRepository(grants);
  const agencies: readonly Agency[] = ["DGI", "RNE", "APII"];

  for (const agency of agencies) {
    const source = procedureSource(agency);
    const requirements: readonly RequirementRecord[] = ["SYNTHETIC-01", "SYNTHETIC-02"].map(
      (code, index) => ({
        id: `requirement-${agency.toLowerCase()}-synthetic-0${index + 1}`,
        procedureVersionId: `procedure-${agency.toLowerCase()}-v1`,
        code,
        description: "Synthetic supporting document",
        evidenceType: "synthetic_document",
        minimumCount: 1,
        applicability: "applicable",
        sourceIds: [source.id],
      }),
    );
    repository.addProcedure(
      {
        id: `procedure-${agency.toLowerCase()}-v1`,
        code: `synthetic_${agency.toLowerCase()}_journey`,
        version: "demo-1",
        agency,
        title: `${agency} synthetic journey — not an official procedure`,
        status: "synthetic",
        sourceIds: [source.id],
        requirements,
        nodes: procedureNodes,
      },
      [source],
    );
  }

  for (const company of ["alpha", "beta"]) {
    for (const agency of agencies) {
      const lowerAgency = agency.toLowerCase();
      const suffix = `${company}-${lowerAgency}`;
      const companyId = `company-${company}`;
      const dossierId = `dossier-${suffix}`;
      const procedureId = `procedure-${lowerAgency}-v1`;
      const source = procedureSource(agency);
      const requirementIds = [
        `requirement-${lowerAgency}-synthetic-01`,
        `requirement-${lowerAgency}-synthetic-02`,
      ];
      const nodeIds = procedureNodes.map((definition) =>
        definition.key === "information_input" ? `node-${suffix}` : `node-${suffix}-${definition.key}`,
      );
      const nodeIdByKey = new Map(
        procedureNodes.map((definition, index) => [definition.key, nodeIds[index]]),
      );
      const prerequisiteStatus: PrerequisiteStatus = agency === "DGI" ? "satisfied" : "unknown";

      for (const [index, definition] of procedureNodes.entries()) {
        const nodeId = nodeIds[index];
        const node: NodeRecord = {
          companyId,
          dossierId,
          agency,
          id: nodeId,
          version: 1,
          procedureVersionId: procedureId,
          type: definition.type,
          state: "not_started",
          title: definition.title,
          content: "",
          responsibleActor:
            definition.responsible === "officer"
              ? { id: `demo-officer-${lowerAgency}`, kind: "officer", agency }
              : { id: `demo-member-${company}`, kind: "business_member" },
          dependencies: definition.dependsOnKeys
            .map((key) => nodeIdByKey.get(key))
            .filter((id): id is string => Boolean(id)),
          requirementIds: definition.type === "document_evidence" ? requirementIds : [],
          findingIds: [],
          sourceIds: [source.id],
          allowedActions: [...definition.allowedActions],
          blockers: [],
          readiness: "unknown",
          agencyAcceptance: "not_submitted",
          prerequisiteStatus,
        };
        repository.addNode(node);
      }

      const evidenceNodeId = nodeIdByKey.get("document_evidence")!;
      const documentId = `document-${suffix}`;
      const document: DocumentRecord = {
        companyId,
        dossierId,
        agency,
        nodeId: evidenceNodeId,
        id: documentId,
        filename: "synthetic.txt",
        originalText: "Synthetic confidential document content",
        version: 1,
        requirementIds,
        storageRef: `memory://${dossierId}/${documentId}/synthetic.txt`,
        sha256: checksum("Synthetic confidential document content"),
        mimeType: "text/plain",
        sizeBytes: new TextEncoder().encode("Synthetic confidential document content").byteLength,
        uploadedBy: `demo-member-${company}`,
        uploadedAt: "2026-09-12T12:00:00.000Z",
        reviewStatus: "unreviewed",
        immutable: true,
      };
      repository.addDocument(document);

      const finding: FindingRecord = {
        companyId,
        dossierId,
        agency,
        id: `finding-${suffix}`,
        nodeId: evidenceNodeId,
        requirementId: requirementIds[0],
        evidenceIds: [documentId],
        evaluatedDossierVersion: 1,
        outcome: "needs_review",
        message: "Synthetic document awaits confirmation.",
        sourceIds: [source.id],
        validity: "current",
      };
      repository.addFinding(finding);
      const evidenceNode = repository.node(evidenceNodeId)!;
      repository.addNode({ ...evidenceNode, findingIds: [finding.id] });

      repository.addDossier({
        companyId,
        dossierId,
        agency,
        id: dossierId,
        title: "Synthetic dossier",
        simulated: true,
        version: 1,
        procedureVersionId: procedureId,
        lifecycle: "active",
        readiness: "needs_review",
        agencyAcceptance: "not_submitted",
        prerequisiteStatus,
        nodeIds,
        confirmedFacts: {},
        updatedAt: "2026-09-12T12:00:00.000Z",
      });

      repository.addDependency({
        companyId,
        agency,
        id: `dependency-${suffix}`,
        consumerAgencies: company === "alpha" && agency === "DGI" ? ["RNE"] : [],
        status: prerequisiteStatus,
        observedAt: "2026-09-12T12:00:00.000Z",
        simulated: true,
      });
    }
  }

  return repository;
}
