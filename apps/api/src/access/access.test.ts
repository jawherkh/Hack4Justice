import { describe, expect, test } from "bun:test";
import { Elysia } from "elysia";

import { errorHandler } from "../errors";

import { createDemoRepository, demoPrincipals } from "./fixtures";
import { createDemoIdentity } from "./identity";
import { canReadDocument, type DocumentGrant } from "./policy";
import { createAccessRoutes } from "./routes";

function app(grants: readonly DocumentGrant[] = []) {
  return new Elysia({ prefix: "/api/v1" }).use(errorHandler)
    .use(createAccessRoutes(createDemoRepository(grants), createDemoIdentity(true, "test")));
}

function request(path: string, user?: string, method = "GET", body?: object, headers: Record<string, string> = {}) {
  return new Request(`http://localhost/api/v1${path}`, {
    method,
    headers: { ...(user ? { "x-demo-user": user } : {}), ...headers,
      ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

const member = "demo-member-alpha";
const decision = { action: "accept", reason: "Synthetic review" };

describe("server identities", () => {
  test("requires a recognized identity", async () => {
    for (const user of [undefined, "invented-user"]) {
      expect((await app().handle(request("/me", user))).status).toBe(401);
    }
  });

  test("does not trust forged role or company headers", async () => {
    const response = await app().handle(request("/me", member, "GET", undefined, {
      "x-role": "dgi_officer", "x-company-id": "company-beta",
    }));
    expect(await response.json()).toEqual({ id: member, roles: ["business_member"], companyIds: ["company-alpha"] });
    expect((await app().handle(request("/officer/queue", member, "GET", undefined, { "x-role": "dgi_officer" }))).status).toBe(403);
  });

  test("demo access is opt-in and unavailable in production", async () => {
    expect(() => createDemoIdentity(true, "production")).toThrow();
    expect(() => createDemoIdentity(true, "staging")).toThrow();
    const disabled = new Elysia().use(errorHandler).use(createAccessRoutes(createDemoRepository(), createDemoIdentity(false, "development")));
    const response = await disabled.handle(new Request("http://localhost/me", { headers: { "x-demo-user": member } }));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: "identity_provider_not_configured" } });
  });
});

describe("company and agency isolation", () => {
  for (const agency of ["dgi", "rne", "apii"]) {
    test(`${agency} officer reads only their agency dossiers and queue`, async () => {
      const server = app();
      const user = `demo-officer-${agency}`;
      for (const target of ["dgi", "rne", "apii"]) {
        const response = await server.handle(request(`/dossiers/dossier-alpha-${target}`, user));
        expect(response.status).toBe(target === agency ? 200 : 403);
      }
      const rows = await (await server.handle(request("/officer/queue", user))).json() as { agency: string }[];
      expect(rows).toHaveLength(2);
      expect(rows.every((row: { agency: string }) => row.agency === agency.toUpperCase())).toBe(true);
    });
  }

  for (const path of [
    "/dossiers/dossier-beta-dgi",
    "/documents/document-beta-dgi",
    "/dossiers/dossier-beta-dgi/documents/document-beta-dgi",
    "/dossiers/dossier-beta-dgi/nodes/node-beta-dgi",
    "/dossiers/dossier-beta-dgi/events",
    "/companies/company-beta/dossiers",
    "/dependencies/dependency-beta-dgi",
  ]) {
    test(`rejects direct access across companies: ${path}`, async () => {
      const response = await app().handle(request(path, member));
      expect(response.status).toBe(403);
      expect(await response.text()).not.toContain("Synthetic confidential");
    });
  }

  test("company members can read their own resources", async () => {
    for (const path of ["/companies/company-alpha/dossiers", "/dossiers/dossier-alpha-dgi",
      "/documents/document-alpha-dgi", "/dossiers/dossier-alpha-dgi/nodes/node-alpha-dgi"]) {
      expect((await app().handle(request(path, member))).status).toBe(200);
    }
  });

  test("nested IDs cannot substitute another dossier's node or document", async () => {
    for (const path of ["/dossiers/dossier-alpha-dgi/nodes/node-beta-dgi",
      "/dossiers/dossier-alpha-dgi/documents/document-beta-dgi",
      "/dossiers/dossier-alpha-dgi/nodes/node-alpha-rne"]) {
      expect((await app().handle(request(path, member))).status).toBe(404);
    }
  });

  test("event response is authorized before it starts", async () => {
    const server = app();
    const denied = await server.handle(request("/dossiers/dossier-alpha-dgi/events", "demo-officer-rne"));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("content-type")).not.toContain("text/event-stream");
    const allowed = await server.handle(request("/dossiers/dossier-alpha-dgi/events", member));
    expect(allowed.status).toBe(200);
    expect(allowed.headers.get("content-type")).toBe("text/event-stream");
    expect(await allowed.text()).toContain('"simulated":true');
  });

  test("rule maintainers do not inherit access to private company data", async () => {
    expect((await app().handle(request("/rules/access", "demo-rule-maintainer"))).status).toBe(200);
    for (const path of ["/dossiers/dossier-alpha-dgi", "/documents/document-alpha-dgi", "/officer/queue"]) {
      expect((await app().handle(request(path, "demo-rule-maintainer"))).status).toBe(403);
    }
    expect((await app().handle(request("/rules/access", "demo-officer-dgi"))).status).toBe(403);
  });
});

