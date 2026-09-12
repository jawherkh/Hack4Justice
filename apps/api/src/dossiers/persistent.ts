import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { AccessError } from "../access/policy";
import { checksum, type FileStore, inspectFile, MAX_UPLOAD_BYTES } from "./files";
import { storageSchema } from "./schema";
import { createDemoDossierRepository, InMemoryDossierRepository,
  type AccessRepository, type CreateDossierInput, type ConfirmedFactsInput,
  type LifecycleCommandInput, type RepositorySnapshot, type UploadDocumentInput } from "./store";

type UploadResult = ReturnType<AccessRepository["uploadDocument"]>;
export type BinaryUpload = Omit<UploadDocumentInput, "content" | "binary"> & { bytes: Uint8Array; idempotencyKey?: string };
export type TextUpload = UploadDocumentInput & { idempotencyKey?: string };
export type AsyncAccessRepository = {
  [K in keyof AccessRepository]: (...args: Parameters<AccessRepository[K]>) =>
    ReturnType<AccessRepository[K]> | Promise<ReturnType<AccessRepository[K]>>;
} & {
  uploadDocument(input: TextUpload): UploadResult | Promise<UploadResult>;
  uploadFile?(input: BinaryUpload): Promise<UploadResult>;
  readContent?(id: string): Promise<Uint8Array>;
};
interface Connection { query<T>(statement: string, parameters?: unknown[]): Promise<T[]> }

export class PersistentRepository implements AsyncAccessRepository {
  private readonly sql;
  constructor(url: string, readonly files: FileStore, readonly schema = "h4j_api") {
    if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error("Invalid database schema");
    this.sql = postgres(url, { max: 5, prepare: false, connect_timeout: 10, onnotice: () => {} });
  }
  private statement(value: string) { return value.replaceAll("h4j_api", `"${this.schema}"`); }
  private async query<T>(statement: string, parameters: unknown[] = []): Promise<T[]> {
    return await this.sql.unsafe(this.statement(statement), parameters as never[]) as unknown as T[];
  }
  private async transaction<T>(fn: (tx: Connection) => Promise<T>): Promise<T> {
    return await this.sql.begin(async (sql) => fn({ query: async <R>(statement: string, parameters: unknown[] = []) =>
      await sql.unsafe(this.statement(statement), parameters as never[]) as unknown as R[] })) as T;
  }
  async initialize(seedDemo = false) {
    if (seedDemo && process.env.NODE_ENV === "production") throw new Error("Demo seed is disabled in production");
    await this.transaction(async (tx) => {
      await tx.query("SELECT pg_advisory_xact_lock(hashtext($1))", [`${this.schema}:initialize`]);
      await tx.query(storageSchema);
      const seed = seedDemo ? createDemoDossierRepository() : new InMemoryDossierRepository();
      await tx.query("INSERT INTO h4j_api.repository(id,snapshot) VALUES(1,$1::jsonb) ON CONFLICT DO NOTHING", [seed.snapshot()]);
    });
  }
  async close() { await this.sql.end({ timeout: 5 }); }
  private async read<T>(fn: (repository: InMemoryDossierRepository) => T): Promise<T> {
    const row = (await this.query<{snapshot: RepositorySnapshot}>("SELECT snapshot FROM h4j_api.repository WHERE id=1"))[0];
    if (!row) throw new AccessError(503, "storage_not_initialized");
    return fn(InMemoryDossierRepository.restore(row.snapshot));
  }
  private async write<T>(fn: (repository: InMemoryDossierRepository, tx: Connection) => T | Promise<T>): Promise<T> {
    return this.transaction(async (tx) => {
      // Serialize mutations across API processes so version checks and their writes are atomic.
      const row = (await tx.query<{snapshot: RepositorySnapshot}>("SELECT snapshot FROM h4j_api.repository WHERE id=1 FOR UPDATE"))[0];
      if (!row) throw new AccessError(503, "storage_not_initialized");
      const repository = InMemoryDossierRepository.restore(row.snapshot);
      const result = await fn(repository, tx);
      await tx.query("UPDATE h4j_api.repository SET snapshot=$1::jsonb WHERE id=1", [repository.snapshot()]);
      return result;
    });
  }
  dossiers() { return this.read((r) => r.dossiers()); }
  dossier(id: string) { return this.read((r) => r.dossier(id)); }
  dossierDetail(id: string) { return this.read((r) => r.dossierDetail(id)); }
  document(id: string) { return this.read((r) => r.document(id)); }
  node(id: string) { return this.read((r) => r.node(id)); }
  dependency(id: string) { return this.read((r) => r.dependency(id)); }
  grants() { return this.read((r) => r.grants()); }
  procedures() { return this.read((r) => r.procedures()); }
  procedure(id: string) { return this.read((r) => r.procedure(id)); }
  createDossier(input: CreateDossierInput) { return this.write((r) => r.createDossier(input)); }
  updateConfirmedFacts(input: ConfirmedFactsInput) { return this.write((r) => r.updateConfirmedFacts(input)); }
  dispatchCommand(input: LifecycleCommandInput) { return this.write((r) => r.dispatchCommand(input)); }

