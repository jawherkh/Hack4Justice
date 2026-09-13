import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { AccessError, type Agency } from "../access/policy";
import type { DossierPackage, PackageChanges, SubmissionOptions } from "./package";

export interface SubmissionReceipt {
  readonly id: string;
  readonly dossierId: string;
  readonly actorId: string;
  readonly version: number;
  readonly reference: string;
  readonly mode: NonNullable<SubmissionOptions["mode"]>;
  readonly simulated: boolean;
  readonly officialSubmission: false;
  readonly status: "queued" | "completed" | "rejected";
  readonly createdAt: string;
  readonly processedAt?: string;
  readonly error?: string;
  readonly delivery?: AgencySubmissionResult;
  readonly snapshot: DossierPackage;
  readonly changes: PackageChanges;
}

export interface AgencySubmissionResult {
  readonly reference: string;
  readonly status: "received";
  readonly simulated: boolean;
}

/** Implementations must use authorized agency credentials and deduplicate by idempotencyKey.
 * A transport timeout requires receipt lookup before retrying; it is not a refusal.
 * No connected implementation is enabled by the public API.
 */
export interface AgencySubmissionAdapter {
  readonly agency: Agency;
  readonly simulated: boolean;
  submit(input: { idempotencyKey: string; snapshot: DossierPackage }): Promise<AgencySubmissionResult>;
  lookup(idempotencyKey: string): Promise<AgencySubmissionResult | undefined>;
}

// A deterministic offline response, never evidence of a real agency filing.
export function simulatedReceipt(agency: Agency, key: string): AgencySubmissionResult {
  return {
    reference: `SIM-${agency}-${createHash("sha256").update(key).digest("hex").slice(0, 20)}`,
    status: "received",
    simulated: true,
  };
}

export class SyntheticSubmissionAdapter implements AgencySubmissionAdapter {
  readonly simulated = true;
  private readonly receipts = new Map<string, { snapshot: DossierPackage; result: AgencySubmissionResult }>();
  constructor(readonly agency: Agency) {}
  async submit(input: { idempotencyKey: string; snapshot: DossierPackage }) {
    if (input.snapshot.dossier.agency !== this.agency) throw new Error("Agency scope mismatch");
    const previous = this.receipts.get(input.idempotencyKey);
    if (previous) {
      if (!isDeepStrictEqual(previous.snapshot, input.snapshot))
        throw new AccessError(409, "idempotency_conflict");
      return structuredClone(previous.result);
    }
    const result = simulatedReceipt(this.agency, input.idempotencyKey);
    this.receipts.set(input.idempotencyKey, { snapshot: structuredClone(input.snapshot), result });
    return structuredClone(result);
  }
  async lookup(idempotencyKey: string) {
    const receipt = this.receipts.get(idempotencyKey);
    return receipt ? structuredClone(receipt.result) : undefined;
  }
}
