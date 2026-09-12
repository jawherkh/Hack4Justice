import { randomUUID } from "node:crypto";
import { link, mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sha256 } from "./engine";
import { ExtractionError, typedValue, type Correction, type FieldName, type Report } from "./types";

export type CorrectionInput = { expectedRevision: number; idempotencyKey: string; field: FieldName; page: number; quote: string; value: string | null; reason: string };
export class ReportStore {
  constructor(readonly directory: string) {}
  private validate(id: string) { if (!/^[a-f0-9]{64}$/.test(id)) throw new ExtractionError(422, "invalid_extraction_id"); }
  async get(id: string): Promise<Report | undefined> {
    this.validate(id);
    let files: string[];
    try { files = await readdir(this.directory); } catch (error) { if ((error as {code?: string}).code === "ENOENT") return undefined; throw error; }
    const latest = files.filter((name) => new RegExp(`^${id}\\.\\d{10}\\.json$`).test(name)).sort().at(-1);
    return latest ? JSON.parse(await readFile(join(this.directory, latest), "utf8")) as Report : undefined;
  }
  async append(report: Report): Promise<void> {
    this.validate(report.id);
    if (!Number.isSafeInteger(report.revision) || report.revision < 1 || report.revision > 9999999999) throw new ExtractionError(422, "invalid_revision");
    await mkdir(this.directory, { recursive: true });
    const temporary = join(this.directory, `${randomUUID()}.tmp`);
    const destination = join(this.directory, `${report.id}.${String(report.revision).padStart(10, "0")}.json`);
    await writeFile(temporary, JSON.stringify(report), { flag: "wx", mode: 0o600 });
    try { await link(temporary, destination); }
    catch (error) { if ((error as {code?: string}).code === "EEXIST") throw new ExtractionError(409, "extraction_revision_conflict"); throw error; }
    finally { await unlink(temporary); }
  }
  async correct(id: string, input: CorrectionInput, actorId: string): Promise<Report> {
    const current = await this.get(id);
    if (!current) throw new ExtractionError(404, "not_found");
    const fingerprint = sha256(JSON.stringify([actorId, input.field, input.page, input.quote, input.value, input.reason, input.expectedRevision]));
    const previous = current.corrections.find((c) => c.idempotencyKey === input.idempotencyKey && c.actorId === actorId);
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ExtractionError(409, "idempotency_conflict");
      return current;
    }
    if (current.revision !== input.expectedRevision) throw new ExtractionError(409, "extraction_revision_conflict");
    const page = current.extraction.pages.find((p) => p.number === input.page);
    if (!page || !input.quote || !page.text.includes(input.quote)) throw new ExtractionError(422, "invalid_evidence_quote");
    const converted = input.value === null ? { value: null } : typedValue(input.field, input.value);
    if (input.value !== null && converted.value === null) throw new ExtractionError(422, "invalid_typed_value");
    const correction: Correction = { field: input.field, value: converted.value, page: input.page, quote: input.quote,
      actorId, reason: input.reason, recordedAt: new Date().toISOString(), fingerprint, idempotencyKey: input.idempotencyKey };
    const result = { ...current, revision: current.revision + 1, corrections: [...current.corrections, correction] };
    await this.append(result);
    return result;
  }
}

export function effectiveFacts(report: Report) {
  const overridden = new Set(report.corrections.map((c) => `${c.field}:${c.page}`));
  const facts = report.extraction.facts.filter((f) => !overridden.has(`${f.field}:${f.page}`)).map((f) => ({
    field: f.field, value: f.value, page: f.page, quote: f.quote, source: f.source, basis: "proposed" as "proposed" | "user_corrected",
    state: f.state, actorId: null as string | null,
  }));
  const latest = new Map(report.corrections.map((c) => [`${c.field}:${c.page}`, c]));
  for (const c of latest.values()) facts.push({ field: c.field, value: c.value, page: c.page, quote: c.quote,
    source: report.extraction.source, basis: "user_corrected", state: c.value === null ? "missing" : "extracted", actorId: c.actorId });
  return facts;
}

export function compareReports(reports: Report[]) {
  const normalize = (value: string | number) => String(value).normalize("NFKC").replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[\u200e\u200f\u202a-\u202e]/g, "").trim().replace(/\s+/g, " ").toLocaleLowerCase("fr");
  const pairs = [];
  for (let left = 0; left < reports.length; left++) for (let right = left + 1; right < reports.length; right++) {
    const a = reports[left], b = reports[right];
    if (a.extraction.source.companyId !== b.extraction.source.companyId || a.extraction.source.dossierId !== b.extraction.source.dossierId) throw new ExtractionError(422, "comparison_scope_mismatch");
    if (a.extraction.source.documentId === b.extraction.source.documentId) continue;
    for (const x of effectiveFacts(a)) for (const y of effectiveFacts(b)) {
      if (x.field === y.field && x.value !== null && y.value !== null && normalize(x.value) !== normalize(y.value)) {
        pairs.push({ field: x.field, status: "potential_inconsistency" as const, requiresReview: true,
          evidence: [{ extractionId: a.id, revision: a.revision, ...x }, { extractionId: b.id, revision: b.revision, ...y }] });
      }
    }
  }
  return pairs;
}
