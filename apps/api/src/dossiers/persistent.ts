import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { AccessError } from "../access/policy";
import { checksum, type FileStore, inspectFile, MAX_UPLOAD_BYTES } from "./files";
import { storageSchema } from "./schema";
import type { CommandReference, CommandResult, LifecycleEvent, PreparedCommand, Transition } from "../lifecycle/contracts";
import { lifecycleCommandBody, prerequisiteBody } from "../lifecycle/validation";
import { createDemoDossierRepository, InMemoryDossierRepository,
  type AgentEventInput, type AgentEventRecord, type AgentRepository, type AgentSessionRecord,
  type ArtifactRecord, type BinaryEvidenceInput, type CreateAgentSessionInput, type CreateDossierInput, type ConfirmedFactsInput,
  type CreateHelperTaskInput, type HelperTaskRecord, type LifecycleCommandInput, type PublishArtifactInput,
  type AccessRepository, type RepositorySnapshot, type UploadDocumentInput } from "./store";

type UploadResult = ReturnType<AccessRepository["uploadDocument"]>;
export type BinaryUpload = Omit<UploadDocumentInput, "content" | "binary"> & { bytes: Uint8Array; idempotencyKey?: string };
export type TextUpload = UploadDocumentInput & { idempotencyKey?: string };
export type AsyncAccessRepository = {
  dossiers(): ReturnType<AccessRepository["dossiers"]> | Promise<ReturnType<AccessRepository["dossiers"]>>;
  dossier(id: string): ReturnType<AccessRepository["dossier"]> | Promise<ReturnType<AccessRepository["dossier"]>>;
  dossierDetail(id: string): ReturnType<AccessRepository["dossierDetail"]> | Promise<ReturnType<AccessRepository["dossierDetail"]>>;
  document(id: string): ReturnType<AccessRepository["document"]> | Promise<ReturnType<AccessRepository["document"]>>;
  node(id: string): ReturnType<AccessRepository["node"]> | Promise<ReturnType<AccessRepository["node"]>>;
  dependency(id: string): ReturnType<AccessRepository["dependency"]> | Promise<ReturnType<AccessRepository["dependency"]>>;
  grants(): ReturnType<AccessRepository["grants"]> | Promise<ReturnType<AccessRepository["grants"]>>;
  procedures(): ReturnType<AccessRepository["procedures"]> | Promise<ReturnType<AccessRepository["procedures"]>>;
  procedure(id: string): ReturnType<AccessRepository["procedure"]> | Promise<ReturnType<AccessRepository["procedure"]>>;
  createDossier(input: CreateDossierInput): ReturnType<AccessRepository["createDossier"]> | Promise<ReturnType<AccessRepository["createDossier"]>>;
  uploadDocument(input: TextUpload): UploadResult | Promise<UploadResult>;
  updateConfirmedFacts(input: ConfirmedFactsInput): ReturnType<AccessRepository["updateConfirmedFacts"]> | Promise<ReturnType<AccessRepository["updateConfirmedFacts"]>>;
  dispatchCommand(input: LifecycleCommandInput): ReturnType<AccessRepository["dispatchCommand"]> | Promise<ReturnType<AccessRepository["dispatchCommand"]>>;
} & {
  uploadFile?(input: BinaryUpload): Promise<UploadResult>;
  readContent?(id: string): Promise<Uint8Array>;
  commandResult?(reference: CommandReference): Promise<CommandResult | undefined>;
  lifecycleEvents?(dossierId: string, after: number): Promise<LifecycleEvent[]>;
};
interface Connection { query<T>(statement: string, parameters?: unknown[]): Promise<T[]> }

