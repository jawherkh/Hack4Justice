import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";
import { RunContext, invokeFunctionTool } from "@openai/agents";

import { createDemoRepository } from "../access/fixtures";
import { attachEvidenceTool, prepareDocumentTool, publishArtifactTool, requestTransitionTool } from "./tools";
import { ProjectDockerSandboxClient } from "../sandbox/client";

const member = { id: "demo-member-alpha", roles: ["business_member"] as const, companyIds: ["company-alpha"] };
const evidenceNodeId = "node-alpha-dgi-document_evidence";
const preparationNodeId = "node-alpha-dgi-document_preparation";

async function invoke(tool: Parameters<typeof invokeFunctionTool>[0]["tool"], context: Record<string, unknown>, input: unknown) {
  return await invokeFunctionTool({ tool, runContext: new RunContext(context), input: JSON.stringify(input) });
}

describe("principal agent tools", () => {
  test("keeps evidence uploads idempotent and preserves replacement invalidation", async () => {
    const repository = createDemoRepository();
    const session = await repository.createAgentSession({ dossierId: "dossier-alpha-dgi", principalId: member.id });
    const context = { repository, principal: member, dossierId: "dossier-alpha-dgi", sessionId: session.id };
    const input = {
      nodeId: evidenceNodeId,
      filename: "agent.txt",
      mimeType: "text/plain",
      content: "agent evidence",
      expectedVersion: 1,
      idempotencyKey: "agent-upload-1",
    };

    const first = await invoke(attachEvidenceTool, context, input) as { document: { id: string }; dossier: { version: number } };
    const retry = await invoke(attachEvidenceTool, context, input) as { document: { id: string }; dossier: { version: number } };
    expect(retry.document.id).toBe(first.document.id);
    expect(retry.dossier.version).toBe(first.dossier.version);
    expect((await repository.dossierDetail("dossier-alpha-dgi"))?.evidence).toHaveLength(2);
  });

  test("refuses unscoped transitions and publishes immutable sandbox drafts", async () => {
    const repository = createDemoRepository();
    const session = await repository.createAgentSession({ dossierId: "dossier-alpha-dgi", principalId: member.id });
    const context = { repository, principal: member, dossierId: "dossier-alpha-dgi", sessionId: session.id };

    const rejected = await invoke(requestTransitionTool, context, {
      type: "review_requested", expectedVersion: 1, idempotencyKey: "review-1",
    });
    expect(rejected).toContain("Node required");

    const baseDir = await mkdtemp(join(tmpdir(), "h4j-agent-tools-"));
    try {
      const sandbox = await new ProjectDockerSandboxClient({
        workspaceBaseDir: baseDir, dossierId: "dossier-alpha-dgi", runId: session.id,
      }).create({ options: { dossierId: "dossier-alpha-dgi", runId: session.id } });
      try {
        const sandboxContext = { ...context, sandbox };
        await invoke(prepareDocumentTool, sandboxContext, {
          nodeId: preparationNodeId,
          templateId: `template-procedure-dgi-v1-${preparationNodeId}`,
          outputPath: "draft/draft.json",
          filename: "draft.json",
          values: [{ key: "legalForm", value: "SARL" }],
        });
        const first = await invoke(publishArtifactTool, sandboxContext, {
          nodeId: preparationNodeId,
          path: "draft/draft.json",
          draftKey: "registration",
          filename: "draft.json",
          mimeType: "application/json",
          sourceDocumentIds: [],
          idempotencyKey: "artifact-1",
        }) as { artifact: { id: string; version: number; immutable: boolean } };
        const retry = await invoke(publishArtifactTool, sandboxContext, {
          nodeId: preparationNodeId,
          path: "draft/draft.json",
          draftKey: "registration",
          filename: "draft.json",
          mimeType: "application/json",
          sourceDocumentIds: [],
          idempotencyKey: "artifact-1",
        }) as { artifact: { id: string; version: number } };
        expect(first.artifact.immutable).toBe(true);
        expect(first.artifact.version).toBe(1);
        expect(retry.artifact.id).toBe(first.artifact.id);
      } finally {
        await sandbox.close();
      }
    } finally {
      await rm(baseDir, { recursive: true, force: true });
    }
  });
});
