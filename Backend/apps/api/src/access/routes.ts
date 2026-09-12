import { Elysia } from "elysia";
import { z } from "zod";

import { type AccessRepository } from "./fixtures";
import { type ResolvePrincipal } from "./identity";
import {
  AccessError, canEditEvidence, canMaintainRules, canReadDependency, canReadDocument,
  canReadDossier, canReview, isMember, requireAccess,
} from "./policy";

const decisionBody = z.strictObject({
  action: z.enum(["accept", "refuse", "request_modification"]),
  reason: z.string().min(1),
});

const createDossierBody = z.object({
  procedureVersionId: z.string().min(1),
  dossierId: z.string().min(1).optional(),
});

const uploadDocumentBody = z.object({
  nodeId: z.string().min(1),
  filename: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  content: z.string().min(1),
  requirementIds: z.array(z.string().min(1)).min(1).optional(),
  replacesDocumentId: z.string().min(1).optional(),
  expectedVersion: z.number().int().min(1),
});

const factsBody = z.object({
  expectedVersion: z.number().int().min(1),
  changes: z.record(z.string(), z.unknown()).refine((value) => Object.keys(value).length > 0, "changes cannot be empty"),
});

const lifecycleCommandBody = z.object({
  type: z.enum([
    "evidence_changed",
    "review_requested",
    "submission_requested",
    "resubmission_requested",
    "cancellation_requested",
    "decision_recorded",
  ]),
  expectedVersion: z.number().int().min(1),
  idempotencyKey: z.string().min(1).max(200),
  nodeId: z.string().min(1).optional(),
});

function found<T>(value: T | undefined): T {
  if (!value) throw new AccessError(404, "not_found");
  return value;
}

export function createAccessRoutes(repository: AccessRepository, resolvePrincipal: ResolvePrincipal) {
  return new Elysia({ name: "scoped-resources" })
    .onError(({ error, set }) => {
      if (error instanceof AccessError) {
        set.status = error.status;
        return { error: { code: error.code } };
      }
    })
    .resolve(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
    .get("/me", ({ principal }) => ({ id: principal.id, roles: principal.roles, companyIds: principal.companyIds }))
    .get("/procedures", ({ principal }) => {
      requireAccess(principal.roles.length > 0);
      return repository.procedures();
    })
    .post("/companies/:companyId/dossiers", ({ params, body, principal, set }) => {
      requireAccess(isMember(principal, params.companyId));
      const parsed = createDossierBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const existing = parsed.data.dossierId ? repository.dossier(parsed.data.dossierId) : undefined;
      const detail = repository.createDossier({ companyId: params.companyId, ...parsed.data });
      set.status = existing ? 200 : 201;
      return detail;
    })
    .get("/companies/:companyId/dossiers", ({ params, principal }) => {
      requireAccess(isMember(principal, params.companyId));
      return repository.dossiers().filter((d) => d.companyId === params.companyId);
    })
    .get("/officer/queue", ({ principal }) => {
      requireAccess(principal.roles.some((role) => role.endsWith("_officer")));
      return repository.dossiers().filter((d) => canReview(principal, d));
    })
    .get("/dossiers/:dossierId", ({ params, principal }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      return found(repository.dossierDetail(dossier.id));
    })
    .get("/documents/:documentId", ({ params, principal }) => {
      const document = found(repository.document(params.documentId));
      requireAccess(canReadDocument(principal, document, document.id, repository.grants(), Date.now()));
      return document;
    })
    .get("/dossiers/:dossierId/documents/:documentId", ({ params, principal }) => {
      const dossier = found(repository.dossier(params.dossierId));
      const document = found(repository.document(params.documentId));
      if (document.dossierId !== dossier.id || document.companyId !== dossier.companyId || document.agency !== dossier.agency) {
        throw new AccessError(404, "not_found");
      }
      requireAccess(canReadDocument(principal, document, document.id, repository.grants(), Date.now()));
      return document;
    })
    .get("/dossiers/:dossierId/nodes/:nodeId", ({ params, principal }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      const node = found(repository.node(params.nodeId));
      if (node.dossierId !== dossier.id || node.companyId !== dossier.companyId || node.agency !== dossier.agency) {
        throw new AccessError(404, "not_found");
      }
      const detail = found(repository.dossierDetail(dossier.id));
      return {
        ...node,
        sources: detail.sources.filter((source) => node.sourceIds.includes(source.id)),
        requirements: detail.requirements.filter((requirement) => node.requirementIds.includes(requirement.id)),
        findings: detail.findings.filter((finding) => node.findingIds.includes(finding.id)),
      };
    })
    .get("/dossiers/:dossierId/events", ({ params, principal }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      const event = JSON.stringify({ type: "snapshot", dossierId: dossier.id, simulated: true });
      return new Response(`event: snapshot\ndata: ${event}\n\n`, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    })
    .post("/dossiers/:dossierId/documents", ({ params, body, principal, set }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canEditEvidence(principal, dossier));
      const parsed = uploadDocumentBody.safeParse(body);
      if (!parsed.success) {
        // Keep the A02 authorization-only probe honest while allowing A03 clients
        // to use the same endpoint once they provide an upload payload.
        set.status = body === undefined ? 501 : 422;
        return { error: { code: body === undefined ? "document_storage_not_configured" : "validation_error" } };
      }
      const result = repository.uploadDocument({ ...parsed.data, dossierId: dossier.id, uploadedBy: principal.id });
      set.status = 201;
      return {
        document: result.document,
        dossier: result.detail.dossier,
        invalidatedFindingIds: result.invalidatedFindingIds,
      };
    })
    .patch("/dossiers/:dossierId/facts", ({ params, body, principal, set }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canEditEvidence(principal, dossier));
      const parsed = factsBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const result = repository.updateConfirmedFacts({ ...parsed.data, dossierId: dossier.id });
      return { dossier: result.detail.dossier, invalidatedFindingIds: result.invalidatedFindingIds };
    })
    .post("/dossiers/:dossierId/commands", ({ params, body, principal, set }) => {
      const dossier = found(repository.dossier(params.dossierId));
      const parsed = lifecycleCommandBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const authorized = parsed.data.type === "decision_recorded"
        ? canReview(principal, dossier)
        : canEditEvidence(principal, dossier);
      requireAccess(authorized);
      const acknowledgement = repository.dispatchCommand({ ...parsed.data, dossierId: dossier.id, actorId: principal.id });
      set.status = 202;
      return acknowledgement;
    })
    .post("/dossiers/:dossierId/decisions", ({ params, principal, set }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canReview(principal, dossier));
      set.status = 501;
      return { error: { code: "workflow_not_configured" } };
    }, { body: decisionBody })
    .get("/dependencies/:dependencyId", ({ params, principal }) => {
      const dependency = found(repository.dependency(params.dependencyId));
      requireAccess(canReadDependency(principal, dependency));
      // Explicit projection: grants do not expose raw records or document references.
      return {
        id: dependency.id, companyId: dependency.companyId, agency: dependency.agency,
        status: dependency.status, observedAt: dependency.observedAt, simulated: dependency.simulated,
      };
    })
    .get("/rules/access", ({ principal }) => {
      requireAccess(canMaintainRules(principal));
      return { canMaintainRules: true };
    });
}
