import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { ExtractionError } from "./types";

export interface PreparedDocument {
  texts: string[];
  image(page: number): Promise<Uint8Array>;
  close(): Promise<void>;
}
export interface PdfReader { open(bytes: Uint8Array): Promise<PreparedDocument> }

async function command(args: string[]) {
  let child: ReturnType<typeof Bun.spawn>;
  try { child = Bun.spawn(args, { stdout: "pipe", stderr: "ignore", env: { ...process.env, LC_ALL: "C" } }); }
  catch { throw new ExtractionError(503, "pdf_tools_unavailable"); }
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    const result = await new Response(child.stdout as ReadableStream).text();
    if (await child.exited !== 0) throw new ExtractionError(422, "unreadable_pdf");
    return result;
  } finally { clearTimeout(timer); }
}

export class PopplerReader implements PdfReader {
  constructor(private readonly maxPages = 20) {}
  async open(bytes: Uint8Array): Promise<PreparedDocument> {
    const parent = resolve(tmpdir());
    const directory = await mkdtemp(join(parent, "h4j-extract-"));
    const close = async () => {
      const target = resolve(directory);
      if (!target.startsWith(parent + sep + "h4j-extract-")) throw new Error("Unexpected temporary path");
      await rm(target, { recursive: true, force: true });
    };
    try {
      const path = join(directory, "source.pdf");
      await writeFile(path, bytes, { flag: "wx" });
      const info = await command(["pdfinfo", path]);
      const pages = Number(/^Pages:\s+(\d+)/m.exec(info)?.[1]);
      if (!pages || pages > this.maxPages) throw new ExtractionError(422, "pdf_page_limit");
      const textPath = join(directory, "native.txt");
      await command(["pdftotext", "-layout", "-enc", "UTF-8", path, textPath]);
      if ((await stat(textPath)).size > 2_000_000) throw new ExtractionError(413, "extracted_text_limit");
      const native = await readFile(textPath, "utf8");
      if (native.length > 500_000) throw new ExtractionError(413, "extracted_text_limit");
      const texts = native.split("\f");
      return { texts: Array.from({ length: pages }, (_, index) => texts[index] ?? ""), close,
        image: async (page) => {
          if (!Number.isInteger(page) || page < 1 || page > pages) throw new ExtractionError(422, "invalid_page");
          const prefix = join(directory, `page-${page}`);
          await command(["pdftoppm", "-f", String(page), "-l", String(page), "-r", "150", "-scale-to", "2200", "-png", "-singlefile", path, prefix]);
          return readFile(prefix + ".png");
        },
      };
    } catch (error) { await close(); throw error; }
  }
}
