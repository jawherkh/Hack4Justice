import { createDemoDossierRepository } from "../dossiers/store";
import type { DocumentGrant, Principal } from "./policy";

export type {
  AccessRepository,
  DependencyRecord,
  DossierDetail,
  DossierRecord,
  DocumentRecord,
  FindingRecord,
  NodeRecord,
  ProcedureVersionRecord,
  RequirementRecord,
  SourceRecord,
} from "../dossiers/store";

export const demoPrincipals: readonly Principal[] = [
  { id: "demo-member-alpha", roles: ["business_member"], companyIds: ["company-alpha"] },
  { id: "demo-member-beta", roles: ["business_member"], companyIds: ["company-beta"] },
  { id: "demo-officer-dgi", roles: ["dgi_officer"], companyIds: [] },
  { id: "demo-officer-rne", roles: ["rne_officer"], companyIds: [] },
  { id: "demo-officer-apii", roles: ["apii_officer"], companyIds: [] },
  { id: "demo-rule-maintainer", roles: ["rule_maintainer"], companyIds: [] },
];

export function createDemoRepository(grants: readonly DocumentGrant[] = []) {
  return createDemoDossierRepository(grants);
}
