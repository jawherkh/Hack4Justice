import { createRequire } from "node:module";

import { Elysia } from "elysia";
import PDFDocument from "pdfkit";
import { describe, expect, test, vi } from "vitest";

import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { errorHandler } from "../errors";
import { markdownToPdfBlocks, pdfKitRunText, pdfVisualLine } from "./export";
import { createAgentRoutes } from "./routes";

const member = "demo-member-alpha";
const dossierId = "dossier-alpha-dgi";
const require = createRequire(import.meta.url);

function shapedCodePoints(text: string): number[] {
  const document = new PDFDocument();
  document.registerFont("ArabicProbe", require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"));
  document.font("ArabicProbe");
  const font = (document as unknown as {
    _font: { font: { layout(value: string): { glyphs: { codePoints: number[] }[] } } };
  })._font.font;
  const codePoints = font.layout(text).glyphs.flatMap((glyph) => glyph.codePoints);
  document.end();
  return codePoints;
}

function request(path: string, user = member) {
  return new Request(`http://localhost/api/v1${path}`, { headers: { "x-demo-user": user } });
}

function fixture() {
  const repository = createDemoRepository();
  const session = repository.createAgentSession({ dossierId, principalId: member });
  const complete = (runId: string, finalOutput: string, interrupted = false) => {
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_started",
      data: { runId },
    });
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_completed",
      data: { runId, finalOutput, interrupted },
    });
  };
  const server = new Elysia({ prefix: "/api/v1" }).use(errorHandler).use(createAgentRoutes(repository, createDemoIdentity(true, "test"), undefined, false));
  const exportPath = (runId: string, format: string) => `/dossiers/${dossierId}/agent/sessions/${session.id}/runs/${runId}/export?format=${format}`;
  return { repository, session, complete, server, exportPath };
}

describe("agent response exports", () => {
  test("keeps nested lists and paragraph breaks when converting Markdown", () => {
    const blocks = markdownToPdfBlocks("- Before\n  - Nested\n\n  After\n\n> first paragraph\n>\n> second paragraph")
      .filter((block) => block.kind === "text");

    expect(blocks.map(({ text }) => text)).toEqual([
      "• Before",
      "• Nested",
      "After",
      "first paragraph\n\nsecond paragraph",
    ]);
    expect(blocks.map(({ indent }) => indent)).toEqual([12, 24, 24, 18]);
  });

  test("preserves leading and internal whitespace in fenced code", () => {
    const blocks = markdownToPdfBlocks("```python\nif ready:\n    submit()\n```");

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: "text", text: "if ready:\n    submit()", preserveWhitespace: true });
  });

  test("keeps code blocks separate from surrounding list and quote text", () => {
    const listBlocks = markdownToPdfBlocks("- Example:\n\n  ~~~python\n  if ready:\n      submit()\n  ~~~");
    const quoteBlocks = markdownToPdfBlocks("> Context\n>\n> ~~~python\n> if ready:\n>     submit()\n> ~~~");

    expect(listBlocks).toMatchObject([
      { kind: "text", text: "• Example:", preserveWhitespace: false },
      { kind: "text", text: "if ready:\n    submit()", preserveWhitespace: true },
    ]);
    expect(quoteBlocks).toMatchObject([
      { kind: "text", text: "Context", preserveWhitespace: false },
      { kind: "text", text: "if ready:\n    submit()", preserveWhitespace: true },
    ]);
  });

  test("orders Arabic words bidirectionally and keeps ASCII in the Latin font", () => {
    expect(pdfVisualLine("المستندات جاهزة")).toEqual({
      direction: "rtl",
      runs: [
        { direction: "rtl", script: "arabic", text: "جاهزة" },
        { direction: "rtl", script: "latin", text: " " },
        { direction: "rtl", script: "arabic", text: "المستندات" },
      ],
    });

    const mixed = pdfVisualLine("المبلغ 123.45 TND (2026)");
    expect(mixed.direction).toBe("rtl");
    expect(mixed.runs.filter(({ script }) => script === "arabic").map(({ text }) => text)).toEqual(["المبلغ"]);
    expect(mixed.runs.filter(({ script }) => script === "latin").every(({ text }) => !/\p{Script_Extensions=Arabic}/u.test(text))).toBe(true);
    expect(mixed.runs.map(({ text }) => text).join("")).toBe("TND (2026) 123.45 المبلغ");

    expect(pdfVisualLine("جاهزة (المستندات).").runs[0]).toEqual({ direction: "rtl", script: "latin", text: ".(" });
    const numericRuns = pdfVisualLine("المبلغ ١٢٣.٤٥").runs.filter((run) => run.script === "arabic" && run.direction === "ltr");
    expect(numericRuns.map(({ text }) => text)).toEqual(["١٢٣", "٤٥"]);
    expect(numericRuns.map((run) => String.fromCodePoint(...shapedCodePoints(pdfKitRunText(run))))).toEqual(["١٢٣", "٤٥"]);
  });

  test("downloads the requested completed run as its original Markdown", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-first", "# First\n\n- one");
    complete("run-second", "# Second");

    const response = await server.handle(request(exportPath("run-first", "markdown")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("agent-response-run-first.md");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("# First\n\n- one");
  });

  test("renders a valid PDF without resolving markup resources", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-pdf", "# Report\n\nPièces vérifiées. المستندات جاهزة.\n\n![remote](https://example.invalid/file.png)\n\n<script>alert(1)</script>");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const response = await server.handle(request(exportPath("run-pdf", "pdf")));
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain("agent-response-run-pdf.pdf");
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.byteLength).toBeGreaterThan(500);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("does not expose a session response to another dossier reader", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-private", "private answer");

    const response = await server.handle(request(exportPath("run-private", "markdown"), "demo-officer-dgi"));

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private answer");
  });

  test("rejects unsupported formats and runs without a usable completed response", async () => {
    const { repository, session, complete, server, exportPath } = fixture();
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_started",
      data: { runId: "run-active" },
    });
    complete("run-interrupted", "partial", true);
    complete("run-empty", "   ");

    expect((await server.handle(request(exportPath("run-active", "markdown")))).status).toBe(409);
    expect((await server.handle(request(exportPath("run-interrupted", "pdf")))).status).toBe(409);
    expect((await server.handle(request(exportPath("run-empty", "markdown")))).status).toBe(409);
    expect((await server.handle(request(exportPath("missing", "markdown")))).status).toBe(404);
    expect((await server.handle(request(exportPath("run-active", "docx")))).status).toBe(422);
  });
});
