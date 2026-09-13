import { z } from "zod";

import { AccessError, type Agency } from "../access/policy";
import type {
  ObligationEvidenceReference,
  ObligationObservationInput,
  ObligationRelationship,
  ObligationStatus,
  ObligationVerificationState,
  ObligationWriteResult,
} from "./contracts";

const adapterObservation = z.strictObject({
  version: z.number().int().positive(),
  status: z.enum(["fulfilled", "unfulfilled", "unknown", "disputed"]),
  evidence: z.strictObject({
    kind: z.enum(["official_record", "synthetic_fixture"]),
    reference: z.string().trim().min(1).max(500),
  }),
  effectiveAt: z.iso.datetime({ offset: true }),
  observedAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
  verificationState: z.enum(["verified", "pending", "rejected", "synthetic"]),
});

export interface AdapterObservation {
  readonly version: number;
  readonly status: ObligationStatus;
  readonly evidence: ObligationEvidenceReference;
  readonly effectiveAt: string;
  readonly observedAt: string;
  readonly expiresAt: string;
  readonly verificationState: ObligationVerificationState;
}

export interface ObligationAdapterQuery {
  readonly obligationId: string;
  readonly companyId: string;
}

export interface AuthorizedAgencyObligationAdapter {
  readonly kind: "authorized_agency";
  readonly id: string;
  readonly agency: Agency;
  observe(query: ObligationAdapterQuery): Promise<AdapterObservation>;
}

export interface SyntheticObligationFixture extends ObligationAdapterQuery, AdapterObservation {}

export class SyntheticObligationAdapter {
  public readonly kind = "synthetic" as const;

  public constructor(
    public readonly id: string,
    public readonly agency: Agency,
    private readonly fixtures: readonly SyntheticObligationFixture[],
  ) {}

  public async observe(query: ObligationAdapterQuery): Promise<AdapterObservation> {
    const fixture = this.fixtures.find(
      (candidate) => candidate.obligationId === query.obligationId && candidate.companyId === query.companyId,
    );
    if (!fixture) throw new AccessError(404, "obligation_fixture_not_found");
    return {
      version: fixture.version,
      status: fixture.status,
      evidence: fixture.evidence,
      effectiveAt: fixture.effectiveAt,
      observedAt: fixture.observedAt,
      expiresAt: fixture.expiresAt,
      verificationState: fixture.verificationState,
    };
  }
}

export type ObligationAdapter = AuthorizedAgencyObligationAdapter | SyntheticObligationAdapter;

export interface ObligationObservationWriter {
  recordObligationObservation(
    input: ObligationObservationInput,
  ): ObligationWriteResult | Promise<ObligationWriteResult>;
}

export interface IngestObligationInput extends ObligationAdapterQuery {
  readonly consumerAgencies: readonly Agency[];
  readonly ruleVersionId: string;
  readonly relationships: readonly ObligationRelationship[];
  readonly recordedAt?: string;
}

export async function ingestObligationObservation(
  repository: ObligationObservationWriter,
  adapter: ObligationAdapter,
  input: IngestObligationInput,
): Promise<ObligationWriteResult> {
  const parsed = adapterObservation.safeParse(await adapter.observe(input));
  if (!parsed.success) throw new AccessError(422, "invalid_obligation_observation");

  const { version: sourceVersion, ...observation } = parsed.data;
  const synthetic = adapter.kind === "synthetic";
  if (
    synthetic !== (observation.verificationState === "synthetic") ||
    synthetic !== (observation.evidence.kind === "synthetic_fixture")
  ) {
    throw new AccessError(422, "obligation_source_mismatch");
  }

  return repository.recordObligationObservation({
    id: input.obligationId,
    companyId: input.companyId,
    agency: adapter.agency,
    consumerAgencies: input.consumerAgencies,
    sourceVersion,
    ...observation,
    authority: {
      agency: adapter.agency,
      kind: synthetic ? "synthetic" : "authorized_agency",
      sourceId: adapter.id,
    },
    ruleVersionId: input.ruleVersionId,
    relationships: input.relationships,
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  });
}
