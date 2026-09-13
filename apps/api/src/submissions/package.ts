import { createHash } from "node:crypto";
import { zipSync } from "fflate";
import { AccessError } from "../access/policy";
import type { DossierDetail, DocumentRecord, ProcedureVersionRecord } from "../dossiers/store";
import type { ObligationRecord } from "../obligations/contracts";
import { evaluateActionGate, evaluateRequirements, resolveActionNode } from "../requirements/evaluator";

export interface PackageSelection {
  readonly action: "submit" | "resubmit";
  readonly nodeId?: string;
  readonly documentIds?: readonly string[];
}

export interface SubmissionOptions {
  readonly documentIds?: readonly string[];
  readonly mode?: "platform_review" | "simulated_agency";
}

export function assembleDossierPackage(
  detail: DossierDetail,
  procedure: ProcedureVersionRecord,
  obligations: readonly ObligationRecord[],
  selection: PackageSelection,
) {
  const target = resolveActionNode(detail, selection.action, selection.nodeId);
  if (!target) throw new AccessError(422, "action_not_available");
  const replaced = new Set(detail.evidence.map((document) => document.replacesId));
  const current = detail.evidence.filter((document) => !replaced.has(document.id));
  const ids = selection.documentIds ?? current.map((document) => document.id);
  if (ids.length > 100 || new Set(ids).size !== ids.length)
    throw new AccessError(422, "invalid_document_selection");
  const documents = ids
    .map((id) => {
      const document = current.find((candidate) => candidate.id === id);
      if (
        !document ||
        document.companyId !== detail.dossier.companyId ||
        document.agency !== detail.dossier.agency
      )
        throw new AccessError(422, "invalid_document_selection");
      return document;
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  // Evaluate the actual export, not evidence the user has omitted from it.
  const selected = { ...detail, evidence: documents };
  const dossierGate = evaluateActionGate(detail, obligations, target, selection.action);
  const selectedGate = evaluateActionGate(selected, obligations, target, selection.action);
  const severity = { allowed: 0, needs_review: 1, blocked: 2 };
  return {
    format: 1 as const,
    assembledAt: new Date().toISOString(),
    officialSubmission: false as const,
    simulated: detail.dossier.simulated || procedure.status === "synthetic",
    dossier: detail.dossier,
    procedure,
    action: selection.action,
    nodeId: target.id,
    documents: documents.map(({ originalText: _text, storageRef: _storage, ...metadata }) => metadata),
    confirmedFacts: detail.dossier.confirmedFacts,
    findings: detail.findings,
    sources: detail.sources,
    requirements: evaluateRequirements(selected),
    // Selecting fewer files cannot hide a known problem in the current dossier.
    gate: severity[dossierGate.decision] > severity[selectedGate.decision] ? dossierGate : selectedGate,
  };
}

export type DossierPackage = ReturnType<typeof assembleDossierPackage>;
export interface PackageChanges {
  readonly documents: { readonly added: readonly string[]; readonly removed: readonly string[] };
  readonly facts: readonly { readonly key: string; readonly before: unknown; readonly after: unknown }[];
  readonly findingsChanged: boolean;
  readonly rulesChanged: boolean;
}

const canonical = (value: unknown): string =>
  JSON.stringify(value, (_key, item) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

export function packageChanges(
  previous: DossierPackage | undefined,
  current: DossierPackage,
): PackageChanges {
  const before = new Set(previous?.documents.map((document) => document.id));
  const after = new Set(current.documents.map((document) => document.id));
  const keys = new Set([
    ...Object.keys(previous?.confirmedFacts ?? {}),
    ...Object.keys(current.confirmedFacts),
  ]);
  return {
    documents: {
      added: [...after].filter((id) => !before.has(id)),
      removed: [...before].filter((id) => !after.has(id)),
    },
    facts: [...keys]
      .sort()
      .filter((key) => canonical(previous?.confirmedFacts[key]) !== canonical(current.confirmedFacts[key]))
      .map((key) => ({
        key,
        before: previous?.confirmedFacts[key] ?? null,
        after: current.confirmedFacts[key] ?? null,
      })),
    findingsChanged: canonical(previous?.findings ?? []) !== canonical(current.findings),
    rulesChanged: canonical(previous?.procedure) !== canonical(current.procedure),
  };
}

export async function exportDossierPackage(
  snapshot: DossierPackage,
  format: "json" | "zip",
  read: (document: Omit<DocumentRecord, "originalText" | "storageRef">) => Promise<Uint8Array>,
): Promise<Response> {
  const manifest = new TextEncoder().encode(JSON.stringify(snapshot, null, 2));
  let bytes = manifest;
  if (format === "zip") {
    const limit = 64 * 1024 * 1024;
    if (snapshot.documents.reduce((size, document) => size + document.sizeBytes, manifest.length) > limit)
      throw new AccessError(413, "package_too_large");
    const files: Record<string, Uint8Array> = { "manifest.json": manifest };
    let total = manifest.length;
    for (const [index, document] of snapshot.documents.entries()) {
      const content = await read(document);
      total += content.length;
      if (total > limit) throw new AccessError(413, "package_too_large");
      if (
        content.length !== document.sizeBytes ||
        createHash("sha256").update(content).digest("hex") !== document.sha256
      )
        throw new AccessError(409, "document_integrity_mismatch");
      const name = document.filename
        .replace(/[^\p{L}\p{N}._-]/gu, "_")
        .replace(/^\.+/, "_")
        .slice(0, 150);
      files[`documents/${index + 1}-${name || "document"}`] = content;
    }
    bytes = new Uint8Array(zipSync(files, { level: 0 }));
  }
  return new Response(bytes, {
    headers: {
      "content-type": format === "zip" ? "application/zip" : "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="dossier-v${snapshot.dossier.version}.${format}"`,
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}
