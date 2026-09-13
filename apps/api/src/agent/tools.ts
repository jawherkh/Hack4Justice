import { randomUUID } from "node:crypto";

import { tool, type RunContext } from "@openai/agents";
import { z } from "zod";

import {
  AccessError,
  canEditEvidence,
  canReadDossier,
  canReview,
  type Principal,
  requireAccess,
} from "../access/policy";
import type {
  AgentRepository,
  ArtifactRecord,
  DossierDetail,
  DocumentRecord,
  FindingRecord,
  NodeRecord,
  ProcedureVersionRecord,
  AgentEventType,
} from "../dossiers/store";
import type { KnowledgeSearch } from "../knowledge/search";
import type { ProjectDockerSandboxSession } from "../sandbox/client";

const identifier = z.string().trim().min(1).max(200);
const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
// Strict Structured Outputs cannot represent an arbitrary-key record because every object
// must set additionalProperties=false. Use a typed key/value list instead.
const values = z
  .array(
    z.strictObject({
      key: z.string().trim().min(1).max(200),
      value: scalar,
    }),
  )
  .min(1)
  .max(100);

export interface PrincipalAgentToolContext {
  readonly repository: AgentRepository;
  readonly principal: Principal;
  readonly dossierId: string;
  readonly sessionId: string;
  selectedNodeId?: string;
  readonly userConfirmedAction?: "submission_requested" | "resubmission_requested" | "cancellation_requested";
  readonly sandbox?: ProjectDockerSandboxSession;
  /** Approved legal sources. Absent when the knowledge service is not configured. */
  readonly knowledge?: KnowledgeSearch;
  readonly emit?: (type: AgentEventType, data?: Readonly<Record<string, unknown>>) => Promise<void>;
}

async function emit(
  context: PrincipalAgentToolContext,
  type: AgentEventType,
  data?: Readonly<Record<string, unknown>>,
) {
  await context.emit?.(type, data);
}

function agentContext(runContext: RunContext<unknown> | undefined): PrincipalAgentToolContext {
  if (!runContext) throw new AccessError(500, "agent_context_missing");
  return runContext.context as PrincipalAgentToolContext;
}

async function detailFor(context: PrincipalAgentToolContext, write = false): Promise<DossierDetail> {
  const detail = await context.repository.dossierDetail(context.dossierId);
  if (!detail) throw new AccessError(404, "not_found");
  requireAccess(canReadDossier(context.principal, detail.dossier));
  if (write) requireAccess(canEditEvidence(context.principal, detail.dossier));
  return detail;
}

function nodeFor(detail: DossierDetail, nodeId: string): NodeRecord {
  const node = detail.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new AccessError(404, "not_found");
  if (
    node.dossierId !== detail.dossier.id ||
    node.companyId !== detail.dossier.companyId ||
    node.agency !== detail.dossier.agency
  ) {
    throw new AccessError(404, "not_found");
  }
  return node;
}

function procedureFor(
  detail: DossierDetail,
  procedure: ProcedureVersionRecord | undefined,
): ProcedureVersionRecord {
  if (
    !procedure ||
    procedure.id !== detail.dossier.procedureVersionId ||
    (procedure.status !== "approved" && procedure.status !== "synthetic")
  ) {
    throw new AccessError(422, "procedure_version_not_pinned");
  }
  return procedure;
}

async function approvedProcedure(
  context: PrincipalAgentToolContext,
  detail: DossierDetail,
): Promise<ProcedureVersionRecord> {
  return procedureFor(detail, await context.repository.procedure(detail.dossier.procedureVersionId));
}

function nodeView(node: NodeRecord) {
  return {
    id: node.id,
    type: node.type,
    title: node.title,
    version: node.version,
    state: node.state,
    content: node.content,
    dependencies: node.dependencies,
    allowedActions: node.allowedActions,
    blockers: node.blockers,
    readiness: node.readiness,
    agencyAcceptance: node.agencyAcceptance,
    prerequisiteStatus: node.prerequisiteStatus,
  };
}