describe("separate dependency and document permissions", () => {
  test("an explicitly permitted consumer receives only a dependency summary", async () => {
    const server = app();
    const response = await server.handle(request("/dependencies/dependency-alpha-dgi", "demo-officer-rne"));
    expect(response.status).toBe(200);
    expect(Object.keys(await response.json() as Record<string, unknown>).sort()).toEqual(["agency", "companyId", "id", "observedAt", "simulated", "status"]);
    expect((await server.handle(request("/documents/document-alpha-dgi", "demo-officer-rne"))).status).toBe(403);
    expect((await server.handle(request("/dependencies/dependency-alpha-dgi", "demo-officer-apii"))).status).toBe(403);
    expect((await server.handle(request("/dependencies/dependency-beta-dgi", "demo-officer-rne"))).status).toBe(403);
  });

  test("document grants apply only to the named principal, company, document and expiry", async () => {
    const grant = { principalId: "demo-officer-rne", companyId: "company-alpha",
      documentId: "document-alpha-dgi", expiresAt: Date.now() + 60_000 };
    const server = app([grant]);
    expect((await server.handle(request("/documents/document-alpha-dgi", grant.principalId))).status).toBe(200);
    expect((await server.handle(request("/documents/document-beta-dgi", grant.principalId))).status).toBe(403);
    expect((await server.handle(request("/documents/document-alpha-dgi", "demo-officer-apii"))).status).toBe(403);
    expect((await server.handle(request("/dossiers/dossier-alpha-dgi", grant.principalId))).status).toBe(403);
    const principal = demoPrincipals.find((p) => p.id === grant.principalId)!;
    const scope = createDemoRepository().document(grant.documentId)!;
    expect(canReadDocument(principal, scope, scope.id, [grant], grant.expiresAt)).toBe(false);
    expect(canReadDocument(principal, scope, scope.id, [{ ...grant, companyId: "company-beta" }], 0)).toBe(false);
  });
});

describe("mutation boundaries", () => {
  test("only the responsible officer can reach review execution", async () => {
    for (const user of [member, "demo-officer-rne", "demo-officer-apii", "demo-rule-maintainer"]) {
      expect((await app().handle(request("/dossiers/dossier-alpha-dgi/decisions", user, "POST", decision))).status).toBe(403);
    }
    const allowed = await app().handle(request("/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", "POST", decision));
    expect(allowed.status).toBe(501);
    expect(await allowed.json()).toMatchObject({ error: { code: "workflow_not_configured" } });
  });

  test("only the company member can reach document writes", async () => {
    expect((await app().handle(request("/dossiers/dossier-alpha-dgi/documents", member, "POST"))).status).toBe(501);
    for (const user of ["demo-member-beta", "demo-officer-dgi", "demo-rule-maintainer"]) {
      expect((await app().handle(request("/dossiers/dossier-alpha-dgi/documents", user, "POST"))).status).toBe(403);
    }
  });

  test("a claimed reviewer in the body does not grant review authority", async () => {
    const response = await app().handle(request("/dossiers/dossier-alpha-dgi/decisions", member, "POST",
      { ...decision, actor: { role: "dgi_officer" } }));
    expect([403, 422]).toContain(response.status);
  });

  test("no update/delete route exists for review decisions", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      expect((await app().handle(request("/dossiers/dossier-alpha-dgi/decisions", "demo-officer-dgi", method))).status).toBe(404);
    }
  });
});

test("access hooks do not leak into unrelated public endpoints", async () => {
  const server = new Elysia().get("/health", () => ({ ok: true }))
    .use(createAccessRoutes(createDemoRepository(), createDemoIdentity(true, "test")))
    .get("/public", () => ({ ok: true }));
  for (const path of ["/health", "/public"]) {
    expect((await server.handle(new Request(`http://localhost${path}`))).status).toBe(200);
  }
});
