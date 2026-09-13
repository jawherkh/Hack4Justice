import type { Agency, DependencyScope } from "../access/policy";

export type ObligationStatus = "fulfilled" | "unfulfilled" | "unknown" | "disputed";
export type ObligationVerificationState = "verified" | "pending" | "rejected" | "synthetic";
export type ObligationFreshness = "scheduled" | "fresh" | "expired";
export type ObligationAction = "submit" | "resubmit" | "execute_external";

export interface ObligationAuthority {
  readonly agency: Agency;
  readonly kind: "authorized_agency" | "officer_reassessment" | "synthetic";
  readonly sourceId: string;
  readonly officerId?: string;
}

export interface ObligationEvidenceReference {
  readonly kind: "official_record" | "officer_attestation" | "synthetic_fixture";
  readonly reference: string;
}

export interface ObligationRelationship {
  readonly dossierId: string;
  readonly nodeId: string;
  readonly agency: Agency;
  readonly action: ObligationAction;
}

export interface ObligationCorrection {
  readonly kind: "correction" | "reassessment";
  readonly reason: string;
  readonly officerId: string;
  readonly previousEventId: string;
}

export interface ObligationObservationInput extends DependencyScope {
  readonly id: string;
  readonly sourceVersion: number;
  readonly status: ObligationStatus;
  readonly authority: ObligationAuthority;
  readonly evidence: ObligationEvidenceReference;
  readonly effectiveAt: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly recordedAt: string;
  readonly verificationState: ObligationVerificationState;
  readonly ruleVersionId: string;
  readonly relationships: readonly ObligationRelationship[];
  readonly correction?: ObligationCorrection;
}

export interface ObligationRecord extends ObligationObservationInput {
  readonly version: number;
  readonly ruleVersionStatus: "approved" | "synthetic";
  readonly lastEventId: string;
  readonly simulated: boolean;
}

export interface ObligationChangeEvent {
  readonly id: string;
  readonly type: "obligation_status_changed";
  readonly obligationId: string;
  readonly companyId: string;
  readonly version: number;
  readonly sourceVersion: number;
  readonly status: ObligationStatus;
  readonly verificationState: ObligationVerificationState;
  readonly authority: ObligationAuthority;
  readonly evidence: ObligationEvidenceReference;
  readonly effectiveAt: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly occurredAt: string;
  readonly ruleVersionId: string;
  readonly ruleVersionStatus: "approved" | "synthetic";
  readonly consumerAgencies: readonly Agency[];
  readonly relationships: readonly ObligationRelationship[];
  readonly correction?: ObligationCorrection;
}

export interface ObligationWriteResult {
  readonly applied: boolean;
  readonly reason?: "stale_or_duplicate";
  readonly record: ObligationRecord;
  readonly event?: ObligationChangeEvent;
}

export interface OfficerReassessmentInput {
  readonly obligationId: string;
  readonly expectedVersion: number;
  readonly status: ObligationStatus;
  readonly effectiveAt: string;
  readonly expiresAt: string;
  readonly evidenceReference: string;
  readonly reason: string;
  readonly kind: "correction" | "reassessment";
  readonly officerId: string;
  readonly recordedAt: string;
}

export function obligationFreshness(
  record: Pick<ObligationRecord, "effectiveAt" | "expiresAt">,
  now = Date.now(),
): ObligationFreshness {
  if (Date.parse(record.effectiveAt) > now) return "scheduled";
  if (Date.parse(record.expiresAt) <= now) return "expired";
  return "fresh";
}
