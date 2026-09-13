import type { DeepSeekOcrClient, OcrPageInput } from "./deepseek";
import { PdfError, type PdfReader } from "./pdf";

export type { PdfReader } from "./pdf";

const PDF_CONTENT_TYPE = "application/pdf";
const TEXT_CONTENT_TYPE = "text/plain";
const HTML_CONTENT_TYPE = "text/html";
const MIN_NATIVE_VISIBLE_CHARACTERS = 50;

export interface DocumentTextInput {
  bytes: Uint8Array;
  filename: string;
  languages?: string;
  contentType?: string;
}

export interface DocumentTextResult {
  text: string;
  pageCount: number | null;
  method: "native" | "ocr" | "mixed";
}

export interface DocumentTextExtractor {
  extract(input: DocumentTextInput, signal?: AbortSignal): Promise<DocumentTextResult>;
}

export function usableNative(text: string): boolean {
  const visible = text.replace(/\s/g, "");
  const lettersAndNumbers = visible.match(/[\p{L}\p{N}]/gu)?.length ?? 0;
  return (
    visible.length >= MIN_NATIVE_VISIBLE_CHARACTERS &&
    lettersAndNumbers / visible.length > 0.6 &&
    !text.includes("\ufffd")
  );
}

function normalize(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function pageText(page: number, text: string): string {
  return `--- PAGE ${page} ---\n${normalize(text)}`;
}

function htmlToText(html: string): string {
  return normalize(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, "\n")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16))),
  );
}

export function createDocumentTextExtractor(dependencies: {
  pdf: PdfReader;
  ocr: Pick<DeepSeekOcrClient, "extractPage">;
}): DocumentTextExtractor {
  return {
    async extract(input, signal) {
      const contentType = (input.contentType ?? PDF_CONTENT_TYPE).split(";", 1)[0]!.toLowerCase();
      if (contentType === TEXT_CONTENT_TYPE || contentType === HTML_CONTENT_TYPE) {
        const text = normalize(new TextDecoder("utf-8", { fatal: true }).decode(input.bytes));
        const nativeText = contentType === HTML_CONTENT_TYPE ? htmlToText(text) : text;
        if (!nativeText) throw new Error("no_text_extracted");
        return { text: nativeText, pageCount: 1, method: "native" };
      }

      if (contentType !== PDF_CONTENT_TYPE && !contentType.startsWith("image/")) {
        throw new Error(`unsupported_document_format: ${contentType}`);
      }

      if (contentType.startsWith("image/")) {
        const result = await dependencies.ocr.extractPage(
          {
            image: input.bytes,
            mimeType: contentType,
            page: 1,
            language: input.languages,
          },
          signal,
        );
        if (!result.text) throw new Error("no_text_extracted");
        return { text: result.text, pageCount: 1, method: "ocr" };
      }

      const document = await dependencies.pdf.open(input.bytes);
      try {
        const pages: string[] = [];
        const methods = new Set<"native" | "ocr">();
        const pageCount = document.pageCount ?? document.texts.length;
        for (let index = 0; index < pageCount; index += 1) {
          signal?.throwIfAborted();
          const page = index + 1;
          const native = normalize(document.texts[index] ?? "");
          if (usableNative(native)) {
            methods.add("native");
            pages.push(pageText(page, native));
            continue;
          }

          const image: OcrPageInput = {
            image: await document.image(page),
            mimeType: "image/png",
            page,
            language: input.languages,
          };
          const ocr = await dependencies.ocr.extractPage(image, signal);
          if (!ocr.text.trim()) throw new Error(`no_text_extracted_on_page_${page}`);
          methods.add("ocr");
          pages.push(pageText(page, ocr.text));
        }

        const text = pages.join("\n\n").trim();
        if (!text) throw new Error("no_text_extracted");
        return {
          text,
          pageCount,
          method: methods.size > 1 ? "mixed" : (methods.values().next().value ?? "ocr"),
        };
      } catch (error) {
        if (error instanceof PdfError) throw error;
        throw error;
      } finally {
        await document.close();
      }
    },
  };
}