function sourceView(detail: DossierDetail, sourceIds: readonly string[]) {
  return detail.sources
    .filter((source) => sourceIds.includes(source.id))
    .map((source) => ({
      id: source.id,
      kind: source.kind,
      uri: source.uri,
      passage: source.passage,
      page: source.page,
      section: source.section,
      retrievedAt: source.retrievedAt,
      // Legal text is source data, not an instruction to the model.
      untrustedData: true,
    }));
}

function findingView(detail: DossierDetail, finding: FindingRecord) {
  return {
    id: finding.id,
    nodeId: finding.nodeId,
    requirementId: finding.requirementId,
    evidenceIds: finding.evidenceIds,
    evaluatedDossierVersion: finding.evaluatedDossierVersion,
    outcome: finding.outcome,
    message: finding.message,
    validity: finding.validity,
    sources: sourceView(detail, finding.sourceIds),
  };
}

function documentView(document: DocumentRecord) {
  return {
    id: document.id,
    nodeId: document.nodeId,
    filename: document.filename,
    version: document.version,
    requirementIds: document.requirementIds,
    mimeType: document.mimeType,
    sizeBytes: document.sizeBytes,
    sha256: document.sha256,
    reviewStatus: document.reviewStatus,
    uploadedAt: document.uploadedAt,
    // Original bytes/text remain in document storage and are never placed in agent history.
    sourceDataAvailable: true,
  };
}

export const getDossierContextTool = tool({
  name: "get_dossier_context",
  description:
    "Read the authorized dossier, pinned procedure, dependencies, findings, evidence metadata and source-linked legal context.",
  parameters: z.object({}),
  strict: true,
  async execute(_input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const procedure = await approvedProcedure(context, detail);
    const dependencies = await context.repository.dependencies(
      detail.dossier.companyId,
      detail.dossier.agency,
    );
    const currentNodeId = context.selectedNodeId;
    return {
      dossier: {
        id: detail.dossier.id,
        title: detail.dossier.title,
        companyId: detail.dossier.companyId,
        agency: detail.dossier.agency,
        version: detail.dossier.version,
        lifecycle: detail.dossier.lifecycle,
        readiness: detail.dossier.readiness,
        agencyAcceptance: detail.dossier.agencyAcceptance,
        prerequisiteStatus: detail.dossier.prerequisiteStatus,
        confirmedFacts: detail.dossier.confirmedFacts,
        currentNodeId: currentNodeId ?? null,
      },
      procedure: {
        id: procedure.id,
        code: procedure.code,
        version: procedure.version,
        title: procedure.title,
        status: procedure.status,
      },
      dependencies,
      nodes: detail.nodes.map(nodeView),
      requirements: detail.requirements,
      evidence: detail.evidence.map((document) => ({
        id: document.id,
        nodeId: document.nodeId,
        filename: document.filename,
        version: document.version,
        requirementIds: document.requirementIds,
        mimeType: document.mimeType,
        sizeBytes: document.sizeBytes,
        sha256: document.sha256,
        reviewStatus: document.reviewStatus,
        uploadedAt: document.uploadedAt,
        // Original bytes are intentionally not included in every turn.
        sourceDataAvailable: true,
      })),
      findings: detail.findings.map((finding) => findingView(detail, finding)),
      sources: sourceView(
        detail,
        detail.sources.map((source) => source.id),
      ),
      allowedActions: detail.nodes
        .flatMap((node) => node.allowedActions)
        .filter((action, index, actions) => actions.indexOf(action) === index),
    };
  },
});

export const getNodeContextTool = tool({
  name: "get_node_context",
  description:
    "Open one authorized dossier node with its dependencies, requirements, findings and source-linked evidence metadata.",
  parameters: z.object({ nodeId: identifier }),
  strict: true,
  async execute({ nodeId }, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const node = nodeFor(detail, nodeId);
    const dependencies = await context.repository.dependencies(
      detail.dossier.companyId,
      detail.dossier.agency,
    );
    return {
      node: nodeView(node),
      dossierDependencies: dependencies,
      dependencies: detail.nodes
        .filter((candidate) => node.dependencies.includes(candidate.id))
        .map(nodeView),
      requirements: detail.requirements.filter((requirement) => node.requirementIds.includes(requirement.id)),
      evidence: detail.evidence
        .filter((document) => document.nodeId === node.id)
        .map((document) => ({
          id: document.id,
          filename: document.filename,
          version: document.version,
          requirementIds: document.requirementIds,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          sha256: document.sha256,
          reviewStatus: document.reviewStatus,
        })),
      findings: detail.findings
        .filter((finding) => node.findingIds.includes(finding.id))
        .map((finding) => findingView(detail, finding)),
      sources: sourceView(detail, node.sourceIds),
    };
  },
});

