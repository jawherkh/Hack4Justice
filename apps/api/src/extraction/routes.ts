import { Elysia } from "elysia";
import { z } from "zod";
import { AccessError, canEditEvidence, canReadDocument, canReadDossier, requireAccess } from "../access/policy";
import type { ResolvePrincipal } from "../access/identity";
import { compareReports, effectiveFacts } from "./reports";
import { fieldName, ExtractionError } from "./types";
import type { ExtractionService } from "./service";

const documentParams = z.object({ documentId: z.string().min(1).max(300) });
const reportParams = documentParams.extend({ extractionId: z.string().regex(/^[a-f0-9]{64}$/) });
const key = z.string().min(1).max(200);

export function createExtractionRoutes(service: ExtractionService, identity: ResolvePrincipal) {
  return new Elysia({ name: "document-extraction" })
    .onError(({ error, set, code }) => {
      if (error instanceof ExtractionError || error instanceof AccessError) { set.status = error.status; return { error: { code: error.code } }; }
      set.status = code === "VALIDATION" || code === "PARSE" ? 422 : code === "NOT_FOUND" ? 404 : 500;
      return { error: { code: set.status === 422 ? "validation_error" : set.status === 404 ? "not_found" : "extraction_failed" } };
    })
    .resolve(async ({ request }) => ({ principal: await identity(request) }))
    .post("/documents/:documentId/extractions", async ({ params, principal, body, set }) => {
      const document = await service.document(params.documentId);
      requireAccess(canEditEvidence(principal, document));
      const report = await service.extract(document, body, principal.id);
      set.status = 200;
      return { ...report, effectiveFacts: effectiveFacts(report), stale: !await service.current(document) };
    }, { params: documentParams, body: z.strictObject({ expectedDocumentVersion: z.number().int().positive(),
      idempotencyKey: key, expectedFields: z.array(fieldName).max(7).default([]) }) })
    .get("/documents/:documentId/extractions/:extractionId", async ({ params, principal }) => {
      const document = await service.document(params.documentId);
      requireAccess(canReadDocument(principal, document, document.id, await service.repository.grants(), Date.now()));
      const report = await service.report(document, params.extractionId);
      return { ...report, effectiveFacts: effectiveFacts(report), stale: !await service.current(document) };
    }, { params: reportParams })
    .post("/documents/:documentId/extractions/:extractionId/corrections", async ({ params, principal, body }) => {
      const document = await service.document(params.documentId);
      requireAccess(canEditEvidence(principal, document));
      await service.report(document, params.extractionId);
      if (!await service.current(document)) throw new ExtractionError(409, "document_version_conflict");
      const report = await service.reports.correct(params.extractionId, body, principal.id);
      return { ...report, effectiveFacts: effectiveFacts(report), stale: !await service.current(document) };
    }, { params: reportParams, body: z.strictObject({ expectedRevision: z.number().int().positive(), idempotencyKey: key,
      field: fieldName, page: z.number().int().positive(), quote: z.string().min(1).max(2000),
      value: z.string().min(1).max(1000).nullable(), reason: z.string().trim().min(1).max(1000) }) })
    .post("/dossiers/:dossierId/extraction-comparisons", async ({ params, principal, body }) => {
      const detail = await service.repository.dossierDetail(params.dossierId);
      if (!detail) throw new ExtractionError(404, "not_found");
      requireAccess(canReadDossier(principal, detail.dossier));
      const reports = [];
      for (const id of new Set(body.extractionIds)) {
        const report = await service.reports.get(id);
        if (!report || report.extraction.source.dossierId !== detail.dossier.id || report.extraction.source.companyId !== detail.dossier.companyId) throw new ExtractionError(404, "not_found");
        const document = await service.document(report.extraction.source.documentId);
        await service.report(document, id);
        if (!await service.current(document)) throw new ExtractionError(409, "document_version_conflict");
        reports.push(report);
      }
      if (reports.length < 2 || new Set(reports.map((r) => r.extraction.source.documentId)).size !== reports.length) throw new ExtractionError(422, "duplicate_document_comparison");
      const latest = await service.repository.dossierDetail(params.dossierId);
      if (!latest || latest.dossier.version !== detail.dossier.version) throw new ExtractionError(409, "document_version_conflict");
      return { comparisons: compareReports(reports), requiresReview: true };
    }, { params: z.object({ dossierId: z.string().min(1).max(300) }),
      body: z.strictObject({ extractionIds: z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(2).max(10) }) });
}
