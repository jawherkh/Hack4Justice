import { ExtractionEngine, PIPELINE_VERSION, sha256 } from "./engine";
import { ReportStore } from "./reports";
import { ExtractionError, type DocumentRef, type FieldName, type Report } from "./types";
import type { AccessRepository, DocumentRecord } from "../dossiers/store";

export type ExtractionRepository = {
  [K in "document" | "dossierDetail" | "grants"]: (...args: Parameters<AccessRepository[K]>) => ReturnType<AccessRepository[K]> | Promise<ReturnType<AccessRepository[K]>>;
} & { readContent?(id: string): Promise<Uint8Array> };
export type OriginalReader = (document: DocumentRecord) => Promise<Uint8Array | undefined>;

export function originalReader(repository: ExtractionRepository): OriginalReader {
  return async (document) => {
    if (repository.readContent) return repository.readContent(document.id);
    if (document.mimeType === "text/plain" && document.storageRef.startsWith("memory://")) return new TextEncoder().encode(document.originalText);
    return undefined;
  };
}
export const reference = (d: DocumentRecord): DocumentRef => ({ companyId: d.companyId, dossierId: d.dossierId,
  documentId: d.id, documentVersion: d.version, sha256: d.sha256 });

export class ExtractionService {
  private readonly pending = new Map<string, Promise<Report>>();
  constructor(readonly repository: ExtractionRepository, readonly engine: ExtractionEngine, readonly reports: ReportStore,
    private readonly readOriginal: OriginalReader = originalReader(repository)) {}
  async document(id: string) {
    const document = await this.repository.document(id);
    if (!document) throw new ExtractionError(404, "not_found");
    return document;
  }
  async current(document: DocumentRecord) {
    const detail = await this.repository.dossierDetail(document.dossierId);
    return !!detail && !detail.evidence.some((d) => d.replacesId === document.id) &&
      detail.evidence.some((d) => d.id === document.id && d.version === document.version && d.sha256 === document.sha256);
  }
  async report(document: DocumentRecord, id: string) {
    const report = await this.reports.get(id);
    if (!report || JSON.stringify(report.extraction.source) !== JSON.stringify(reference(document))) throw new ExtractionError(404, "not_found");
    return report;
  }
  async extract(document: DocumentRecord, input: { expectedDocumentVersion: number; idempotencyKey: string; expectedFields: FieldName[] }, actorId: string) {
    if (input.expectedDocumentVersion !== document.version || !await this.current(document)) throw new ExtractionError(409, "document_version_conflict");
    const fields = [...new Set(input.expectedFields)].sort();
    const id = sha256(JSON.stringify([reference(document), PIPELINE_VERSION, this.engine.provider.model, actorId, input.idempotencyKey]));
    const prior = await this.reports.get(id);
    const fingerprint = sha256(JSON.stringify(fields));
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) throw new ExtractionError(409, "idempotency_conflict");
      return prior;
    }
    const active = this.pending.get(id);
    if (active) {
      const result = await active;
      if (result.requestFingerprint !== fingerprint) throw new ExtractionError(409, "idempotency_conflict");
      return result;
    }
    if (this.pending.size >= 2) throw new ExtractionError(503, "extraction_busy");
    const work = (async () => {
      const bytes = await this.readOriginal(document);
      const extraction = bytes ? await this.engine.extract(reference(document), bytes, document.mimeType, fields, AbortSignal.timeout(180_000)) : {
        source: reference(document), pipelineVersion: PIPELINE_VERSION, model: this.engine.provider.model,
        state: "missing" as const, method: "not_processed" as const, pages: [], facts: [], missingFields: fields, warnings: ["original_unavailable"],
      };
      if (!await this.current(document)) throw new ExtractionError(409, "document_version_conflict");
      const report: Report = { id, requestFingerprint: fingerprint, revision: 1, createdAt: new Date().toISOString(), extraction, corrections: [] };
      try { await this.reports.append(report); }
      catch (error) {
        if (!(error instanceof ExtractionError) || error.status !== 409) throw error;
        const winner = await this.reports.get(id);
        if (!winner || winner.requestFingerprint !== fingerprint) throw new ExtractionError(409, "idempotency_conflict");
        return winner;
      }
      return report;
    })();
    this.pending.set(id, work);
    try { return await work; } finally { this.pending.delete(id); }
  }
}
