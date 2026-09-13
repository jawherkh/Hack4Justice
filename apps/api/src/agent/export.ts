import { createRequire } from "node:module";

import { marked, type Token, type Tokens } from "marked";
import PDFDocument from "pdfkit";

const ink = "#172033";
const muted = "#526079";
const require = createRequire(import.meta.url);
const fonts = {
  regular: {
    latin: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-400-normal.woff"),
    arabic: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-400-normal.woff"),
  },
  bold: {
    latin: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-latin-700-normal.woff"),
    arabic: require.resolve("@fontsource/noto-sans-arabic/files/noto-sans-arabic-arabic-700-normal.woff"),
  },
} as const;

type FontWeight = keyof typeof fonts;

function registerFonts(document: PDFKit.PDFDocument) {
  document.registerFont("ResponseLatin", fonts.regular.latin);
  document.registerFont("ResponseArabic", fonts.regular.arabic);
  document.registerFont("ResponseLatinBold", fonts.bold.latin);
  document.registerFont("ResponseArabicBold", fonts.bold.arabic);
}

function fontRuns(text: string): { arabic: boolean; text: string }[] {
  const runs: { arabic: boolean; text: string }[] = [];
  for (const character of text) {
    const arabic = /\p{Script_Extensions=Arabic}/u.test(character)
      ? true
      : /\p{Letter}/u.test(character)
        ? false
        : (runs.at(-1)?.arabic ?? false);
    const current = runs.at(-1);
    if (current?.arabic === arabic) current.text += character;
    else runs.push({ arabic, text: character });
  }
  return runs;
}

function writeText(
  document: PDFKit.PDFDocument,
  text: string,
  weight: FontWeight,
  size: number,
  color: string,
  spacing: number,
  options: PDFKit.Mixins.TextOptions = {},
) {
  const runs = fontRuns(text);
  if (runs.length === 0) return;
  document.fontSize(size).fillColor(color);
  runs.forEach((run, index) => {
    const suffix = weight === "bold" ? "Bold" : "";
    document.font(`Response${run.arabic ? "Arabic" : "Latin"}${suffix}`).text(run.text, {
      ...(index === 0 ? options : {}),
      continued: index < runs.length - 1,
    });
  });
  document.moveDown(spacing);
}

function decodeEntities(value: string): string {
  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|amp|apos|gt|lt|quot);/gi, (entity, name: string) => {
    const normalized = name.toLowerCase();
    if (normalized === "amp") return "&";
    if (normalized === "apos") return "'";
    if (normalized === "gt") return ">";
    if (normalized === "lt") return "<";
    if (normalized === "quot") return '"';
    const codePoint = normalized.startsWith("#x") ? Number.parseInt(normalized.slice(2), 16) : Number.parseInt(normalized.slice(1), 10);
    return Number.isSafeInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : entity;
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

function renderParagraph(document: PDFKit.PDFDocument, text: string, options: PDFKit.Mixins.TextOptions = {}) {
  if (!text.trim()) return;
  writeText(document, text, "regular", 11, ink, 0.65, { lineGap: 3, ...options });
}

function renderTokens(document: PDFKit.PDFDocument, tokens: readonly Token[], depth = 0): void {
  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const sizes = [24, 20, 17, 15, 13, 12];
        writeText(document, inlineText(token.tokens ?? []), "bold", sizes[token.depth - 1] ?? 12, ink, 0.45, { lineGap: 2 });
        break;
      }
      case "paragraph":
        renderParagraph(document, inlineText(token.tokens ?? []));
        break;
      case "text":
        renderParagraph(document, token.tokens ? inlineText(token.tokens) : decodeEntities(token.text));
        break;
      case "blockquote": {
        const quote = inlineText(token.tokens ?? []).trim();
        if (quote) {
          writeText(document, quote, "regular", 11, muted, 0.65, { indent: 18 + depth * 12, lineGap: 3 });
        }
        break;
      }
      case "code":
        writeText(document, token.text, "regular", 9, ink, 0.75, { indent: 12 + depth * 12, lineGap: 2 });
        break;
      case "list": {
        const list = token as Tokens.List;
        const start = typeof list.start === "number" ? list.start : 1;
        list.items.forEach((item: Tokens.ListItem, index: number) => {
          const marker = list.ordered ? `${start + index}.` : "•";
          const checkbox = item.task ? (item.checked ? "[x] " : "[ ] ") : "";
          renderParagraph(document, `${marker} ${checkbox}${inlineText(item.tokens).trim()}`, {
            indent: 12 + depth * 12,
          });
        });
        break;
      }
      case "table": {
        const rows: Tokens.TableCell[][] = [token.header, ...token.rows];
        rows.forEach((row, index) => {
          writeText(document, row.map((cell) => inlineText(cell.tokens)).join("  |  "), index === 0 ? "bold" : "regular", 9, ink, 0.35, { lineGap: 2 });
        });
        document.moveDown(0.35);
        break;
      }
      case "hr":
        document
          .moveTo(document.x, document.y)
          .lineTo(document.page.width - document.page.margins.right, document.y)
          .strokeColor("#c8cfdb")
          .stroke()
          .moveDown(0.8);
        break;
      case "html":
      case "space":
      case "def":
        break;
      default:
        if ("tokens" in token && Array.isArray(token.tokens)) renderTokens(document, token.tokens, depth + 1);
    }
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

  renderTokens(document, marked.lexer(markdown, { gfm: true }));
  document.end();
  return await output;
}
