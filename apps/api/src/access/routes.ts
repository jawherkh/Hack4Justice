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
      return dossier;
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
      return node;
    })
    .get("/dossiers/:dossierId/events", ({ params, principal }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      const event = JSON.stringify({ type: "snapshot", dossierId: dossier.id, simulated: true });
      return new Response(`event: snapshot\ndata: ${event}\n\n`, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    })
    .post("/dossiers/:dossierId/documents", ({ params, principal, set }) => {
      const dossier = found(repository.dossier(params.dossierId));
      requireAccess(canEditEvidence(principal, dossier));
      set.status = 501;
      return { error: { code: "document_storage_not_configured" } };
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
