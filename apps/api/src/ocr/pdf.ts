import { execFile as execFileCallback } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(execFileCallback);
const COMMAND_TIMEOUT_MS = 30_000;
const MAX_NATIVE_TEXT_BYTES = 2_000_000;

export interface PreparedPdf {
  texts: string[];
  pageCount?: number;
  image(page: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

export interface PdfReader {
  open(bytes: Uint8Array): Promise<PreparedPdf>;
}

export class PdfError extends Error {
  constructor(readonly code: "pdf_tools_unavailable" | "unreadable_pdf" | "pdf_page_limit") {
    super(code);
    this.name = "PdfError";
  }
}

export function isPdfBytes(bytes: Uint8Array): boolean {
  return new TextDecoder().decode(bytes.subarray(0, 5)) === "%PDF-";
}

async function command(program: string, args: string[], maxBuffer = MAX_NATIVE_TEXT_BYTES): Promise<string> {
  try {
    const result = await execFile(program, args, {
      encoding: "utf8",
      timeout: COMMAND_TIMEOUT_MS,
      maxBuffer,
      env: { ...process.env, LC_ALL: "C" },
    });
    return result.stdout;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") throw new PdfError("pdf_tools_unavailable");
    throw new PdfError("unreadable_pdf");
  }
}

/** Uses Poppler for deterministic PDF page/text handling before model OCR. */
export class PopplerReader implements PdfReader {
  constructor(private readonly maxPages = 100) {}

  async open(bytes: Uint8Array): Promise<PreparedPdf> {
    if (!isPdfBytes(bytes)) throw new PdfError("unreadable_pdf");

    const parent = resolve(tmpdir());
    const directory = await mkdtemp(join(parent, "h4j-pdf-"));
    const close = async () => {
      const target = resolve(directory);
      if (!target.startsWith(parent + sep + "h4j-pdf-")) throw new Error("Unexpected temporary PDF path");
      await rm(target, { recursive: true, force: true });
    };

    try {
      const path = join(directory, "source.pdf");
      await writeFile(path, bytes, { flag: "wx" });
      const info = await command("pdfinfo", [path]);
      const pageCount = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
      if (!pageCount || pageCount > this.maxPages) {
        throw new PdfError(pageCount > this.maxPages ? "pdf_page_limit" : "unreadable_pdf");
      }

      let native = "";
      try {
        native = await command("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"]);
      } catch (error) {
        // A scanned PDF can have no text layer. Let the OCR path handle every page.
        if (error instanceof PdfError && error.code === "pdf_tools_unavailable") throw error;
      }
      const texts = native.split("\f");

      return {
        texts: Array.from({ length: pageCount }, (_, index) => texts[index] ?? ""),
        pageCount,
        close,
        image: async (page: number) => {
          if (!Number.isInteger(page) || page < 1 || page > pageCount) throw new PdfError("unreadable_pdf");
          const prefix = join(directory, `page-${page}`);
          await command("pdftoppm", [
            "-f",
            String(page),
            "-l",
            String(page),
            "-r",
            "150",
            "-scale-to",
            "2200",
            "-png",
            "-singlefile",
            path,
            prefix,
          ]);
          return readFile(`${prefix}.png`);
        },
      };
    } catch (error) {
      await close();
      throw error;
    }
  }
}