export class PersistentRepository implements AsyncAccessRepository, AgentRepository {
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
  private async write<T>(fn: (repository: InMemoryDossierRepository, tx: Connection) => T | Promise<T>, eventContext: Partial<LifecycleEvent> = {}): Promise<T> {
    return this.transaction(async (tx) => {
      // Serialize mutations across API processes so version checks and their writes are atomic.
      const row = (await tx.query<{snapshot: RepositorySnapshot}>("SELECT snapshot FROM h4j_api.repository WHERE id=1 FOR UPDATE"))[0];
      if (!row) throw new AccessError(503, "storage_not_initialized");
      const repository = InMemoryDossierRepository.restore(row.snapshot);
      const result = await fn(repository, tx);
      const snapshot = repository.snapshot();
      await tx.query("UPDATE h4j_api.repository SET snapshot=$1::jsonb WHERE id=1", [snapshot]);
      for (const dossier of snapshot.dossiers) {
        if (row.snapshot.dossiers.find((d) => d.id === dossier.id)?.version === dossier.version) continue;
        const event: LifecycleEvent = { ...eventContext, id: `${dossier.id}:${dossier.version}`, type: "projection_changed",
          companyId: dossier.companyId, dossierId: dossier.id, aggregateVersion: dossier.version, occurredAt: dossier.updatedAt,
          lifecycle: dossier.lifecycle, agencyAcceptance: dossier.agencyAcceptance, readiness: dossier.readiness, prerequisiteStatus: dossier.prerequisiteStatus };
        await tx.query("INSERT INTO h4j_api.lifecycle_events(dossier_id,version,event) VALUES($1,$2,$3::jsonb)", [dossier.id, dossier.version, event]);
      }
      return result;
    });
  }
  dossiers() { return this.read((r) => r.dossiers()); }
  dossier(id: string) { return this.read((r) => r.dossier(id)); }
  dossierDetail(id: string) { return this.read((r) => r.dossierDetail(id)); }
  dependencies(companyId: string, agency: "DGI" | "RNE" | "APII") { return this.read((r) => r.dependencies(companyId, agency)); }
  document(id: string) { return this.read((r) => r.document(id)); }
  node(id: string) { return this.read((r) => r.node(id)); }
  dependency(id: string) { return this.read((r) => r.dependency(id)); }
  grants() { return this.read((r) => r.grants()); }
  procedures() { return this.read((r) => r.procedures()); }
  procedure(id: string) { return this.read((r) => r.procedure(id)); }
  createDossier(input: CreateDossierInput) { return this.write((r) => r.createDossier(input)); }
  updateConfirmedFacts(input: ConfirmedFactsInput) {
    return this.write(async (r, tx) => {
      const result = r.updateConfirmedFacts(input);
      await this.enqueue(r, tx, { dossierId: input.dossierId, actorId: input.actorId ?? "system",
        type: "evidence_changed", expectedVersion: result.detail.dossier.version, idempotencyKey: `facts:${result.detail.dossier.version}` });
      return result;
    });
  }
  dispatchCommand(input: LifecycleCommandInput) {
    return this.write((r, tx) => this.enqueue(r, tx, input));
  }
  private async enqueue(r: InMemoryDossierRepository, tx: Connection, input: LifecycleCommandInput) {
    if (input.type === "prerequisite_changed") {
      if (!prerequisiteBody.safeParse(input.prerequisite).success) throw new AccessError(422, "invalid_prerequisite");
    } else {
      const { dossierId: _dossier, actorId: _actor, ...body } = input;
      if (!lifecycleCommandBody.safeParse(body).success) throw new AccessError(422, "invalid_command");
    }
    const detail = r.dossierDetail(input.dossierId);
    if (!detail) throw new AccessError(404, "not_found");
    if (input.decision) {
      const node = detail.nodes.find((n) => n.id === input.nodeId);
      if (!node || !["human_review", "decision"].includes(node.type)) throw new AccessError(422, "invalid_review_node");
      if (input.decision.targetNodeIds.some((id) => !detail.nodes.some((n) => n.id === id)) ||
        input.decision.evidenceIds.some((id) => !detail.evidence.some((d) => d.id === id))) throw new AccessError(422, "invalid_evidence_scope");
    }
    const ack = r.dispatchCommand(input);
    await tx.query("INSERT INTO h4j_api.lifecycle_commands(id,dossier_id,payload,result) VALUES($1,$2,$3::jsonb,$4::jsonb) ON CONFLICT DO NOTHING",
      [ack.commandId, input.dossierId, input, { commandId: ack.commandId, dossierId: input.dossierId, status: "queued" }]);
    return ack;
  }

