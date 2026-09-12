import type { Agency, DependencyScope, DocumentGrant, Principal, ResourceScope } from "./policy";

export interface DossierRecord extends ResourceScope {
  readonly id: string;
  readonly title: string;
  readonly simulated: true;
}

export interface DocumentRecord extends ResourceScope {
  readonly id: string;
  readonly filename: string;
  readonly originalText: string;
}

export interface NodeRecord extends ResourceScope {
  readonly id: string;
  readonly title: string;
}

export interface DependencyRecord extends DependencyScope {
  readonly id: string;
  readonly status: "unknown" | "satisfied" | "unsatisfied";
  readonly observedAt: string;
  readonly simulated: true;
}

export interface AccessRepository {
  dossiers(): readonly DossierRecord[];
  dossier(id: string): DossierRecord | undefined;
  document(id: string): DocumentRecord | undefined;
  node(id: string): NodeRecord | undefined;
  dependency(id: string): DependencyRecord | undefined;
  grants(): readonly DocumentGrant[];
}

export const demoPrincipals: readonly Principal[] = [
  { id: "demo-member-alpha", roles: ["business_member"], companyIds: ["company-alpha"] },
  { id: "demo-member-beta", roles: ["business_member"], companyIds: ["company-beta"] },
  { id: "demo-officer-dgi", roles: ["dgi_officer"], companyIds: [] },
  { id: "demo-officer-rne", roles: ["rne_officer"], companyIds: [] },
  { id: "demo-officer-apii", roles: ["apii_officer"], companyIds: [] },
  { id: "demo-rule-maintainer", roles: ["rule_maintainer"], companyIds: [] },
];

export function createDemoRepository(grants: readonly DocumentGrant[] = []): AccessRepository {
  const dossiers: DossierRecord[] = [];
  const documents: DocumentRecord[] = [];
  const nodes: NodeRecord[] = [];
  const dependencies: DependencyRecord[] = [];
  for (const company of ["alpha", "beta"]) {
    for (const agency of ["DGI", "RNE", "APII"] satisfies Agency[]) {
      const suffix = `${company}-${agency.toLowerCase()}`;
      const scope = { companyId: `company-${company}`, dossierId: `dossier-${suffix}`, agency };
      dossiers.push({ ...scope, id: scope.dossierId, title: "Synthetic dossier", simulated: true });
      documents.push({ ...scope, id: `document-${suffix}`, filename: "synthetic.txt", originalText: "Synthetic confidential document content" });
      nodes.push({ ...scope, id: `node-${suffix}`, title: "Synthetic document review" });
      dependencies.push({ companyId: scope.companyId, agency, id: `dependency-${suffix}`,
        consumerAgencies: company === "alpha" && agency === "DGI" ? ["RNE"] : [],
        status: "unknown", observedAt: "2026-09-12T12:00:00Z", simulated: true });
    }
  }
  return {
    dossiers: () => dossiers,
    dossier: (id) => dossiers.find((d) => d.id === id),
    document: (id) => documents.find((d) => d.id === id),
    node: (id) => nodes.find((n) => n.id === id),
    dependency: (id) => dependencies.find((d) => d.id === id),
    grants: () => grants,
  };
}