export const selectNodeTool = tool({
  name: "select_node",
  description:
    "Select an authorized dossier node for the current conversation; selection does not change the dossier.",
  parameters: z.object({ nodeId: identifier }),
  strict: true,
  async execute({ nodeId }, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const node = nodeFor(detail, nodeId);
    context.selectedNodeId = node.id;
    const session = await context.repository.agentSession(
      context.sessionId,
      context.dossierId,
      context.principal.id,
    );
    if (session) await context.repository.saveAgentSession({ ...session, selectedNodeId: node.id });
    await emit(context, "node_selected", { nodeId: node.id, title: node.title });
    return { selectedNodeId: node.id, node: nodeView(node) };
  },
});

export const proposeValuesTool = tool({
  name: "propose_values",
  description:
    "Prepare explicit candidate values for a node without asserting facts or mutating the dossier. Ask the user to confirm uncertain values.",
  parameters: z.object({ nodeId: identifier, values }),
  strict: true,
  async execute({ nodeId, values: proposedValues }, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const node = nodeFor(detail, nodeId);
    const proposalId = `proposal-${randomUUID()}`;
    return {
      proposalId,
      nodeId: node.id,
      values: proposedValues,
      status: "proposed",
      requiresUserConfirmation: true,
      evidenceRequiredForAssertion: true,
      message:
        "Candidate values were not written. The responsible user must confirm them before a facts update.",
    };
  },
});

const attachEvidenceParameters = z
  .object({
    nodeId: identifier,
    filename: z.string().trim().min(1).max(255),
    mimeType: z.string().trim().min(1).max(100),
    content: z
      .string()
      .max(10 * 1024 * 1024)
      .optional(),
    artifactPath: z.string().trim().min(1).max(500).optional(),
    requirementIds: z.array(identifier).min(1).max(50).optional(),
    replacesDocumentId: identifier.optional(),
    expectedVersion: z.number().int().positive(),
    idempotencyKey: identifier,
  })
  .superRefine((input, issue) => {
    if (Boolean(input.content) === Boolean(input.artifactPath))
      issue.addIssue({ code: "custom", message: "Provide exactly one of content or artifactPath" });
  });

export const attachEvidenceTool = tool({
  name: "attach_evidence",
  description:
    "Attach new evidence to a document-evidence node using explicit text or a sandbox artifact. Server-side scope, version and idempotency checks always apply.",
  parameters: attachEvidenceParameters,
  strict: true,
  async execute(input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context, true);
    const node = nodeFor(detail, input.nodeId);
    if (node.type !== "document_evidence") throw new AccessError(422, "node_does_not_accept_evidence");
    const action = input.replacesDocumentId ? "correct_evidence" : "upload_evidence";
    if (!node.allowedActions.includes(action)) throw new AccessError(403, "action_not_permitted");

    let content = input.content;
    let bytes: Uint8Array | undefined;
    if (input.artifactPath) {
      if (!context.sandbox) throw new AccessError(503, "sandbox_not_configured");
      const exported = await context.sandbox.exportWorkspaceArtifact(input.artifactPath);
      bytes = exported.bytes;
      content = new TextDecoder().decode(exported.bytes);
    }
    const upload =
      context.repository.uploadFile && bytes
        ? await context.repository.uploadFile({
            dossierId: detail.dossier.id,
            nodeId: node.id,
            filename: input.filename,
            mimeType: input.mimeType,
            requirementIds: input.requirementIds,
            replacesDocumentId: input.replacesDocumentId,
            expectedVersion: input.expectedVersion,
            uploadedBy: context.principal.id,
            bytes,
            idempotencyKey: input.idempotencyKey,
          })
        : await context.repository.uploadDocument({
            dossierId: detail.dossier.id,
            nodeId: node.id,
            filename: input.filename,
            mimeType: input.mimeType,
            content: content ?? "",
            requirementIds: input.requirementIds,
            replacesDocumentId: input.replacesDocumentId,
            expectedVersion: input.expectedVersion,
            uploadedBy: context.principal.id,
            idempotencyKey: input.idempotencyKey,
          });
    await emit(context, "tool_completed", {
      tool: "attach_evidence",
      nodeId: node.id,
      documentId: upload.document.id,
      dossierVersion: upload.detail.dossier.version,
      invalidatedFindingIds: upload.invalidatedFindingIds,
    });
    return {
      document: documentView(upload.document),
      dossier: upload.detail.dossier,
      invalidatedFindingIds: upload.invalidatedFindingIds,
      sourceArtifactPath: input.artifactPath ?? null,
    };
  },
});