  async commandResult(reference: CommandReference) {
    return (await this.query<{result: CommandResult}>("SELECT result FROM h4j_api.lifecycle_commands WHERE id=$1 AND dossier_id=$2", [reference.commandId, reference.dossierId]))[0]?.result;
  }
  async lifecycleEvents(dossierId: string, after: number) {
    return (await this.query<{event: LifecycleEvent}>("SELECT event FROM h4j_api.lifecycle_events WHERE dossier_id=$1 AND version>$2 ORDER BY version LIMIT 100", [dossierId, after])).map((r) => r.event);
  }
  async claimCommands(): Promise<CommandReference[]> {
    return this.transaction(async (tx) => (await tx.query<{id: string; dossier_id: string; sequence: string}>(`
      UPDATE h4j_api.lifecycle_commands SET next_delivery_at=now()+interval '30 seconds'
      WHERE id IN (SELECT id FROM h4j_api.lifecycle_commands WHERE result->>'status'='queued' AND next_delivery_at<=now()
        ORDER BY sequence LIMIT 50 FOR UPDATE SKIP LOCKED) RETURNING id,dossier_id,sequence
    `)).sort((a, b) => Number(a.sequence) - Number(b.sequence)).map((r) => ({ commandId: r.id, dossierId: r.dossier_id })));
  }
  async prepare(reference: CommandReference): Promise<PreparedCommand | null> {
    return this.write(async (r, tx) => {
      const row = (await tx.query<{payload: LifecycleCommandInput; result: CommandResult}>(
        "SELECT payload,result FROM h4j_api.lifecycle_commands WHERE id=$1 AND dossier_id=$2", [reference.commandId, reference.dossierId]))[0];
      if (!row || row.result.status !== "queued") return null;
      const dossier = r.dossier(reference.dossierId);
      if (!dossier) throw new AccessError(404, "not_found");
      return { reference, command: row.payload, now: new Date().toISOString(), state: {
        version: dossier.version, lifecycle: dossier.lifecycle, agencyAcceptance: dossier.agencyAcceptance,
        readiness: dossier.readiness, prerequisiteStatus: dossier.prerequisiteStatus,
        context: dossier.lifecycleContext ?? { prerequisites: {}, correctionNodeIds: [] },
      } };
    });
  }
  async commit(prepared: PreparedCommand, transition: Transition): Promise<CommandResult> {
    const { reference, command } = prepared;
    return this.write(async (r, tx) => {
      const previous = (await tx.query<{result: CommandResult}>("SELECT result FROM h4j_api.lifecycle_commands WHERE id=$1 AND dossier_id=$2", [reference.commandId, reference.dossierId]))[0];
      if (!previous) throw new AccessError(404, "not_found");
      if (previous.result.status !== "queued") return previous.result;
      const detail = r.dossierDetail(reference.dossierId)!;
      const expired = (command.type === "submission_requested" || command.type === "resubmission_requested") &&
        Object.values(prepared.state.context.prerequisites).some((o) => o.actions.includes(command.type as "submission_requested" | "resubmission_requested") && Date.parse(o.expiresAt) <= Date.now());
      const error = detail.dossier.version !== prepared.state.version ? "version_conflict" : "error" in transition ? transition.error : expired ? "prerequisite_needs_review" : undefined;
      const result: CommandResult = { ...reference, status: error ? "rejected" : "completed", ...(error ? { error } : {}) };
      if (!error && "state" in transition) {
        const { context, ...state } = transition.state;
        r.addDossier({ ...detail.dossier, ...state, lifecycleContext: context, updatedAt: prepared.now });
        result.version = state.version;
        for (const node of detail.nodes) {
          const targeted = context.correctionNodeIds.includes(node.id);
          const reviewed = node.type === "human_review" || node.type === "decision";
          r.addNode({ ...node, version: node.version + 1, agencyAcceptance: state.agencyAcceptance,
            prerequisiteStatus: state.prerequisiteStatus, readiness: state.readiness,
            state: state.lifecycle === "cancelled" ? "cancelled" : targeted ? "needs_correction" :
              reviewed && state.lifecycle === "closed" ? "completed" : state.agencyAcceptance === "pending" &&
                (reviewed || prepared.state.context.correctionNodeIds.includes(node.id)) ? "waiting" : node.state });
        }
        if (command.decision) r.addDecision({ companyId: detail.dossier.companyId, dossierId: reference.dossierId,
          agency: detail.dossier.agency, id: `decision-${reference.commandId}`, nodeId: command.nodeId!, actorId: command.actorId,
          ...command.decision, dossierVersion: state.version, createdAt: prepared.now });
      }
      await tx.query("UPDATE h4j_api.lifecycle_commands SET result=$2::jsonb WHERE id=$1", [reference.commandId, result]);
      return result;
    }, { commandId: reference.commandId, actorId: command.actorId, correlationId: command.correlationId ?? command.idempotencyKey,
      ...(command.decision ? { decisionId: `decision-${reference.commandId}` } : {}) });
  }

