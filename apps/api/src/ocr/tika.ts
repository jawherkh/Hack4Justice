/**
 * Text extraction via Apache Tika server (with Tesseract for OCR).
 * PDFs with a text layer are read directly; scanned pages are OCR'd.
 */
export interface ExtractOptions {
  contentType: string;
  /** Tesseract language codes joined with "+", e.g. "fra+eng". */
  ocrLanguages?: string;
  signal?: AbortSignal;
}

export interface ExtractResult {
  text: string;
  pageCount: number | null;
}

export class TikaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "TikaError";
  }
}

export function createTikaClient(baseUrl: string) {
  const url = baseUrl.replace(/\/$/, "");

  return {
    async health(): Promise<boolean> {
      const res = await fetch(`${url}/tika`).catch(() => null);
      return res?.ok ?? false;
    },

    async extract(bytes: Uint8Array, options: ExtractOptions): Promise<ExtractResult> {
      const headers: Record<string, string> = {
        "Content-Type": options.contentType,
        Accept: "text/plain",
        // Text layer first; OCR only pages that have none.
        "X-Tika-PDFOcrStrategy": "auto",
        "X-Tika-PDFExtractInlineImages": "true",
        "X-Tika-OCRLanguage": options.ocrLanguages ?? "fra+eng",
      };

      // Copy into a plain ArrayBuffer-backed body: satisfies both Bun's and the DOM's BodyInit typings.
      const body = new Blob([new Uint8Array(bytes)]);
      const [textRes, metaRes] = await Promise.all([
        fetch(`${url}/tika`, { method: "PUT", headers, body, signal: options.signal }),
        fetch(`${url}/meta`, {
          method: "PUT",
          headers: { "Content-Type": options.contentType, Accept: "application/json" },
          body,
          signal: options.signal,
        }),
      ]);

      if (!textRes.ok) {
        throw new TikaError(
          `Tika extraction failed: ${textRes.status} ${await textRes.text()}`,
          textRes.status,
        );
      }

      const text = normalize(await textRes.text());
      let pageCount: number | null = null;
      if (metaRes.ok) {
        const meta = (await metaRes.json()) as Record<string, unknown>;
        const pages = Number(meta["xmpTPg:NPages"] ?? meta["meta:page-count"]);
        pageCount = Number.isFinite(pages) && pages > 0 ? pages : null;
      }

      return { text, pageCount };
    },
  };
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type TikaClient = ReturnType<typeof createTikaClient>;