export const createHelperTaskTool = tool({
  name: "create_helper_task",
  description:
    "Create an idempotent helper task for a human or specialist. This does not grant rights or submit a dossier.",
  parameters: z.object({
    nodeId: identifier.optional(),
    title: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(2000),
    idempotencyKey: identifier,
  }),
  strict: true,
  async execute(input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    if (input.nodeId) nodeFor(detail, input.nodeId);
    requireAccess(
      canEditEvidence(context.principal, detail.dossier) || canReview(context.principal, detail.dossier),
    );
    const task = await context.repository.createHelperTask({
      ...input,
      dossierId: detail.dossier.id,
      requestedBy: context.principal.id,
    });
    await emit(context, "task_created", { taskId: task.id, nodeId: task.nodeId ?? null });
    return task;
  },
});

export const runChecksTool = tool({
  name: "run_checks",
  description:
    "Read current readiness, findings and dependency blockers for the dossier or one node without changing legal rules or evidence status.",
  parameters: z.object({ nodeId: identifier.optional() }),
  strict: true,
  async execute({ nodeId }, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const nodes = nodeId ? [nodeFor(detail, nodeId)] : detail.nodes;
    const findings = detail.findings.filter((finding) => nodes.some((node) => node.id === finding.nodeId));
    return {
      dossierId: detail.dossier.id,
      dossierVersion: detail.dossier.version,
      readiness: detail.dossier.readiness,
      prerequisiteStatus: detail.dossier.prerequisiteStatus,
      nodes: nodes.map((node) => ({
        id: node.id,
        title: node.title,
        state: node.state,
        readiness: node.readiness,
        blockers: node.blockers,
        findings: findings
          .filter((finding) => finding.nodeId === node.id)
          .map((finding) => findingView(detail, finding)),
      })),
      findings: findings.map((finding) => findingView(detail, finding)),
      sourceLinked: true,
    };
  },
});

const transitionType = z.enum([
  "evidence_changed",
  "review_requested",
  "submission_requested",
  "resubmission_requested",
  "cancellation_requested",
  "decision_recorded",
]);
const decision = z.object({
  action: z.enum(["accept", "refuse", "request_modification"]),
  reason: z.string().trim().min(1).max(2000),
  targetNodeIds: z.array(identifier).max(100).default([]),
  evidenceIds: z.array(identifier).max(100).default([]),
});

