import { Elysia } from "elysia";
import { z } from "zod";

import type { ResolvePrincipal } from "../access/identity";
import {
  AccessError,
  canReadDependency,
  isMember,
  isOfficer,
  requireAccess,
  type Agency,
  type Principal,
} from "../access/policy";
import type { AsyncAccessRepository } from "../dossiers/persistent";
import {
  obligationFreshness,
  type ObligationChangeEvent,
  type ObligationRecord,
  type ObligationRelationship,
} from "./contracts";

const reassessmentBody = z.strictObject({
  expectedVersion: z.number().int().positive(),
  status: z.enum(["fulfilled", "unfulfilled", "unknown", "disputed"]),
  kind: z.enum(["correction", "reassessment"]),
  reason: z.string().trim().min(1).max(2000),
  evidenceReference: z.string().trim().min(1).max(500),
  effectiveAt: z.iso.datetime({ offset: true }),
  expiresAt: z.iso.datetime({ offset: true }),
});

function found<T>(value: T | undefined): T {
  if (!value) throw new AccessError(404, "not_found");
  return value;
}

function parseAgency(value: string): Agency {
  const parsed = z.enum(["dgi", "rne", "apii"]).safeParse(value.toLowerCase());
  if (!parsed.success) throw new AccessError(404, "not_found");
  return parsed.data.toUpperCase() as Agency;
}

function visibleRelationships(
  principal: Principal,
  record: ObligationRecord,
): readonly ObligationRelationship[] {
  if (isMember(principal, record.companyId) || isOfficer(principal, record.agency)) {
    return record.relationships;
  }
  return record.relationships.filter((relationship) => isOfficer(principal, relationship.agency));
}

function projection(principal: Principal, record: ObligationRecord) {
  const relationships = visibleRelationships(principal, record);
  return {
    ...record,
    consumerAgencies:
      relationships.length === record.relationships.length
        ? record.consumerAgencies
        : [...new Set(relationships.map((relationship) => relationship.agency))],
    relationships,
    freshness: obligationFreshness(record),
  };
}

function eventProjection(principal: Principal, record: ObligationRecord, event: ObligationChangeEvent) {
  if (isMember(principal, record.companyId) || isOfficer(principal, record.agency)) return event;
  const relationships = event.relationships.filter((relationship) =>
    isOfficer(principal, relationship.agency),
  );
  return {
    ...event,
    consumerAgencies:
      relationships.length === event.relationships.length
        ? event.consumerAgencies
        : [...new Set(relationships.map((relationship) => relationship.agency))],
    relationships,
  };
}

function affectedDossiers(relationships: readonly ObligationRelationship[]) {
  const grouped = new Map<
    string,
    { dossierId: string; agency: Agency; nodeIds: Set<string>; actions: Set<string> }
  >();
  for (const relationship of relationships) {
    const row = grouped.get(relationship.dossierId) ?? {
      dossierId: relationship.dossierId,
      agency: relationship.agency,
      nodeIds: new Set<string>(),
      actions: new Set<string>(),
    };
    row.nodeIds.add(relationship.nodeId);
    row.actions.add(relationship.action);
    grouped.set(relationship.dossierId, row);
  }
  return [...grouped.values()].map((row) => ({
    dossierId: row.dossierId,
    agency: row.agency,
    nodeIds: [...row.nodeIds],
    actions: [...row.actions],
  }));
}

export function createObligationRoutes(
  repository: AsyncAccessRepository,
  resolvePrincipal: ResolvePrincipal,
) {
  return new Elysia({ name: "obligations" })
    .resolve(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
    .get("/obligations/:obligationId", async ({ params, principal }) => {
      const record = found(await repository.obligation(params.obligationId));
      requireAccess(canReadDependency(principal, record));
      return projection(principal, record);
    })
    .get("/obligations/:obligationId/dependencies", async ({ params, principal }) => {
      const record = found(await repository.obligation(params.obligationId));
      requireAccess(canReadDependency(principal, record));
      const relationships = visibleRelationships(principal, record);
      return {
        obligationId: record.id,
        version: record.version,
        ruleVersion: { id: record.ruleVersionId, status: record.ruleVersionStatus },
        responsibleAgency: record.agency,
        consumerAgencies:
          relationships.length === record.relationships.length
            ? record.consumerAgencies
            : [...new Set(relationships.map((relationship) => relationship.agency))],
        relationships,
      };
    })
    .get("/obligations/:obligationId/affected", async ({ params, principal }) => {
      const record = found(await repository.obligation(params.obligationId));
      requireAccess(canReadDependency(principal, record));
      return {
        obligationId: record.id,
        eventId: record.lastEventId,
        version: record.version,
        affectedDossiers: affectedDossiers(visibleRelationships(principal, record)),
      };
    })
    .get("/obligations/:obligationId/events", async ({ params, query, principal }) => {
      const record = found(await repository.obligation(params.obligationId));
      requireAccess(canReadDependency(principal, record));
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .safeParse(query.afterVersion ?? 0);
      if (!after.success) throw new AccessError(422, "invalid_event_cursor");
      return (await repository.obligationEvents(record.id, after.data)).map((event) =>
        eventProjection(principal, record, event),
      );
    })
    .post(
      "/admin/:agency/obligations/:obligationId/reassessments",
      async ({ params, body, principal, set }) => {
        const selected = parseAgency(params.agency);
        requireAccess(isOfficer(principal, selected));
        const record = found(await repository.obligation(params.obligationId));
        if (record.agency !== selected) throw new AccessError(404, "not_found");
        const parsed = reassessmentBody.safeParse(body);
        if (!parsed.success) throw new AccessError(422, "validation_error");
        const result = await repository.reassessObligation({
          obligationId: record.id,
          ...parsed.data,
          officerId: principal.id,
          recordedAt: new Date().toISOString(),
        });
        set.status = 201;
        return result;
      },
    );
}
