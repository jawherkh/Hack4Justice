import { createHash } from "node:crypto";
import { ExtractionError, typedValue, type DocumentRef, type Extraction, type Fact, type FieldName, type Page, type PageProvider } from "./types";
import type { PdfReader, PreparedDocument } from "./pdf";

export const sha256 = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
export const PIPELINE_VERSION = "1";
export function usableNative(text: string) {
  const visible = text.replace(/\s/g, "");
  return visible.length >= 50 && (visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0) / visible.length > 0.6 && !text.includes("\ufffd");
}
export class ExtractionEngine {
  constructor(readonly provider: PageProvider, private readonly pdf: PdfReader) {}
  async extract(source: DocumentRef, bytes: Uint8Array, mimeType: string, expectedFields: FieldName[] = [], signal?: AbortSignal): Promise<Extraction> {
    if (!bytes.length || bytes.length > 20 * 1024 * 1024) throw new ExtractionError(413, "document_size_limit");
    if (sha256(bytes) !== source.sha256) throw new ExtractionError(409, "original_checksum_mismatch");
    const b = Buffer.from(bytes);
    const valid = mimeType === "text/plain" || mimeType === "application/pdf" && b.subarray(0, 5).toString() === "%PDF-" ||
      mimeType === "image/png" && b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) ||
      mimeType === "image/jpeg" && b[0] === 255 && b[1] === 216 && b[2] === 255;
    if (!valid) throw new ExtractionError(415, "unsupported_document_format");
    const result: Extraction = { source, pipelineVersion: PIPELINE_VERSION, model: this.provider.model,
      state: "missing", method: "not_processed", pages: [], facts: [], missingFields: [...new Set(expectedFields)], warnings: [] };
    let document: PreparedDocument | undefined;
    try {
      if (mimeType === "application/pdf") document = await this.pdf.open(bytes);
      const texts = document?.texts ?? [mimeType === "text/plain" ? new TextDecoder("utf-8", { fatal: true }).decode(bytes) : ""];
      for (const [index, native] of texts.entries()) {
        signal?.throwIfAborted();
        if (native.length > 100_000) throw new ExtractionError(413, "page_text_limit");
        const useNative = mimeType === "text/plain" || usableNative(native);
        const page: Page = { number: index + 1, method: useNative ? "native" : "ocr", text: useNative ? native : "",
          state: "missing", confidence: null, confidenceSource: "unavailable", language: "unknown", documentType: "unknown", warnings: [] };
        try {
          const image = useNative ? undefined : document ? await document.image(index + 1) : bytes;
          const input = { page: index + 1, text: useNative ? native : undefined,
            image, mimeType: document ? "image/png" : mimeType };
          const proposal = await this.provider.analyze(input, signal).catch((error: unknown) => {
            if (error instanceof ExtractionError && error.status === 502 && !signal?.aborted) return this.provider.analyze(input, signal);
            throw error;
          });
          page.text = useNative ? native : proposal.text;
          page.language = proposal.language;
          page.documentType = proposal.documentType;
          page.confidence = useNative ? null : proposal.confidence;
          page.confidenceSource = page.confidence === null ? "unavailable" : "model_self_reported";
          if (proposal.unreadable.length || page.text.includes("[illegible]")) page.warnings.push("unreadable_regions");
          for (const candidate of proposal.facts) {
            if (!page.text.includes(candidate.quote) || !candidate.quote.includes(candidate.rawValue)) {
              page.warnings.push("unsupported_fact_discarded"); continue;
            }
            const value = typedValue(candidate.field, candidate.rawValue);
            const fact: Fact = { ...value, id: sha256(JSON.stringify([source, index + 1, candidate.field, candidate.quote, candidate.rawValue])),
              field: candidate.field, rawValue: candidate.rawValue, quote: candidate.quote, page: index + 1,
              confidence: candidate.confidence, confidenceSource: candidate.confidence === null ? "unavailable" : "model_self_reported",
              source, state: value.value !== null && candidate.confidence !== null && candidate.confidence >= 0.8 &&
                (useNative || page.confidence !== null && page.confidence >= 0.8) && !page.warnings.includes("unreadable_regions") ? "extracted" : "uncertain" };
            if (!result.facts.some((f) => f.id === fact.id)) result.facts.push(fact);
          }
        } catch (error) {
          if (signal?.aborted) throw error;
          if (!useNative && native.trim()) { page.text = native; page.method = "native"; }
          page.warnings.push(error instanceof ExtractionError ? error.code : "page_extraction_failed");
        }
        page.warnings = [...new Set(page.warnings)];
        page.state = !page.text.trim() ? "missing" : page.warnings.length || !useNative && (page.confidence === null || page.confidence < 0.8) ? "uncertain" : "extracted";
        result.pages.push(page);
      }
    } catch (error) {
      if (signal?.aborted || error instanceof ExtractionError && [413, 415].includes(error.status)) throw error;
      result.warnings.push(error instanceof ExtractionError ? error.code : "document_extraction_failed");
    } finally { await document?.close(); }
    const methods = new Set(result.pages.map((p) => p.method));
    result.method = methods.size > 1 ? "mixed" : result.pages[0]?.method ?? "not_processed";
    result.missingFields = result.missingFields.filter((field) => !result.facts.some((fact) => fact.field === field && fact.value !== null));
    result.state = !result.pages.some((p) => p.text.trim()) ? "missing" : result.warnings.length || result.missingFields.length ||
      result.pages.some((p) => p.state !== "extracted") || result.facts.some((f) => f.state !== "extracted") ? "uncertain" : "extracted";
    return result;
  }
}
