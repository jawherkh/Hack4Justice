import { createRequire } from "node:module";

import bidiFactory from "bidi-js";
import { marked, type Token, type Tokens } from "marked";
import PDFDocument from "pdfkit";

const ink = "#172033";
const muted = "#526079";
const moduleRequire = createRequire(import.meta.url);
const bidi = bidiFactory();
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const fonts = {
  regular: {
    latin: moduleRequire.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-400-normal.woff"),
    arabic: moduleRequire.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
  },
  bold: {
    latin: moduleRequire.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-700-normal.woff"),
    arabic: moduleRequire.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff"),
  },
} as const;

type FontWeight = keyof typeof fonts;
type FontScript = keyof (typeof fonts)[FontWeight];
type TextDirection = "ltr" | "rtl";

export interface PdfVisualRun {
  readonly direction: TextDirection;
  readonly script: FontScript;
  readonly text: string;
}

export interface PdfVisualLine {
  readonly direction: TextDirection;
  readonly runs: readonly PdfVisualRun[];
}

export type MarkdownPdfBlock =
  | {
      readonly kind: "text";
      readonly text: string;
      readonly weight: FontWeight;
      readonly size: number;
      readonly color: string;
      readonly spacing: number;
      readonly indent: number;
      readonly lineGap: number;
      readonly preserveWhitespace: boolean;
    }
  | { readonly kind: "rule" };

function registerFonts(document: PDFKit.PDFDocument) {
  document.registerFont("ResponseLatin", fonts.regular.latin);
  document.registerFont("ResponseArabic", fonts.regular.arabic);
  document.registerFont("ResponseLatinBold", fonts.bold.latin);
  document.registerFont("ResponseArabicBold", fonts.bold.arabic);
}

function fontName(script: FontScript, weight: FontWeight): string {
  return `Response${script === "arabic" ? "Arabic" : "Latin"}${weight === "bold" ? "Bold" : ""}`;
}

function usesArabicFont(character: string, previousScript?: FontScript): boolean {
  return (
    /\p{Script_Extensions=Arabic}/u.test(character) ||
    (/^[\u200c\u200d]$/u.test(character) && previousScript === "arabic")
  );
}

function fontRuns(text: string): { script: FontScript; text: string }[] {
  const runs: { script: FontScript; text: string }[] = [];
  for (const character of text) {
    const previous = runs.at(-1);
    const script: FontScript = usesArabicFont(character, previous?.script) ? "arabic" : "latin";
    if (previous?.script === script) previous.text += character;
    else runs.push({ script, text: character });
  }
  return runs;
}

function fontScriptAt(text: string, index: number): FontScript {
  const character = text[index] ?? "";
  if (/\p{Script_Extensions=Arabic}/u.test(character)) return "arabic";
  if (/^[\u200c\u200d]$/u.test(character)) {
    return /\p{Script_Extensions=Arabic}/u.test(text[index - 1] ?? "") ||
      /\p{Script_Extensions=Arabic}/u.test(text[index + 1] ?? "")
      ? "arabic"
      : "latin";
  }
  return "latin";
}

/**
 * Produces left-to-right drawing runs while preserving logical character order
 * inside each shaped word. PDFKit can shape Arabic glyphs, but it does not apply
 * paragraph-level bidirectional ordering across mixed Arabic and Latin words.
 */
