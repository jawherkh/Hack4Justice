import { describe, expect, test } from "vitest";

import { createDocumentTextExtractor, type PdfReader } from "./document";

function reader(texts: string[]): PdfReader {
  return {
    async open() {
      return {
        texts,
        async image(page: number) {
          return new Uint8Array([page]);
        },
        async close() {},
      };
    },
  };
}

describe("document text extraction", () => {
  test("extracts native HTML without invoking OCR", async () => {
    const ocrCalls: number[] = [];
    const extractor = createDocumentTextExtractor({
      pdf: reader([]),
      ocr: {
        async extractPage(input) {
          ocrCalls.push(input.page);
          return { text: "should not be used", confidence: 0.9 };
        },
      },
    });

    const result = await extractor.extract({
      bytes: new TextEncoder().encode(
        "<h1>Identifiant fiscal</h1><p>La demande se fait auprès de la DGI.</p>",
      ),
      filename: "tax.html",
      contentType: "text/html",
    });

    expect(result.method).toBe("native");
    expect(result.text).toContain("Identifiant fiscal");
    expect(result.text).toContain("La demande se fait auprès de la DGI.");
    expect(ocrCalls).toEqual([]);
  });

  test("keeps a text-based PDF on native extraction and does not call OCR", async () => {
    const ocrCalls: number[] = [];
    const extractor = createDocumentTextExtractor({
      pdf: reader(["Article 1. The company must file its declaration before the deadline."]),
      ocr: {
        async extractPage(input) {
          ocrCalls.push(input.page);
          return { text: "should not be used", confidence: 0.9 };
        },
      },
    });

    const result = await extractor.extract({
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      filename: "law.pdf",
      contentType: "application/pdf",
    });

    expect(result.method).toBe("native");
    expect(result.pageCount).toBe(1);
    expect(result.text).toContain("Article 1. The company must file");
    expect(ocrCalls).toEqual([]);
  });

  test("sends an image-only PDF page to OCR and returns the OCR text", async () => {
    const ocrCalls: { page: number; bytes: number[]; language?: string }[] = [];
    const extractor = createDocumentTextExtractor({
      pdf: reader([""]),
      ocr: {
        async extractPage(input) {
          ocrCalls.push({ page: input.page, bytes: [...input.image], language: input.language });
          return { text: "Extrait du registre national", confidence: 0.94 };
        },
      },
    });

    const result = await extractor.extract({
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      filename: "scan.pdf",
      contentType: "application/pdf",
      languages: "fra+ara",
    });

    expect(result.method).toBe("ocr");
    expect(result.text).toContain("Extrait du registre national");
    expect(ocrCalls).toEqual([{ page: 1, bytes: [1], language: "fra+ara" }]);
  });

  test("marks a PDF as mixed when only some pages need OCR", async () => {
    const extractor = createDocumentTextExtractor({
      pdf: reader(["Article 1. This native page contains enough text to be trusted by the extractor.", ""]),
      ocr: {
        async extractPage() {
          return { text: "Page scannée", confidence: 0.88 };
        },
      },
    });

    const result = await extractor.extract({
      bytes: new Uint8Array([37, 80, 68, 70, 45]),
      filename: "mixed.pdf",
      contentType: "application/pdf",
    });

    expect(result.method).toBe("mixed");
    expect(result.text).toContain("--- PAGE 1 ---");
    expect(result.text).toContain("--- PAGE 2 ---");
  });
});
