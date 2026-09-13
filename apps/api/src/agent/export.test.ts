import { Elysia } from "elysia";
import { describe, expect, test, vi } from "vitest";

import { createDemoRepository } from "../access/fixtures";
import { createDemoIdentity } from "../access/identity";
import { errorHandler } from "../errors";
import { createAgentRoutes } from "./routes";

const member = "demo-member-alpha";
const dossierId = "dossier-alpha-dgi";

function request(path: string, user = member) {
  return new Request(`http://localhost/api/v1${path}`, { headers: { "x-demo-user": user } });
}

function fixture() {
  const repository = createDemoRepository();
  const session = repository.createAgentSession({ dossierId, principalId: member });
  const complete = (runId: string, finalOutput: string, interrupted = false) => {
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_started",
      data: { runId },
    });
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_completed",
      data: { runId, finalOutput, interrupted },
    });
  };
  const server = new Elysia({ prefix: "/api/v1" }).use(errorHandler).use(createAgentRoutes(repository, createDemoIdentity(true, "test"), undefined, false));
  const exportPath = (runId: string, format: string) => `/dossiers/${dossierId}/agent/sessions/${session.id}/runs/${runId}/export?format=${format}`;
  return { repository, session, complete, server, exportPath };
}

describe("agent response exports", () => {
  test("downloads the requested completed run as its original Markdown", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-first", "# First\n\n- one");
    complete("run-second", "# Second");

    const response = await server.handle(request(exportPath("run-first", "markdown")));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("text/markdown; charset=utf-8");
    expect(response.headers.get("content-disposition")).toContain("agent-response-run-first.md");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await response.text()).toBe("# First\n\n- one");
  });

  test("renders a valid PDF without resolving markup resources", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-pdf", "# Report\n\nPièces vérifiées. المستندات جاهزة.\n\n![remote](https://example.invalid/file.png)\n\n<script>alert(1)</script>");
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    try {
      const response = await server.handle(request(exportPath("run-pdf", "pdf")));
      const bytes = new Uint8Array(await response.arrayBuffer());

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("application/pdf");
      expect(response.headers.get("content-disposition")).toContain("agent-response-run-pdf.pdf");
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      expect(bytes.byteLength).toBeGreaterThan(500);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  test("does not expose a session response to another dossier reader", async () => {
    const { complete, server, exportPath } = fixture();
    complete("run-private", "private answer");

    const response = await server.handle(request(exportPath("run-private", "markdown"), "demo-officer-dgi"));

    expect(response.status).toBe(404);
    expect(await response.text()).not.toContain("private answer");
  });

  test("rejects unsupported formats and runs without a usable completed response", async () => {
    const { repository, session, complete, server, exportPath } = fixture();
    repository.appendAgentEvent({
      sessionId: session.id,
      dossierId,
      actorId: member,
      type: "run_started",
      data: { runId: "run-active" },
    });
    complete("run-interrupted", "partial", true);
    complete("run-empty", "   ");

    expect((await server.handle(request(exportPath("run-active", "markdown")))).status).toBe(409);
    expect((await server.handle(request(exportPath("run-interrupted", "pdf")))).status).toBe(409);
    expect((await server.handle(request(exportPath("run-empty", "markdown")))).status).toBe(409);
    expect((await server.handle(request(exportPath("missing", "markdown")))).status).toBe(404);
    expect((await server.handle(request(exportPath("run-active", "docx")))).status).toBe(422);
  });
});