  uploadDocument(input: TextUpload) {
    const { binary: _untrusted, ...text } = input;
    return this.storeUpload(text, new TextEncoder().encode(input.content));
  }
  async uploadFile(input: BinaryUpload) {
    const { bytes, ...metadata } = input;
    inspectFile(bytes, metadata.mimeType);
    return this.storeUpload({ ...metadata, content: "" }, bytes);
  }
  private async storeUpload(input: TextUpload, bytes: Uint8Array): Promise<UploadResult> {
    if (bytes.length === 0) throw new AccessError(422, "empty_file");
    if (bytes.length > MAX_UPLOAD_BYTES) throw new AccessError(413, "file_too_large");
    const sha256 = checksum(bytes);
    // Fixed field order makes retries independent of JSON property order and generated storage IDs.
    const fingerprint = checksum(new TextEncoder().encode(JSON.stringify([
      input.dossierId, input.nodeId, input.filename, input.mimeType, sha256,
      input.requirementIds ? [...input.requirementIds].sort() : null,
      input.replacesDocumentId ?? null, input.expectedVersion, input.uploadedBy,
    ])));
    return this.write(async (repository, tx) => {
      const scope = `${input.dossierId}:${input.uploadedBy}`;
      if (input.idempotencyKey) {
        const previous = (await tx.query<{fingerprint: string; response: UploadResult}>(
          "SELECT fingerprint,response FROM h4j_api.upload_receipts WHERE scope=$1 AND key=$2", [scope, input.idempotencyKey]))[0];
        if (previous) {
          if (previous.fingerprint !== fingerprint) throw new AccessError(409, "idempotency_conflict");
          return previous.response;
        }
      }
      const key = randomUUID();
      const result = repository.uploadDocument({ ...input, binary: { bytes, sha256, storageRef: `file://${key}` } });
      // Write exclusively before committing metadata. A failed transaction can leave an orphan, never overwrite an original.
      await this.files.put(key, bytes);
      await tx.query("INSERT INTO h4j_api.originals(id,storage_key,metadata) VALUES($1,$2,$3::jsonb)", [result.document.id, key, result.document]);
      if (input.idempotencyKey) await tx.query(
        "INSERT INTO h4j_api.upload_receipts(scope,key,fingerprint,response) VALUES($1,$2,$3,$4::jsonb)",
        [scope, input.idempotencyKey, fingerprint, result]);
      return result;
    });
  }
  async readContent(id: string): Promise<Uint8Array> {
    const original = (await this.query<{storage_key: string; metadata: {sha256: string}}>(
      "SELECT storage_key,metadata FROM h4j_api.originals WHERE id=$1", [id]))[0];
    if (original) return this.files.read(original.storage_key, original.metadata.sha256);
    const document = await this.document(id);
    if (!document) throw new AccessError(404, "not_found");
    if (!document.storageRef.startsWith("memory://")) throw new AccessError(500, "original_not_available");
    return new TextEncoder().encode(document.originalText);
  }
}
