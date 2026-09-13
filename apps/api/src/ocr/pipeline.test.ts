import PDFDocument from "pdfkit";
import { describe, expect, test } from "vitest";

import { createDocumentTextExtractor } from "./document";
import { PopplerReader } from "./pdf";

function pdf(draw: (document: PDFKit.PDFDocument) => void): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({ autoFirstPage: false, compress: false });
    const chunks: Buffer[] = [];
    document.on("data", (chunk: Buffer) => chunks.push(chunk));
    document.on("error", reject);
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    draw(document);
    document.end();
  });
}

describe("PDF extraction pipeline", () => {
  test("reads a two-page text PDF without sending either page to OCR", async () => {
    const bytes = await pdf((document) => {
      document
        .addPage()
        .text(
          "Article 1. A registered business files its annual declaration with the tax authority before the statutory deadline.",
        );
      document
        .addPage()
        .text(
          "Article 2. The declaration must include the company identifier and the supporting payment information.",
        );
    });
    const ocrCalls: number[] = [];
    const extractor = createDocumentTextExtractor({
      pdf: new PopplerReader(),
      ocr: {
        async extractPage(input) {
          ocrCalls.push(input.page);
          return { text: "unexpected OCR result", confidence: 1 };
        },
      },
    });

    const result = await extractor.extract({
      bytes,
      filename: "text-document.pdf",
      contentType: "application/pdf",
    });

    expect(result.method).toBe("native");
    expect(result.pageCount).toBe(2);
    expect(result.text).toContain("## Page 1");
    expect(result.text).toContain("## Page 2");
    expect(result.text).toContain("registered business files its annual declaration");
    expect(result.text).toMatch(/supporting\s+payment information/);
    expect(ocrCalls).toEqual([]);
  });

  test("renders every page of an image-only PDF and preserves multilingual OCR text", async () => {
    const bytes = await pdf((document) => {
      document.addPage().rect(40, 40, 180, 80).fill("#111111");
      document.addPage().rect(40, 40, 220, 120).fill("#222222");
    });
    const renderedPages: { page: number; signature: number[]; language?: string }[] = [];
    const pageText = new Map([
      [1, "قانون المالية لسنة 2026"],
      [2, "Loi de finances pour l'année 2026"],
    ]);
    const extractor = createDocumentTextExtractor({
      pdf: new PopplerReader(),
      ocr: {
        async extractPage(input) {
          renderedPages.push({
            page: input.page,
            signature: [...input.image.subarray(0, 8)],
            language: input.language,
          });
          return { text: pageText.get(input.page) ?? "", confidence: 0.97 };
        },
      },
    });

    const result = await extractor.extract({
      bytes,
      filename: "scanned-document.pdf",
      contentType: "application/pdf",
      languages: "fra+ara",
    });

    expect(result.method).toBe("ocr");
    expect(result.pageCount).toBe(2);
    expect(result.text).toBe(
      "## Page 1\n\nقانون المالية لسنة 2026\n\n## Page 2\n\nLoi de finances pour l'année 2026",
    );
    expect(renderedPages).toEqual([
      { page: 1, signature: [137, 80, 78, 71, 13, 10, 26, 10], language: "fra+ara" },
      { page: 2, signature: [137, 80, 78, 71, 13, 10, 26, 10], language: "fra+ara" },
    ]);
  });
});