export function pdfVisualLine(text: string, baseDirection: TextDirection | "auto" = "auto"): PdfVisualLine {
  if (!text) return { direction: baseDirection === "rtl" ? "rtl" : "ltr", runs: [] };
  const embedding = bidi.getEmbeddingLevels(text, baseDirection);
  const direction: TextDirection = (embedding.paragraphs[0]?.level ?? 0) % 2 === 1 ? "rtl" : "ltr";
  const indices = bidi.getReorderedIndices(text, embedding);
  const mirrored = bidi.getMirroredCharactersMap(text, embedding.levels);
  const groups: { direction: TextDirection; script: FontScript; indices: number[]; step?: number }[] = [];

  for (const index of indices) {
    const runDirection: TextDirection = (embedding.levels[index] ?? 0) % 2 === 1 ? "rtl" : "ltr";
    const script = fontScriptAt(text, index);
    const current = groups.at(-1);
    const previousIndex = current?.indices.at(-1);
    const step = previousIndex === undefined ? undefined : index - previousIndex;
    if (
      !current ||
      current.direction !== runDirection ||
      current.script !== script ||
      (step !== 1 && step !== -1) ||
      (current.step !== undefined && current.step !== step)
    ) {
      groups.push({ direction: runDirection, script, indices: [index] });
      continue;
    }
    current.indices.push(index);
    current.step ??= step;
  }

  return {
    direction,
    runs: groups.map(({ direction: runDirection, script, indices: groupIndices }) => ({
      direction: runDirection,
      script,
      text: (script === "arabic" && runDirection === "rtl"
        ? [...groupIndices].sort((left, right) => left - right)
        : groupIndices
      )
        .map((index) => mirrored.get(index) ?? text[index])
        .join(""),
    })),
  };
}

export function pdfKitRunText(run: PdfVisualRun): string {
  if (run.script !== "arabic" || run.direction !== "ltr") return run.text;
  return [...graphemeSegmenter.segment(run.text)]
    .map(({ segment }) => segment)
    .reverse()
    .join("");
}

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|quot);/gi, (entity, name: string) => {
    const normalized = name.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "apos") return "'";
    if (normalized === "gt") return ">";
    if (normalized === "lt") return "<";
    if (normalized === "quot") return '"';
    const codePoint = normalized.startsWith("#x")
      ? Number.parseInt(normalized.slice(2), 16)
      : Number.parseInt(normalized.slice(1), 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity;
  });
}

function inlineText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      if (token.type === "html") return "";
      if (token.type === "br") return "\n";
      if (token.type === "checkbox") return token.checked ? "[x] " : "[ ] ";
      if (token.type === "image") return token.text ? `[Image: ${decodeEntities(token.text)}]` : "[Image]";
      if ("tokens" in token && Array.isArray(token.tokens)) return inlineText(token.tokens);
      if ("text" in token && typeof token.text === "string") return decodeEntities(token.text);
      return "";
    })
    .join("");
}

function blockText(tokens: readonly Token[]): string {
  return tokens
    .map((token) => {
      switch (token.type) {
        case "heading":
        case "paragraph":
          return inlineText(token.tokens ?? []);
        case "text":
          return token.tokens ? inlineText(token.tokens) : decodeEntities(token.text);
        case "code":
          return token.text;
        case "space":
          return "\n\n";
        case "blockquote":
          return blockText(token.tokens ?? []);
        case "list": {
          const start = typeof token.start === "number" ? token.start : 1;
          return token.items
            .map(
              (item: Tokens.ListItem, index: number) =>
                `${token.ordered ? `${start + index}.` : "•"} ${blockText(item.tokens).trim()}`,
            )
            .join("\n");
        }
        case "html":
        case "hr":
        case "def":
          return "";
        default:
          return "tokens" in token && Array.isArray(token.tokens) ? blockText(token.tokens) : "";
      }
    })
    .join("");
}

function textBlock(
  text: string,
  options: Partial<Omit<Extract<MarkdownPdfBlock, { kind: "text" }>, "kind" | "text">> = {},
): MarkdownPdfBlock {
  return {
    kind: "text",
    text,
    weight: options.weight ?? "regular",
    size: options.size ?? 11,
    color: options.color ?? ink,
    spacing: options.spacing ?? 0.65,
    indent: options.indent ?? 0,
    lineGap: options.lineGap ?? 3,
    preserveWhitespace: options.preserveWhitespace ?? false,
  };
}

