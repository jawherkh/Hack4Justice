import { z } from "zod";

export const fieldName = z.enum(["company_name", "tax_id", "registry_id", "address", "legal_form", "document_date", "headcount"]);
export type FieldName = z.infer<typeof fieldName>;
export type State = "extracted" | "missing" | "uncertain";
export interface DocumentRef {
  companyId: string; dossierId: string; documentId: string; documentVersion: number; sha256: string;
}
export const modelPage = z.object({
  text: z.string().max(100_000),
  language: z.enum(["ar", "fr", "en", "mixed", "unknown"]).catch("unknown"),
  documentType: z.enum(["tax_registration", "registry_extract", "invoice", "identity", "other", "unknown"]).catch("unknown"),
  confidence: z.number().min(0).max(1).nullable().catch(null),
  unreadable: z.array(z.string().max(500)).max(100).default([]),
  facts: z.array(z.object({ field: fieldName, rawValue: z.string().min(1).max(1000),
    quote: z.string().min(1).max(2000), confidence: z.number().min(0).max(1).nullable() })).max(100),
});
export type ModelPage = z.infer<typeof modelPage>;
export interface Page {
  number: number; method: "native" | "ocr"; text: string; state: State;
  language: ModelPage["language"]; confidence: number | null;
  confidenceSource: "model_self_reported" | "unavailable";
  documentType: ModelPage["documentType"]; warnings: string[];
}
export interface Fact {
  id: string; field: FieldName; value: string | number | null; rawValue: string;
  valueType: "string" | "date" | "integer"; page: number; quote: string;
  confidence: number | null; confidenceSource: "model_self_reported" | "unavailable"; state: State; source: DocumentRef;
}
export interface Extraction {
  source: DocumentRef; pipelineVersion: string; model: string;
  state: State; method: "native" | "ocr" | "mixed" | "not_processed";
  pages: Page[]; facts: Fact[]; missingFields: FieldName[]; warnings: string[];
}
export interface Correction {
  idempotencyKey: string; fingerprint: string; actorId: string; recordedAt: string;
  field: FieldName; page: number; quote: string; value: string | number | null; reason: string;
}
export interface Report {
  id: string; requestFingerprint: string; revision: number; createdAt: string; extraction: Extraction; corrections: Correction[];
}
export class ExtractionError extends Error {
  constructor(readonly status: number, readonly code: string) { super(code); }
}
export interface PageProvider {
  readonly model: string;
  analyze(input: { text?: string; image?: Uint8Array; mimeType?: string; page: number }, signal?: AbortSignal): Promise<ModelPage>;
}

export function typedValue(field: FieldName, raw: string): { value: string | number | null; valueType: Fact["valueType"] } {
  const value = raw.normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0)).trim();
  if (field === "headcount") return { value: /^\d{1,9}$/.test(value) ? Number(value) : null, valueType: "integer" };
  if (field === "document_date") {
    const dayFirst = /^(\d{2})[/.](\d{2})[/.](\d{4})$/.exec(value);
    const iso = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : dayFirst ? `${dayFirst[3]}-${dayFirst[2]}-${dayFirst[1]}` : "";
    const date = new Date(iso);
    return { value: iso && !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : null, valueType: "date" };
  }
  return { value: value || null, valueType: "string" };
}
