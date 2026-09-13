import { Elysia } from "elysia";
import { z } from "zod";

import { AccessError, canReadDossier, requireAccess } from "../access/policy";
import type { ResolvePrincipal } from "../access/identity";
import type { AgentRepository } from "../dossiers/store";
import type { PrincipalAgentService } from "./service";

const requestBody = z.strictObject({
  message: z.string().trim().min(1).max(20_000),
  sessionId: z.string().trim().min(1).max(200).optional(),
  conversationId: z.string().trim().min(1).max(200).optional(),
  selectedNodeId: z.string().trim().min(1).max(200).optional(),
  confirmedAction: z
    .enum(["submission_requested", "resubmission_requested", "cancellation_requested"])
    .optional(),
});

function found<T>(value: T | undefined): T {
  if (!value) throw new AccessError(404, "not_found");
  return value;
}

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "agent_run_failed";
    return { code, message: error.message };
  }
  return { code: "agent_run_failed", message: String(error) };
}

function sseEvent(event: unknown): Uint8Array {
  const record = event as { id: string; type: string };
  return new TextEncoder().encode(
    `id: ${record.id}\nevent: ${record.type}\ndata: ${JSON.stringify(event)}\n\n`,
  );
}

export function createAgentRoutes(
  repository: AgentRepository,
  resolvePrincipal: ResolvePrincipal,
  service: PrincipalAgentService | undefined,
  enabled = true,
) {
  return new Elysia({ name: "principal-agent" })
    .resolve(async ({ request }) => ({ principal: await resolvePrincipal(request) }))
    .post("/dossiers/:dossierId/agent", async ({ params, body, principal, set }) => {
      if (!enabled || !service) throw new AccessError(503, "agent_not_configured");
      const parsed = requestBody.safeParse(body);
      if (!parsed.success) {
        set.status = 422;
        return { error: { code: "validation_error" } };
      }
      const detail = found(await repository.dossierDetail(params.dossierId));
      requireAccess(canReadDossier(principal, detail.dossier));
      if (
        parsed.data.selectedNodeId &&
        !detail.nodes.some((node) => node.id === parsed.data.selectedNodeId)
      ) {
        throw new AccessError(404, "not_found");
      }
      // conversationId is retained as a compatibility alias for clients that call the
      // persisted SDK session a conversation.
      const session = await service.createSession({
        dossierId: detail.dossier.id,
        principal,
        sessionId: parsed.data.sessionId ?? parsed.data.conversationId,
        selectedNodeId: parsed.data.selectedNodeId,
      });
      let closed = false;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const send = (event: Parameters<typeof sseEvent>[0]) => {
            if (!closed) controller.enqueue(sseEvent(event));
          };
          void service
            .runTurn({
              dossierId: detail.dossier.id,
              principal,
              message: parsed.data.message,
              sessionId: session.id,
              selectedNodeId: parsed.data.selectedNodeId,
              confirmedAction: parsed.data.confirmedAction,
              onEvent: async (event) => send(event),
            })
            .then((result) => {
              if (!closed) {
                send({
                  id: `${session.id}:result`,
                  type: "result",
                  sessionId: result.sessionId,
                  finalOutput: result.finalOutput ?? null,
                  lastResponseId: result.lastResponseId ?? null,
                  interrupted: result.interrupted,
                });
                closed = true;
                controller.close();
              }
            })
            .catch((error) => {
              if (!closed) {
                send({
                  id: `${session.id}:error`,
                  type: "error",
                  sessionId: session.id,
                  error: errorPayload(error),
                });
                closed = true;
                controller.close();
              }
            });
        },
        cancel() {
          closed = true;
          // The direct activity may still finish; the persisted event stream is available
          // through the polling endpoint below after a client disconnects.
        },
      });
      set.headers["x-agent-session-id"] = session.id;
      set.headers["cache-control"] = "no-store";
      set.headers.connection = "keep-alive";
      return new Response(stream, {
        headers: { "content-type": "text/event-stream", "cache-control": "no-store" },
      });
    })
    .get("/dossiers/:dossierId/agent/sessions/:sessionId/events", async ({ params, query, principal }) => {
      const detail = found(await repository.dossierDetail(params.dossierId));
      requireAccess(canReadDossier(principal, detail.dossier));
      const session = await repository.agentSession(params.sessionId, detail.dossier.id, principal.id);
      if (!session) throw new AccessError(404, "not_found");
      const after = z.coerce
        .number()
        .int()
        .nonnegative()
        .safeParse(query.after ?? 0);
      if (!after.success) throw new AccessError(422, "invalid_event_cursor");
      return { sessionId: session.id, events: await repository.agentEvents(session.id, after.data) };
    })
    .get("/agent/artifacts/:artifactId", async ({ params, principal }) => {
      const artifact = found(await repository.artifact(params.artifactId));
      const dossier = found(await repository.dossierDetail(artifact.dossierId));
      requireAccess(canReadDossier(principal, dossier.dossier));
      if (!repository.readArtifact) throw new AccessError(503, "artifact_storage_not_configured");
      const bytes = await repository.readArtifact(artifact.id);
      return new Response(new Uint8Array(bytes), {
        headers: {
          "content-type": artifact.mimeType,
          "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(artifact.filename)}`,
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
          "x-artifact-version": String(artifact.version),
        },
      });
    });
}