export const requestTransitionTool = tool({
  name: "request_permitted_transition",
  description:
    "Request one server-validated dossier transition. Submission, resubmission and cancellation require confirmation from the responsible authenticated user.",
  parameters: z
    .object({
      type: transitionType,
      nodeId: identifier.optional(),
      expectedVersion: z.number().int().positive(),
      idempotencyKey: identifier,
      correlationId: identifier.optional(),
      confirmed: z.boolean().optional(),
      decision: decision.optional(),
    })
    .superRefine((input, issue) => {
      if ((input.type === "decision_recorded") !== Boolean(input.decision))
        issue.addIssue({ code: "custom", message: "Decision payload does not match transition type" });
      if (input.type === "decision_recorded" && !input.nodeId)
        issue.addIssue({ code: "custom", message: "A review node is required" });
    }),
  strict: true,
  async execute(input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const node = input.nodeId ? nodeFor(detail, input.nodeId) : undefined;
    if (input.type === "decision_recorded") {
      requireAccess(canReview(context.principal, detail.dossier));
      if (
        !node ||
        !["decision", "human_review"].includes(node.type) ||
        !node.allowedActions.includes("record_decision")
      ) {
        throw new AccessError(422, "invalid_review_node");
      }
      if (
        input.decision?.targetNodeIds.some((id) => !detail.nodes.some((candidate) => candidate.id === id)) ||
        input.decision?.evidenceIds.some((id) => !detail.evidence.some((document) => document.id === id))
      ) {
        throw new AccessError(422, "invalid_evidence_scope");
      }
    } else {
      requireAccess(canEditEvidence(context.principal, detail.dossier));
      const requiredAction =
        input.type === "evidence_changed"
          ? "upload_evidence"
          : input.type === "review_requested"
            ? "request_review"
            : input.type === "submission_requested"
              ? "submit"
              : input.type === "resubmission_requested"
                ? "resubmit"
                : "cancel";
      if (requiredAction !== "cancel") {
        if (!node) throw new AccessError(422, "node_required");
        if (!node.allowedActions.includes(requiredAction)) throw new AccessError(403, "action_not_permitted");
      }
    }

    if (["submission_requested", "resubmission_requested", "cancellation_requested"].includes(input.type)) {
      if (!input.confirmed || context.userConfirmedAction !== input.type)
        throw new AccessError(422, "explicit_confirmation_required");
    }
    const acknowledgement = await context.repository.dispatchCommand({
      dossierId: detail.dossier.id,
      actorId: context.principal.id,
      type: input.type,
      expectedVersion: input.expectedVersion,
      idempotencyKey: input.idempotencyKey,
      nodeId: input.nodeId,
      correlationId: input.correlationId,
      confirmed: input.confirmed,
      decision: input.decision,
    });
    await emit(context, "tool_completed", {
      tool: "request_permitted_transition",
      commandId: acknowledgement.commandId,
      type: input.type,
    });
    return { acknowledgement, requiresTemporalProcessing: true };
  },
});

const prepareDocumentParameters = z.object({
  nodeId: identifier,
  templateId: identifier,
  outputPath: z.string().trim().min(1).max(500),
  filename: z.string().trim().min(1).max(255),
  values,
});

export const prepareDocumentTool = tool({
  name: "prepare_document",
  description:
    "Fill the server-approved synthetic template for a document-preparation node and write an explicitly unverified draft into the sandbox.",
  parameters: prepareDocumentParameters,
  strict: true,
  async execute(input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const procedure = await approvedProcedure(context, detail);
    const node = nodeFor(detail, input.nodeId);
    if (node.type !== "document_preparation" || node.procedureVersionId !== procedure.id)
      throw new AccessError(422, "invalid_preparation_node");
    requireAccess(canEditEvidence(context.principal, detail.dossier));
    if (!node.allowedActions.includes("prepare_document")) throw new AccessError(403, "action_not_permitted");
    const expectedTemplateId = `template-${procedure.id}-${node.id}`;
    if (input.templateId !== expectedTemplateId) throw new AccessError(422, "template_not_approved");
    if (!context.sandbox) throw new AccessError(503, "sandbox_not_configured");
    const draft = JSON.stringify(
      {
        templateId: expectedTemplateId,
        procedureVersionId: procedure.id,
        dossierId: detail.dossier.id,
        nodeId: node.id,
        status: "draft_unverified",
        values: input.values,
        sourceDocumentIds: [],
        warning: "Generated draft. It is not a declaration, signature, official filing or acceptance.",
        generatedAt: new Date().toISOString(),
      },
      null,
      2,
    );
    await context.sandbox.writeWorkspaceFile(input.outputPath, draft);
    await emit(context, "tool_completed", {
      tool: "prepare_document",
      nodeId: node.id,
      outputPath: input.outputPath,
      status: "draft_unverified",
    });
    return {
      outputPath: input.outputPath,
      filename: input.filename,
      templateId: expectedTemplateId,
      status: "draft_unverified",
    };
  },
});

const publishArtifactParameters = z.object({
  nodeId: identifier,
  path: z.string().trim().min(1).max(500),
  draftKey: identifier,
  filename: z.string().trim().min(1).max(255),
  mimeType: z.string().trim().min(1).max(100),
  sourceDocumentIds: z.array(identifier).max(100).default([]),
  idempotencyKey: identifier,
});

