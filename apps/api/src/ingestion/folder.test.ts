import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";

import { ingestPdfFolder } from "./folder";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("legal PDF folder ingestion", () => {
  test("recursively sorts PDFs and sends agency-scoped Graphiti batches", async () => {
    const root = await mkdtemp(join(tmpdir(), "h4j-ingest-test-"));
    directories.push(root);
    await mkdir(join(root, "nested"));
    await writeFile(join(root, "z.pdf"), "%PDF-z");
    await writeFile(join(root, "nested", "a.PDF"), "%PDF-a");
    await writeFile(join(root, "tax.html"), "<h1>Tax identifier</h1>");
    await writeFile(join(root, "notes.jpg"), "skip me");

    const extractedTypes: string[] = [];
    const requests: {
      url: string;
      agency: string | null;
      documents: { title: string; text: string; section?: string }[];
    }[] = [];
    const result = await ingestPdfFolder({
      folder: root,
      agency: "RNE",
      graphitiEndpoint: "http://graphiti.test/api/v1/knowledge/ingest/bulk",
      maxDocumentsPerRequest: 1,
      extractor: {
        async extract(input) {
          extractedTypes.push(input.contentType ?? "");
          return { text: `text for ${input.filename}`, pageCount: 1, method: "native" as const };
        },
      },
      request: async (input, init) => {
        const body = JSON.parse(String(init?.body)) as {
          documents: { title: string; text: string; section?: string }[];
        };
        requests.push({
          url: String(input),
          agency: new Headers(init?.headers).get("X-Agency-Code"),
          documents: body.documents,
        });
        return new Response(
          JSON.stringify({ documents: body.documents.map((document) => ({ document_id: document.title })) }),
          { status: 200 },
        );
      },
    });

    expect(result).toEqual({ files: 3, batches: 3, partialDocuments: 0, skippedChunks: 0 });
    expect(extractedTypes).toEqual(["application/pdf", "text/html", "application/pdf"]);
    expect(requests.map((request) => request.documents[0]?.title)).toEqual(["a", "tax", "z"]);
    expect(requests.every((request) => request.url.endsWith("/bulk"))).toBe(true);
    expect(requests.every((request) => request.agency === "RNE")).toBe(true);
    expect(requests[0]?.documents[0]?.section).toBe("nested/a.PDF");
  });

  test("reports chunks skipped by Graphiti without failing the folder run", async () => {
    const root = await mkdtemp(join(tmpdir(), "h4j-ingest-test-"));
    directories.push(root);
    await writeFile(join(root, "tax.txt"), "tax source");

    const result = await ingestPdfFolder({
      folder: root,
      agency: "DGI",
      graphitiEndpoint: "http://graphiti.test/api/v1/knowledge/ingest/bulk",
      extractor: {
        async extract() {
          return { text: "tax source", pageCount: 1, method: "native" as const };
        },
      },
      request: async () =>
        new Response(
          JSON.stringify({
            documents: [{ status: "partial", skipped_chunks: [{}, {}] }],
          }),
          { status: 200 },
        ),
    });

    expect(result).toEqual({ files: 1, batches: 1, partialDocuments: 1, skippedChunks: 2 });
  });

  test("rejects an agency outside the initial RNE and DGI scope", async () => {
    const root = await mkdtemp(join(tmpdir(), "h4j-ingest-test-"));
    directories.push(root);

    await expect(
      ingestPdfFolder({
        folder: root,
        agency: "APII",
        graphitiEndpoint: "http://graphiti.test/api/v1/knowledge/ingest/bulk",
        extractor: {
          async extract() {
            return { text: "text", pageCount: 1, method: "native" as const };
          },
        },
        request: async (input, init) => fetch(input, init),
      }),
    ).rejects.toThrow("agency must be DGI or RNE");
  });
});
