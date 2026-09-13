import { buildPaginatedResponse, paginationQuerySchema } from "@hack4justice/shared";
import { Elysia } from "elysia";
import { z } from "zod";

import type { Agency, Principal } from "../../access/policy";
import { AccessError, isOfficer, requireAccess } from "../../access/policy";
import type { ResolvePrincipal } from "../../access/identity";
import type { AsyncAccessRepository } from "../../dossiers/persistent";
import type { DossierDetail, DossierRecord } from "../../dossiers/store";

const queueQuery = paginationQuerySchema.extend({
  view: z.enum(["recent", "pending", "assigned", "returned"]).default("recent"),
});
const assignmentBody = z.strictObject({ expectedVersion: z.number().int().positive() });
const decisionBody = z.strictObject({
  expectedVersion: z.number().int().positive(),
  idempotencyKey: z.string().min(1).max(200),
  correlationId: z.string().min(1).max(200).optional(),
  nodeId: z.string().min(1).max(200),
  action: z.enum(["accept", "refuse", "request_modification"]),
  reason: z.string().trim().min(1).max(2000),
  targetNodeIds: z.array(z.string().min(1).max(200)).max(100).default([]),
  evidenceIds: z.array(z.string().min(1).max(200)).max(100).default([]),
}).superRefine((decision, context) => {
  if (decision.action === "request_modification" && decision.targetNodeIds.length === 0) {
    context.addIssue({ code: "custom", path: ["targetNodeIds"], message: "At least one correction target is required" });
  }
});

type QueueView = z.infer<typeof queueQuery>["view"];

function agency(value: string): Agency {
  const parsed = z.enum(["dgi", "rne", "apii"]).safeParse(value.toLowerCase());
  if (!parsed.success) throw new AccessError(404, "not_found");
  return parsed.data.toUpperCase() as Agency;
}

function authorize(principal: Principal, selected: Agency): void {
  requireAccess(isOfficer(principal, selected));
}

function found<T>(value: T | undefined): T {
  if (!value) throw new AccessError(404, "not_found");
  return value;
}

function actionable(dossier: DossierRecord): boolean {
  return dossier.lifecycle !== "closed" && dossier.lifecycle !== "cancelled";
}

function inView(dossier: DossierRecord, view: QueueView, officerId: string): boolean {
  if (view === "pending") return actionable(dossier) && dossier.agencyAcceptance === "pending";
  if (view === "assigned") return actionable(dossier) && dossier.assignedOfficerId === officerId && dossier.agencyAcceptance === "pending";
  if (view === "returned") return actionable(dossier) && dossier.agencyAcceptance === "modification_requested";
  return true;
}

function counts(dossiers: readonly DossierRecord[], officerId: string) {
  return {
    recent: dossiers.length,
    pending: dossiers.filter((dossier) => actionable(dossier) && dossier.agencyAcceptance === "pending").length,
    assigned: dossiers.filter((dossier) => actionable(dossier) && dossier.assignedOfficerId === officerId && dossier.agencyAcceptance === "pending").length,
    returned: dossiers.filter((dossier) => actionable(dossier) && dossier.agencyAcceptance === "modification_requested").length,
    accepted: dossiers.filter((dossier) => dossier.agencyAcceptance === "accepted").length,
    refused: dossiers.filter((dossier) => dossier.agencyAcceptance === "refused").length,
  };
}

function queueItem(dossier: DossierRecord) {
  return {
    id: dossier.id,
    companyId: dossier.companyId,
    agency: dossier.agency,
    title: dossier.title,
    version: dossier.version,
    lifecycle: dossier.lifecycle,
    readiness: dossier.readiness,
    agencyAcceptance: dossier.agencyAcceptance,
    prerequisiteStatus: dossier.prerequisiteStatus,
    assignedOfficerId: dossier.assignedOfficerId ?? null,
    assignedAt: dossier.assignedAt ?? null,
    updatedAt: dossier.updatedAt,
    simulated: dossier.simulated,
  };
}

