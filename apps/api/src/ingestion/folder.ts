import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

import type { HttpRequest } from "../ocr/deepseek";
import { isPdfBytes } from "../ocr/pdf";
import type { DocumentTextExtractor } from "../ocr/document";

const MAX_DOCUMENTS_PER_BATCH = 100;
const MAX_PDF_SIZE_BYTES = 25 * 1024 * 1024;

export type KnowledgeAgency = "DGI" | "RNE";

export interface FolderIngestionOptions {
  folder: string;
  agency: KnowledgeAgency | string;
  graphitiEndpoint: string;
  extractor: Pick<DocumentTextExtractor, "extract">;
  languages?: string;
  language?: string;
  sourceUriPrefix?: string;
  maxDocumentsPerRequest?: number;
  request?: HttpRequest;
}

export interface FolderIngestionResult {
  files: number;
  batches: number;
}

export class FolderIngestionError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
    this.name = "FolderIngestionError";
  }
}

interface LegalDocumentPayload {
  document_id: string;
  title: string;
  text: string;
  source_uri: string;
  source_kind: "official";
  language: string;
  section: string;
}

const SUPPORTED_SOURCE_EXTENSIONS = new Set([".pdf", ".html", ".htm", ".txt", ".md"]);

async function sourceFiles(root: string, directory = root): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) {
      files.push(...await sourceFiles(root, path));
    } else if (entry.isFile() && SUPPORTED_SOURCE_EXTENSIONS.has(entry.name.slice(entry.name.lastIndexOf(".")).toLowerCase())) {
      files.push(path);
    }
  }
  return files.sort((left, right) => relative(root, left).localeCompare(relative(root, right)));
}

function contentTypeFor(file: string): string {
  const extension = file.slice(file.lastIndexOf(".")).toLowerCase();
  return extension === ".pdf" ? "application/pdf" : extension === ".html" || extension === ".htm" ? "text/html" : "text/plain";
}

function sourceUri(file: string, root: string, prefix?: string): string {
  const relativePath = relative(root, file).split(sep).join("/");
  if (!prefix) return pathToFileURL(file).href;
  return `${prefix.replace(/\/$/, "")}/${relativePath.split("/").map(encodeURIComponent).join("/")}`;
}

async function sendBatch(
  endpoint: string,
  agency: KnowledgeAgency,
  documents: LegalDocumentPayload[],
  request: HttpRequest,
): Promise<void> {
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Agency-Code": agency },
    body: JSON.stringify({ documents }),
  });
  if (!response.ok) throw new FolderIngestionError(502, `Graphiti ingestion failed with ${response.status}`);
}

/** Recursively ingests PDF files into the agency-scoped Graphiti bulk endpoint. */
export async function ingestPdfFolder(options: FolderIngestionOptions): Promise<FolderIngestionResult> {
  const agency = options.agency.trim().toUpperCase();
  if (agency !== "DGI" && agency !== "RNE") throw new FolderIngestionError(400, "agency must be DGI or RNE");

  const root = resolve(options.folder);
  if (!(await stat(root)).isDirectory()) throw new FolderIngestionError(400, "folder must be a directory");
  const files = await sourceFiles(root);
  const request: HttpRequest = options.request ?? fetch;
  const batchSize = Math.min(Math.max(options.maxDocumentsPerRequest ?? MAX_DOCUMENTS_PER_BATCH, 1), MAX_DOCUMENTS_PER_BATCH);
  const documents: LegalDocumentPayload[] = [];

  for (const file of files) {
    const bytes = new Uint8Array(await readFile(file));
    const contentType = contentTypeFor(file);
    if (contentType === "application/pdf") {
      if (bytes.byteLength > MAX_PDF_SIZE_BYTES) throw new FolderIngestionError(413, `PDF is larger than 25 MB: ${file}`);
      if (!isPdfBytes(bytes)) throw new FolderIngestionError(415, `File is not a valid PDF: ${file}`);
    }
    const extracted = await options.extractor.extract({
      bytes,
      filename: file,
      contentType,
      languages: options.languages,
    });
    documents.push({
      document_id: createHash("sha256").update(bytes).digest("hex"),
      title: file.split(sep).at(-1)!.replace(/\.(pdf|html?|txt|md)$/i, ""),
      text: extracted.text,
      source_uri: sourceUri(file, root, options.sourceUriPrefix),
      source_kind: "official",
      language: options.language ?? "fr",
      section: relative(root, file).split(sep).join("/"),
    });
  }

  let batches = 0;
  for (let index = 0; index < documents.length; index += batchSize) {
    await sendBatch(options.graphitiEndpoint, agency as KnowledgeAgency, documents.slice(index, index + batchSize), request);
    batches += 1;
  }
  return { files: files.length, batches };
}
