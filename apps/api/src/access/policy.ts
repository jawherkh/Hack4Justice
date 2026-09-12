export type Agency = "DGI" | "RNE" | "APII";
export type Role = "business_member" | "dgi_officer" | "rne_officer" | "apii_officer" | "rule_maintainer";

export interface Principal {
  readonly id: string;
  readonly roles: readonly Role[];
  readonly companyIds: readonly string[];
}

export interface ResourceScope {
  readonly companyId: string;
  readonly agency: Agency;
  readonly dossierId: string;
}

export interface DocumentGrant {
  readonly principalId: string;
  readonly companyId: string;
  readonly documentId: string;
  readonly expiresAt: number;
}

export interface DependencyScope {
  readonly companyId: string;
  readonly agency: Agency;
  readonly consumerAgencies: readonly Agency[];
}

export class AccessError extends Error {
  constructor(public readonly status: 401 | 403 | 404 | 409 | 422 | 503, public readonly code: string) {
    super(code);
  }
}

const officerRoles: Record<Agency, Role> = {
  DGI: "dgi_officer", RNE: "rne_officer", APII: "apii_officer",
};

export const isMember = (principal: Principal, companyId: string): boolean =>
  principal.roles.includes("business_member") && principal.companyIds.includes(companyId);

export const isOfficer = (principal: Principal, agency: Agency): boolean =>
  principal.roles.includes(officerRoles[agency]);

export const canReadDossier = (principal: Principal, scope: ResourceScope): boolean =>
  isMember(principal, scope.companyId) || isOfficer(principal, scope.agency);

export const canEditEvidence = (principal: Principal, scope: ResourceScope): boolean =>
  isMember(principal, scope.companyId);

export const canReview = (principal: Principal, scope: ResourceScope): boolean =>
  isOfficer(principal, scope.agency);

export const canMaintainRules = (principal: Principal): boolean =>
  principal.roles.includes("rule_maintainer");

export function canReadDocument(
  principal: Principal, scope: ResourceScope, documentId: string,
  grants: readonly DocumentGrant[], now: number,
): boolean {
  return canReadDossier(principal, scope) || grants.some((grant) =>
    grant.principalId === principal.id && grant.companyId === scope.companyId &&
    grant.documentId === documentId && Number.isFinite(grant.expiresAt) && grant.expiresAt > now,
  );
}

export function canReadDependency(principal: Principal, scope: DependencyScope): boolean {
  return isMember(principal, scope.companyId) || isOfficer(principal, scope.agency) ||
    scope.consumerAgencies.some((agency) => isOfficer(principal, agency));
}

export function requireAccess(allowed: boolean): void {
  if (!allowed) throw new AccessError(403, "forbidden");
}