function collectBlocks(tokens: readonly Token[], blocks: MarkdownPdfBlock[], depth = 0): void {
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const sizes = [24, 20, 17, 15, 13, 12];
        blocks.push(
          textBlock(inlineText(token.tokens ?? []), {
            weight: "bold",
            size: sizes[token.depth - 1] ?? 12,
            spacing: 0.45,
            lineGap: 2,
          }),
        );
        break;
      }
      case "paragraph":
        blocks.push(textBlock(inlineText(token.tokens ?? [])));
        break;
      case "text":
        blocks.push(textBlock(token.tokens ? inlineText(token.tokens) : decodeEntities(token.text)));
        break;
      case "blockquote": {
        let pending: Token[] = [];
        const flush = () => {
          const quote = blockText(pending).trim();
          if (quote) blocks.push(textBlock(quote, { color: muted, indent: 18 + depth * 12 }));
          pending = [];
        };
        for (const quoteToken of token.tokens ?? []) {
          if (["blockquote", "code", "hr", "list", "table"].includes(quoteToken.type)) {
            flush();
            collectBlocks([quoteToken], blocks, depth + 1);
          } else {
            pending.push(quoteToken);
          }
        }
        flush();
        break;
      }
      case "code":
        blocks.push(
          textBlock(token.text, {
            size: 9,
            spacing: 0.75,
            indent: 12 + depth * 12,
            lineGap: 2,
            preserveWhitespace: true,
          }),
        );
        break;
      case "list": {
        const list = token as Tokens.List;
        const start = typeof list.start === "number" ? list.start : 1;
        list.items.forEach((item: Tokens.ListItem, index: number) => {
          const marker = list.ordered ? `${start + index}.` : "•";
          const checkbox = item.task ? (item.checked ? "[x] " : "[ ] ") : "";
          let leading = `${marker} ${checkbox}`;
          let pending: Token[] = [];
          const flush = () => {
            const body = blockText(pending).trim();
            if (body)
              blocks.push(textBlock(`${leading}${body}`, { indent: (leading ? 12 : 24) + depth * 12 }));
            if (body) leading = "";
            pending = [];
          };
          for (const itemToken of item.tokens) {
            if (["blockquote", "code", "hr", "list", "table"].includes(itemToken.type)) {
              flush();
              if (leading) {
                blocks.push(textBlock(leading.trimEnd(), { indent: 12 + depth * 12 }));
                leading = "";
              }
              collectBlocks([itemToken], blocks, depth + 1);
            } else {
              pending.push(itemToken);
            }
          }
          flush();
        });
        break;
      }
      case "table": {
        const rows: Tokens.TableCell[][] = [token.header, ...token.rows];
        rows.forEach((row, index) => {
          blocks.push(
            textBlock(row.map((cell) => inlineText(cell.tokens)).join("  |  "), {
              weight: index === 0 ? "bold" : "regular",
              size: 9,
              spacing: 0.35,
              lineGap: 2,
            }),
          );
        });
        break;
      }
      case "hr":
        blocks.push({ kind: "rule" });
        break;
      case "html":
      case "space":
      case "def":
        break;
      default:
        if ("tokens" in token && Array.isArray(token.tokens)) collectBlocks(token.tokens, blocks, depth + 1);
    }
  }
}

export function markdownToPdfBlocks(markdown: string): MarkdownPdfBlock[] {
  const blocks: MarkdownPdfBlock[] = [];
  collectBlocks(marked.lexer(markdown, { gfm: true }), blocks);
  return blocks;
}

function measureText(document: PDFKit.PDFDocument, text: string, weight: FontWeight, size: number): number {
  document.fontSize(size);
  return fontRuns(text).reduce(
    (width, run) => width + document.font(fontName(run.script, weight)).widthOfString(run.text),
    0,
  );
}

function splitLongToken(
  document: PDFKit.PDFDocument,
  token: string,
  weight: FontWeight,
  size: number,
  maxWidth: number,
): string[] {
  const pieces: string[] = [];
  let current = "";
  for (const { segment } of graphemeSegmenter.segment(token)) {
    if (current && measureText(document, current + segment, weight, size) > maxWidth) {
      pieces.push(current);
      current = segment;
    } else {
      current += segment;
    }
  }
  if (current) pieces.push(current);
  return pieces;
}