function reviewBundle(detail: DossierDetail, procedure: Awaited<ReturnType<AsyncAccessRepository["procedure"]>>) {
  return {
    dossier: detail.dossier,
    procedure,
    nodes: detail.nodes,
    documents: detail.evidence.map(({ originalText: _text, storageRef: _storage, ...metadata }) => metadata),
    findings: detail.findings,
    sources: detail.sources,
    prerequisites: Object.values(detail.dossier.lifecycleContext?.prerequisites ?? {}),
    decisions: [...detail.decisions].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
  };
}

export function createAdminRoutes(repository: AsyncAccessRepository, resolvePrincipal: ResolvePrincipal) {
  return new Elysia({ name: "agency-admin", prefix: "/admin" })
    .resolve(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
    .get("/:agency/queue", async ({ params, query, principal }) => {
      const selected = agency(params.agency);
      authorize(principal, selected);
      const parsed = queueQuery.safeParse(query);
      if (!parsed.success) throw new AccessError(422, "validation_error");
      const agencyDossiers = (await repository.dossiers())
        .filter((dossier) => dossier.agency === selected)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
      const filtered = agencyDossiers.filter((dossier) => inView(dossier, parsed.data.view, principal.id));
      const offset = (parsed.data.page - 1) * parsed.data.limit;
      return {
        agency: selected,
        view: parsed.data.view,
        statusCounts: counts(agencyDossiers, principal.id),
        ...buildPaginatedResponse({ data: filtered.slice(offset, offset + parsed.data.limit).map(queueItem),
          page: parsed.data.page, limit: parsed.data.limit, total: filtered.length }),
      };
    })
    .get("/:agency/dossiers/:dossierId", async ({ params, principal }) => {
      const selected = agency(params.agency);
      authorize(principal, selected);
      const detail = found(await repository.dossierDetail(params.dossierId));
      if (detail.dossier.agency !== selected) throw new AccessError(404, "not_found");
      return reviewBundle(detail, found(await repository.procedure(detail.dossier.procedureVersionId)));
    })
    .post("/:agency/dossiers/:dossierId/assignment", async ({ params, body, principal }) => {
      const selected = agency(params.agency);
      authorize(principal, selected);
      const parsed = assignmentBody.safeParse(body);
      if (!parsed.success) throw new AccessError(422, "validation_error");
      const dossier = found(await repository.dossier(params.dossierId));
      if (dossier.agency !== selected) throw new AccessError(404, "not_found");
      return { dossier: await repository.assignDossier({ dossierId: dossier.id,
        expectedVersion: parsed.data.expectedVersion, officerId: principal.id }) };
    })
    .post("/:agency/dossiers/:dossierId/decisions", async ({ params, body, principal, set }) => {
      const selected = agency(params.agency);
      authorize(principal, selected);
      const parsed = decisionBody.safeParse(body);
      if (!parsed.success) throw new AccessError(422, "validation_error");
      const detail = found(await repository.dossierDetail(params.dossierId));
      if (detail.dossier.agency !== selected) throw new AccessError(404, "not_found");
      if (detail.dossier.assignedOfficerId !== principal.id) throw new AccessError(409, "dossier_not_assigned");
      const node = detail.nodes.find((candidate) => candidate.id === parsed.data.nodeId);
      if (!node || (node.type !== "decision" && node.type !== "human_review")) throw new AccessError(422, "invalid_review_node");
      if (parsed.data.targetNodeIds.some((id) => !detail.nodes.some((candidate) => candidate.id === id)) ||
          parsed.data.evidenceIds.some((id) => !detail.evidence.some((document) => document.id === id))) {
        throw new AccessError(422, "invalid_evidence_scope");
      }
      const { expectedVersion, idempotencyKey, correlationId, nodeId, ...decision } = parsed.data;
      const acknowledgement = await repository.dispatchCommand({ dossierId: detail.dossier.id, type: "decision_recorded",
        expectedVersion, idempotencyKey, ...(correlationId ? { correlationId } : {}), nodeId, decision, actorId: principal.id });
      set.status = 202;
      return acknowledgement;
    });
}