  uploadDocument(input: TextUpload) {
    const { binary: _untrusted, ...text } = input;
    return this.storeUpload(text, new TextEncoder().encode(input.content));
  }
  async uploadFile(input: BinaryUpload | BinaryEvidenceInput) {
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
      await this.enqueue(repository, tx, { dossierId: input.dossierId, actorId: input.uploadedBy,
        type: "evidence_changed", nodeId: input.nodeId, expectedVersion: result.detail.dossier.version, idempotencyKey: `upload:${result.document.id}` });
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

  agentSession(id: string, dossierId: string, principalId: string): Promise<AgentSessionRecord | undefined> {
    return this.read((r) => r.agentSession(id, dossierId, principalId));
  }

  createAgentSession(input: CreateAgentSessionInput): Promise<AgentSessionRecord> {
    return this.write((r) => r.createAgentSession(input));
  }

  saveAgentSession(session: AgentSessionRecord): Promise<AgentSessionRecord> {
    return this.write((r) => r.saveAgentSession(session));
  }

  appendAgentEvent(input: AgentEventInput): Promise<AgentEventRecord> {
    return this.write((r) => r.appendAgentEvent(input));
  }

  agentEvents(sessionId: string, after: number): Promise<readonly AgentEventRecord[]> {
    return this.read((r) => r.agentEvents(sessionId, after));
  }

  agentRun(sessionId: string, runId: string) {
    return this.read((r) => r.agentRun(sessionId, runId));
  }

  createHelperTask(input: CreateHelperTaskInput): Promise<HelperTaskRecord> {
    return this.write((r) => r.createHelperTask(input));
  }

  helperTask(id: string): Promise<HelperTaskRecord | undefined> {
    return this.read((r) => r.helperTask(id));
  }

  async publishArtifact(input: PublishArtifactInput): Promise<ArtifactRecord> {
    const key = randomUUID();
    return this.write(async (r) => {
      const artifact = r.publishArtifact({ ...input, storageRef: `file://${key}` });
      if (!artifact.storageRef.startsWith("file://")) return artifact;
      // An idempotent replay returns the already stored file and must not try to create a
      // second object under a different key.
      if (artifact.storageRef === `file://${key}`) {
        await this.files.put(key, input.bytes);
      }
      return artifact;
    });
  }

  async artifact(id: string): Promise<ArtifactRecord | undefined> {
    return this.read((r) => r.artifact(id));
  }

  async readArtifact(id: string): Promise<Uint8Array> {
    const artifact = await this.artifact(id);
    if (!artifact) throw new AccessError(404, "not_found");
    if (!artifact.storageRef.startsWith("file://")) {
      return await this.read((r) => r.readArtifact(id));
    }
    return this.files.read(artifact.storageRef.slice("file://".length), artifact.sha256);
  }

}