function wrapLogicalLine(
  document: PDFKit.PDFDocument,
  text: string,
  weight: FontWeight,
  size: number,
  maxWidth: number,
  preserveWhitespace: boolean,
): string[] {
  if (!text) return [""];
  if (preserveWhitespace)
    return measureText(document, text, weight, size) <= maxWidth
      ? [text]
      : splitLongToken(document, text, weight, size, maxWidth);
  const lines: string[] = [];
  let current = "";
  for (const token of text.match(/\s+|\S+/gu) ?? []) {
    if (/^\s+$/u.test(token)) {
      if (current) current += token.replace(/\s+/gu, " ");
      continue;
    }
    if (current && measureText(document, current + token, weight, size) > maxWidth) {
      lines.push(current.trimEnd());
      current = "";
    }
    if (measureText(document, token, weight, size) <= maxWidth) {
      current += token;
      continue;
    }
    const pieces = splitLongToken(document, token, weight, size, maxWidth);
    lines.push(...pieces.slice(0, -1));
    current = pieces.at(-1) ?? "";
  }
  if (current) lines.push(current.trimEnd());
  return lines.length ? lines : [""];
}

function ensureVerticalSpace(document: PDFKit.PDFDocument, height: number): void {
  if (document.y + height > document.page.height - document.page.margins.bottom) document.addPage();
}

function writeText(document: PDFKit.PDFDocument, block: Extract<MarkdownPdfBlock, { kind: "text" }>): void {
  document.font(fontName("latin", block.weight)).fontSize(block.size).fillColor(block.color);
  const lineHeight = document.currentLineHeight(true) + block.lineGap;
  const availableWidth =
    document.page.width - document.page.margins.left - document.page.margins.right - block.indent * 2;

  for (const logicalLine of block.text.replace(/\r\n?/gu, "\n").split("\n")) {
    const paragraph = bidi.getEmbeddingLevels(logicalLine);
    const baseDirection: TextDirection = (paragraph.paragraphs[0]?.level ?? 0) % 2 === 1 ? "rtl" : "ltr";
    for (const line of wrapLogicalLine(
      document,
      logicalLine,
      block.weight,
      block.size,
      availableWidth,
      block.preserveWhitespace,
    )) {
      ensureVerticalSpace(document, lineHeight);
      const y = document.y;
      if (line) {
        const visual = pdfVisualLine(line, baseDirection);
        const measuredRuns = visual.runs.map((run) => ({
          ...run,
          width: measureText(document, run.text, block.weight, block.size),
        }));
        const lineWidth = measuredRuns.reduce((width, run) => width + run.width, 0);
        let x =
          visual.direction === "rtl"
            ? document.page.width - document.page.margins.right - block.indent - lineWidth
            : document.page.margins.left + block.indent;
        for (const run of measuredRuns) {
          document
            .font(fontName(run.script, block.weight))
            .fontSize(block.size)
            .fillColor(block.color)
            .text(pdfKitRunText(run), x, y, { lineBreak: false });
          x += run.width;
        }
      }
      document.x = document.page.margins.left;
      document.y = y + lineHeight;
    }
  }
  document.y += lineHeight * block.spacing;
}

function renderBlocks(document: PDFKit.PDFDocument, blocks: readonly MarkdownPdfBlock[]): void {
  for (const block of blocks) {
    if (block.kind === "text") {
      if (block.text.trim()) writeText(document, block);
      continue;
    }
    ensureVerticalSpace(document, 12);
    document
      .moveTo(document.page.margins.left, document.y)
      .lineTo(document.page.width - document.page.margins.right, document.y)
      .strokeColor("#c8cfdb")
      .stroke();
    document.y += 12;
  }
}

/**
 * Converts Markdown tokens directly to PDF drawing commands. HTML and resource URLs are
 * deliberately ignored, so model output cannot execute markup or cause server-side fetches.
 */
export async function renderMarkdownPdf(markdown: string): Promise<Uint8Array> {
  const document = new PDFDocument({
    size: "A4",
    margins: { top: 54, right: 54, bottom: 54, left: 54 },
    info: { Title: "Agent response", Creator: "Hack4Justice API" },
  });
  registerFonts(document);
  const chunks: Buffer[] = [];
  const output = new Promise<Uint8Array>((resolve, reject) => {
    document.on("data", (chunk: Buffer | Uint8Array) => chunks.push(Buffer.from(chunk)));
    document.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    document.on("error", reject);
  });

  renderBlocks(document, markdownToPdfBlocks(markdown));
  document.end();
  return await output;
}
