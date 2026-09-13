import { Elysia } from "elysia";
import { z } from "zod";

import type { AsyncAccessRepository } from "../dossiers/persistent";
import { MAX_UPLOAD_BYTES } from "../dossiers/files";
import { lifecycleCommandBody } from "../lifecycle/validation";
import { type ResolvePrincipal } from "./identity";
import {
  AccessError,
  canEditEvidence,
  canMaintainRules,
  canReadDependency,
  canReadDocument,
  canReadDossier,
  canReview,
  isMember,
  requireAccess,
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
  changes: z
    .record(z.string(), z.unknown())
    .refine((value) => Object.keys(value).length > 0, "changes cannot be empty"),
});

const multipartBody = z.object({
  nodeId: z.string().min(1),
  expectedVersion: z.coerce.number().int().positive(),
  requirementIds: z.union([z.string().min(1).max(5000), z.array(z.string())]).optional(),
  replacesDocumentId: z.string().min(1).optional(),
});

function found<T>(value: T | undefined): T {
  if (!value) throw new AccessError(404, "not_found");
  return value;
}

export function createAccessRoutes(repository: AsyncAccessRepository, resolvePrincipal: ResolvePrincipal) {
  return new Elysia({ name: "scoped-resources" })
    .resolve(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
    .get("/me", ({ principal }) => ({
      id: principal.id,
      roles: principal.roles,
      companyIds: principal.companyIds,
    }))
    .get("/procedures", async ({ principal }) => {
      requireAccess(principal.roles.length > 0);
      return repository.procedures();
    })
    .post("/companies/:companyId/dossiers", async ({ params, body, principal, set }) => {
      requireAccess(isMember(principal, params.companyId));
      const parsed = createDossierBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const existing = parsed.data.dossierId ? await repository.dossier(parsed.data.dossierId) : undefined;
      const detail = await repository.createDossier({ companyId: params.companyId, ...parsed.data });
      set.status = existing ? 200 : 201;
      return detail;
    })
    .get("/companies/:companyId/dossiers", async ({ params, principal }) => {
      requireAccess(isMember(principal, params.companyId));
      return (await repository.dossiers()).filter((d) => d.companyId === params.companyId);
    })
    .get("/officer/queue", async ({ principal }) => {
      requireAccess(principal.roles.some((role) => role.endsWith("_officer")));
      return (await repository.dossiers()).filter((d) => canReview(principal, d));
    })
    .get("/dossiers/:dossierId", async ({ params, principal }) => {
      const detail = found(await repository.dossierDetail(params.dossierId));
      requireAccess(canReadDossier(principal, detail.dossier));
      return detail;
    })
    .get("/documents/:documentId", async ({ params, principal }) => {
      const document = found(await repository.document(params.documentId));
      requireAccess(canReadDocument(principal, document, document.id, await repository.grants(), Date.now()));
      return document;
    })
    .get("/documents/:documentId/content", async ({ params, principal }) => {
      const document = found(await repository.document(params.documentId));
      requireAccess(canReadDocument(principal, document, document.id, await repository.grants(), Date.now()));
      const bytes = repository.readContent
        ? await repository.readContent(document.id)
        : new TextEncoder().encode(document.originalText);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": document.mimeType,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.filename)}`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        },
      });
    })
    .get("/dossiers/:dossierId/documents/:documentId", async ({ params, principal }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      const document = found(await repository.document(params.documentId));
      if (
        document.dossierId !== dossier.id ||
        document.companyId !== dossier.companyId ||
        document.agency !== dossier.agency
      ) {
        throw new AccessError(404, "not_found");
      }
      requireAccess(canReadDocument(principal, document, document.id, await repository.grants(), Date.now()));
      return document;
    })
    .get("/dossiers/:dossierId/nodes/:nodeId", async ({ params, principal }) => {
      const detail = found(await repository.dossierDetail(params.dossierId));
      const dossier = detail.dossier;
      requireAccess(canReadDossier(principal, dossier));
      const node = found(detail.nodes.find((node) => node.id === params.nodeId));
      if (
        node.dossierId !== dossier.id ||
        node.companyId !== dossier.companyId ||
        node.agency !== dossier.agency
      ) {
        throw new AccessError(404, "not_found");
      }
      return {
        ...node,
        sources: detail.sources.filter((source) => node.sourceIds.includes(source.id)),
        requirements: detail.requirements.filter((requirement) =>
          node.requirementIds.includes(requirement.id),
        ),
        findings: detail.findings.filter((finding) => node.findingIds.includes(finding.id)),
      };
    })
    .get("/dossiers/:dossierId/events", async ({ params, principal }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      const event = JSON.stringify({ type: "snapshot", dossierId: dossier.id, simulated: true });
      return new Response(`event: snapshot\ndata: ${event}\n\n`, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    })
    .post("/dossiers/:dossierId/documents", async ({ params, body, principal, set, request }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      requireAccess(canEditEvidence(principal, dossier));
      const key = request.headers.get("idempotency-key") ?? undefined;
      if (key !== undefined && (!key || key.length > 200))
        throw new AccessError(422, "invalid_idempotency_key");
      if (request.headers.get("content-type")?.startsWith("multipart/form-data")) {
        if (!repository.uploadFile) throw new AccessError(503, "document_storage_not_configured");
        const form = (body ?? {}) as Record<string, unknown>;
        const file = form.file;
        if (!(file instanceof File)) throw new AccessError(422, "invalid_file");
        if (file.size > MAX_UPLOAD_BYTES) throw new AccessError(413, "file_too_large");
        const fields = multipartBody.safeParse(form);
        if (!fields.success) throw new AccessError(422, "validation_error");
        let requirementIds: unknown = fields.data.requirementIds;
        if (typeof requirementIds === "string") {
          try {
            requirementIds = JSON.parse(requirementIds);
          } catch {
            throw new AccessError(422, "invalid_requirement_ids");
          }
        }
        const requirements = z.array(z.string().min(1)).min(1).max(50).optional().safeParse(requirementIds);
        if (!requirements.success) throw new AccessError(422, "invalid_requirement_ids");
        const result = await repository.uploadFile({
          ...fields.data,
          requirementIds: requirements.data,
          dossierId: dossier.id,
          uploadedBy: principal.id,
          idempotencyKey: key,
          filename: file.name.replace(/[\\/\r\n]/g, "_").slice(0, 255),
          mimeType: file.type,
          bytes: new Uint8Array(await file.arrayBuffer()),
        });
        set.status = 201;
        return {
          document: result.document,
          dossier: result.detail.dossier,
          invalidatedFindingIds: result.invalidatedFindingIds,
        };
      }
      const parsed = uploadDocumentBody.safeParse(body);
      if (!parsed.success) {
        set.status = body === undefined ? 501 : 422;
        return {
          error: { code: body === undefined ? "document_storage_not_configured" : "validation_error" },
        };
      }
      const result = await repository.uploadDocument({
        ...parsed.data,
        dossierId: dossier.id,
        uploadedBy: principal.id,
        idempotencyKey: key,
      });
      set.status = 201;
      return {
        document: result.document,
        dossier: result.detail.dossier,
        invalidatedFindingIds: result.invalidatedFindingIds,
      };
    })
    .patch("/dossiers/:dossierId/facts", async ({ params, body, principal, set }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      requireAccess(canEditEvidence(principal, dossier));
      const parsed = factsBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const result = await repository.updateConfirmedFacts({
        ...parsed.data,
        dossierId: dossier.id,
        actorId: principal.id,
      });
      return { dossier: result.detail.dossier, invalidatedFindingIds: result.invalidatedFindingIds };
    })
    .post("/dossiers/:dossierId/commands", async ({ params, body, principal, set }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      const parsed = lifecycleCommandBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const authorized =
        parsed.data.type === "decision_recorded"
          ? canReview(principal, dossier)
          : canEditEvidence(principal, dossier);
      requireAccess(authorized);
      const acknowledgement = await repository.dispatchCommand({
        ...parsed.data,
        dossierId: dossier.id,
        actorId: principal.id,
      });
      set.status = 202;
      return acknowledgement;
    })
    .get("/dossiers/:dossierId/commands/:commandId", async ({ params, principal }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      if (!repository.commandResult) throw new AccessError(503, "workflow_not_configured");
      return found(await repository.commandResult({ dossierId: dossier.id, commandId: params.commandId }));
    })
    .get("/dossiers/:dossierId/lifecycle-events", async ({ params, query, principal }) => {
      const dossier = found(await repository.dossier(params.dossierId));
      requireAccess(canReadDossier(principal, dossier));
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .safeParse(query.after ?? 0);
      if (!after.success) throw new AccessError(422, "invalid_event_cursor");
      if (!repository.lifecycleEvents) throw new AccessError(503, "workflow_not_configured");
      return repository.lifecycleEvents(dossier.id, after.data);
    })
    .post(
      "/dossiers/:dossierId/decisions",
      async ({ params, principal }) => {
        const dossier = found(await repository.dossier(params.dossierId));
        requireAccess(canReview(principal, dossier));
        throw new AccessError(501, "workflow_not_configured");
      },
      { body: decisionBody },
    )
    .get("/dependencies/:dependencyId", async ({ params, principal }) => {
      const dependency = found(await repository.dependency(params.dependencyId));
      requireAccess(canReadDependency(principal, dependency));
      // Explicit projection: grants do not expose raw records or document references.
      return {
        id: dependency.id,
        companyId: dependency.companyId,
        agency: dependency.agency,
        status: dependency.status,
        observedAt: dependency.observedAt,
        simulated: dependency.simulated,
      };
    })
    .get("/rules/access", async ({ principal }) => {
      requireAccess(canMaintainRules(principal));
      return { canMaintainRules: true };
    });
}