export const publishArtifactTool = tool({
  name: "publish_generated_artifact",
  description:
    "Export a sandbox file as an immutable, versioned draft with source and run provenance. Publishing never submits or signs it.",
  parameters: publishArtifactParameters,
  strict: true,
  async execute(input, runContext) {
    const context = agentContext(runContext);
    const detail = await detailFor(context);
    const procedure = await approvedProcedure(context, detail);
    const node = nodeFor(detail, input.nodeId);
    if (
      node.procedureVersionId !== procedure.id ||
      !["document_preparation", "validation"].includes(node.type)
    )
      throw new AccessError(422, "invalid_artifact_node");
    requireAccess(canEditEvidence(context.principal, detail.dossier));
    if (input.sourceDocumentIds.some((id) => !detail.evidence.some((document) => document.id === id)))
      throw new AccessError(422, "invalid_evidence_scope");
    if (!context.sandbox) throw new AccessError(503, "sandbox_not_configured");
    const exported = await context.sandbox.exportWorkspaceArtifact(input.path);
    const artifact = await context.repository.publishArtifact({
      dossierId: detail.dossier.id,
      nodeId: node.id,
      draftKey: input.draftKey,
      filename: input.filename,
      mimeType: input.mimeType,
      bytes: exported.bytes,
      provenance: {
        path: exported.provenance.path,
        dossierId: detail.dossier.id,
        runId: exported.provenance.runId,
        sourceDocumentIds: input.sourceDocumentIds,
        sha256: exported.provenance.sha256,
        exportedAt: exported.provenance.exportedAt,
      },
      createdBy: context.principal.id,
      idempotencyKey: input.idempotencyKey,
    });
    await emit(context, "artifact_created", {
      artifactId: artifact.id,
      version: artifact.version,
      path: input.path,
    });
    return { artifact, previewAvailable: true, downloadAvailable: true };
  },
});

const legalQuery = z.string().trim().min(1).max(1_000);

export const searchLegalKnowledgeTool = tool({
  name: "search_legal_knowledge",
  description: [
    "Search the approved legal sources for this dossier's agency and return passages with the reference of each stored statement.",
    "Use it before answering any question about what a rule, procedure, deadline or required document is.",
    "Cite the reference of every passage you rely on.",
    "When needsReview is true no approved source supports an answer: say the point needs review instead of answering from memory.",
  ].join(" "),
  parameters: z.object({ query: legalQuery }),
  strict: true,
  async execute({ query }, runContext) {
    const context = agentContext(runContext);
    // Reading the dossier first applies its access check, and supplies the agency. The
    // agency is never taken from model input, so one agency's dossier cannot read another's
    // rules by asking for them.
    const detail = await detailFor(context);
    if (!context.knowledge) {
      return {
        agency: detail.dossier.agency,
        query,
        passages: [],
        needsReview: true,
        reason: "knowledge_source_unavailable",
      };
    }
    try {
      return await context.knowledge.search({ agency: detail.dossier.agency, query });
    } catch (error) {
      // A lookup that could not run is not an absence of rules. Reporting it as needing
      // review keeps the model from filling the gap from its own memory.
      return {
        agency: detail.dossier.agency,
        query,
        passages: [],
        needsReview: true,
        reason: error instanceof Error ? error.message : "knowledge_search_failed",
      };
    }
  },
});

export const principalAgentTools = [
  getDossierContextTool,
  getNodeContextTool,
  searchLegalKnowledgeTool,
  selectNodeTool,
  proposeValuesTool,
  attachEvidenceTool,
  createHelperTaskTool,
  runChecksTool,
  requestTransitionTool,
  prepareDocumentTool,
  publishArtifactTool,
] as const;

export function isAgentToolEventType(type: string): type is AgentEventType {
  return [
    "run_started",
    "agent_updated",
    "text_delta",
    "tool_started",
    "tool_completed",
    "tool_failed",
    "node_selected",
    "task_created",
    "artifact_created",
    "run_completed",
    "run_failed",
  ].includes(type);
}

export type PublishedArtifact = ArtifactRecord;
