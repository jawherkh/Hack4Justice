import {
  copilotConversation,
  copilotMessage,
  project,
  projectRequirement,
  upload,
  type CopilotConversation,
  type CopilotMessage,
  type Project,
} from "@hack4justice/db";
import { AppError } from "@hack4justice/shared";
import { and, asc, desc, eq, inArray, or } from "drizzle-orm";
import { Elysia, t } from "elysia";

import { authGuard } from "../../auth";
import { db } from "../../db";
import { i18n } from "../../i18n/plugin";
import { logger } from "../../logger";
import {
  CopilotBusyError,
  documentSandboxPath,
  type CopilotProjectContext,
  type CopilotStreamEvent,
  type ProjectCopilotService,
} from "../../copilot/service";
import { SandboxLimitError, SandboxPathError } from "../../sandbox/workspace";

const idParam = t.Object({ id: t.String({ format: "uuid" }) });
const conversationParams = t.Object({
  id: t.String({ format: "uuid" }),
  conversationId: t.String({ format: "uuid" }),
});
const titleSchema = t.String({ minLength: 1, maxLength: 120 });
const workspacePathSchema = t.String({ minLength: 1, maxLength: 512 });
const MAX_WORKSPACE_FILE_BYTES = 10 * 1024 * 1024;
const MAX_TITLE_CHARS = 80;
const MAX_CONVERSATIONS = 100;

type ConversationView = Omit<CopilotConversation, "history" | "userId">;

function toConversationView({
  history: _history,
  userId: _userId,
  ...view
}: CopilotConversation): ConversationView {
  return view;
}

function toMessageView(row: CopilotMessage) {
  return row;
}

/** Elysia's server-sent event line format, one JSON object per event. */
function sse(event: Record<string, unknown> & { type: string }): Uint8Array {
  return new TextEncoder().encode(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

function errorPayload(error: unknown): { code: string; message: string } {
  if (error instanceof AppError) return { code: error.code, message: error.message };
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : "copilot_run_failed";
    return { code, message: error.message };
  }
  return { code: "copilot_run_failed", message: String(error) };
}

const CONTENT_TYPES: Record<string, string> = {
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  json: "application/json; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  html: "text/plain; charset=utf-8",
  htm: "text/plain; charset=utf-8",
  xml: "text/plain; charset=utf-8",
  yaml: "text/plain; charset=utf-8",
  yml: "text/plain; charset=utf-8",
  log: "text/plain; charset=utf-8",
  sh: "text/plain; charset=utf-8",
  py: "text/plain; charset=utf-8",
  js: "text/plain; charset=utf-8",
  ts: "text/plain; charset=utf-8",
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "text/plain; charset=utf-8",
};

/** Content type by extension; HTML-like types are served as plain text so nothing the model wrote runs. */
function contentTypeFor(path: string): string {
  const extension = path.slice(path.lastIndexOf(".") + 1).toLowerCase();
  return (path.includes(".") && CONTENT_TYPES[extension]) || "application/octet-stream";
}

/** First line of the first message, trimmed, so a thread has a name before the model answers. */
function deriveTitle(message: string): string {
  const line =
    message
      .split(/\r?\n/)
      .find((part) => part.trim())
      ?.trim() ?? "";
  return line.length > MAX_TITLE_CHARS
    ? `${line.slice(0, MAX_TITLE_CHARS - 1)}…`
    : line || "New conversation";
}

export function createCopilotModule(service: ProjectCopilotService | undefined) {
  return new Elysia({ prefix: "/projects/:id/copilot", tags: ["copilot"] })
    .use(i18n)
    .use(authGuard)

    .get(
      "/",
      async ({ params, user }) => {
        const row = await findOwned(params.id, user.id);
        const rows = await db
          .select()
          .from(copilotConversation)
          .where(eq(copilotConversation.projectId, row.id))
          .orderBy(desc(copilotConversation.lastMessageAt), desc(copilotConversation.createdAt))
          .limit(MAX_CONVERSATIONS);
        return { enabled: Boolean(service), conversations: rows.map(toConversationView) };
      },
      {
        auth: true,
        params: idParam,
        detail: { summary: "Copilot conversations of a project, most recent first" },
      },
    )

    .post(
      "/",
      async ({ params, body, user, set }) => {
        const row = await findOwned(params.id, user.id);
        const [created] = await db
          .insert(copilotConversation)
          .values({ projectId: row.id, userId: user.id, title: body.title?.trim() || null })
          .returning();
        if (!created) throw new AppError({ status: 500, code: "internal_error" });
        set.status = 201;
        return toConversationView(created);
      },
      {
        auth: true,
        params: idParam,
        body: t.Object({ title: t.Optional(titleSchema) }),
        detail: { summary: "Start a new copilot conversation" },
      },
    )

    .get(
      "/:conversationId",
      async ({ params, user }) => {
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        const messages = await db
          .select()
          .from(copilotMessage)
          .where(eq(copilotMessage.conversationId, conversation.id))
          .orderBy(asc(copilotMessage.createdAt));
        return {
          conversation: toConversationView(conversation),
          messages: messages.map(toMessageView),
          running: service?.isRunning(conversation.id) ?? false,
        };
      },
      { auth: true, params: conversationParams, detail: { summary: "A conversation with its messages" } },
    )

    .patch(
      "/:conversationId",
      async ({ params, body, user }) => {
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        const [updated] = await db
          .update(copilotConversation)
          .set({ title: body.title.trim() })
          .where(eq(copilotConversation.id, conversation.id))
          .returning();
        return toConversationView(updated!);
      },
      {
        auth: true,
        params: conversationParams,
        body: t.Object({ title: titleSchema }),
        detail: { summary: "Rename a conversation" },
      },
    )

    .delete(
      "/:conversationId",
      async ({ params, user, set }) => {
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        if (service?.isRunning(conversation.id)) throw new AppError({ status: 409, code: "copilot_busy" });
        await db.delete(copilotConversation).where(eq(copilotConversation.id, conversation.id));
        set.status = 204;
      },
      {
        auth: true,
        params: conversationParams,
        detail: { summary: "Delete a conversation and its messages" },
      },
    )

    .get(
      "/:conversationId/files",
      async ({ params, user }) => {
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        const context = await loadContext(row);
        const documents = context.uploads.map((u) => ({
          id: u.id,
          filename: u.filename,
          status: u.status,
          pageCount: u.pageCount,
          size: u.size,
          link: documentSandboxPath(u.id),
          attachedToRequirements: context.requirements
            .filter((r) => r.uploadId === u.id)
            .map((r) => r.requirementId),
        }));
        const files = service ? await service.listWorkspaceFiles(row.id, conversation.id) : [];
        // Spelled out so the client's inferred type does not reach into the service module.
        const workspace = files.map((file) => ({ path: file.path, name: file.name }));
        return { documents, workspace };
      },
      {
        auth: true,
        params: conversationParams,
        detail: { summary: "Files the copilot can reference: project documents and workspace output" },
      },
    )

    .get(
      "/:conversationId/files/content",
      async ({ params, query, user, set }) => {
        if (!service) throw new AppError({ status: 503, code: "copilot_not_configured" });
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        let bytes: Uint8Array;
        try {
          bytes = await service.readWorkspaceFile(row.id, conversation.id, query.path);
        } catch (error) {
          if (error instanceof SandboxPathError) throw new AppError({ status: 404, code: "file_not_found" });
          if (error instanceof SandboxLimitError) throw new AppError({ status: 413, code: "file_too_large" });
          throw error;
        }
        if (bytes.byteLength > MAX_WORKSPACE_FILE_BYTES)
          throw new AppError({ status: 413, code: "file_too_large" });
        set.headers["cache-control"] = "no-store";
        // A fresh copy is typed over ArrayBuffer, which is what Response accepts.
        return new Response(bytes.slice(), {
          headers: {
            "content-type": contentTypeFor(query.path),
            "content-length": String(bytes.byteLength),
            "content-disposition": "inline",
            "x-content-type-options": "nosniff",
            "cache-control": "no-store",
          },
        });
      },
      {
        auth: true,
        params: conversationParams,
        query: t.Object({ path: workspacePathSchema }),
        detail: { summary: "Raw content of a file in the conversation's sandbox workspace" },
      },
    )

    .post(
      "/:conversationId/messages",
      async ({ params, body, user, locale, request, set }) => {
        if (!service) throw new AppError({ status: 503, code: "copilot_not_configured" });
        const row = await findOwned(params.id, user.id);
        const conversation = await findConversation(params.conversationId, row.id);
        if (service.isRunning(conversation.id)) throw new AppError({ status: 409, code: "copilot_busy" });

        const message = body.message.trim();
        const context = await loadContext(row);
        const title = conversation.title ?? deriveTitle(message);
        const now = new Date();
        const [userMessage] = await db.transaction(async (tx) => {
          const inserted = await tx
            .insert(copilotMessage)
            .values({ conversationId: conversation.id, role: "user", content: message })
            .returning();
          await tx
            .update(copilotConversation)
            .set({ title, lastMessageAt: now })
            .where(eq(copilotConversation.id, conversation.id));
          return inserted;
        });

        const abort = new AbortController();
        let closed = false;
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            const send = (event: Record<string, unknown> & { type: string }) => {
              if (closed) return;
              try {
                controller.enqueue(sse(event));
              } catch {
                closed = true;
              }
            };
            const finish = () => {
              if (closed) return;
              closed = true;
              try {
                controller.close();
              } catch {
                // already closed by the client
              }
            };
            send({
              type: "user_message",
              message: userMessage,
              conversation: { id: conversation.id, title },
            });
            void service
              .runTurn({
                conversationId: conversation.id,
                context,
                history: conversation.history,
                message,
                locale,
                signal: abort.signal,
                onEvent: (event: CopilotStreamEvent) => send(event),
              })
              .then(async (result) => {
                const [assistant] = await db.transaction(async (tx) => {
                  const inserted = await tx
                    .insert(copilotMessage)
                    .values({
                      conversationId: conversation.id,
                      role: "assistant",
                      content: result.text,
                      toolCalls: result.toolCalls,
                      parts: result.parts,
                      status: "completed",
                    })
                    .returning();
                  await tx
                    .update(copilotConversation)
                    .set({ history: result.history, lastMessageAt: new Date() })
                    .where(eq(copilotConversation.id, conversation.id));
                  return inserted;
                });
                send({ type: "result", message: assistant, aborted: result.aborted, runId: result.runId });
                finish();
              })
              .catch(async (error: unknown) => {
                const payload = errorPayload(error);
                logger.error({ err: error, conversationId: conversation.id }, "copilot turn failed");
                const [assistant] = await db
                  .insert(copilotMessage)
                  .values({
                    conversationId: conversation.id,
                    role: "assistant",
                    content: "",
                    status: "failed",
                    error: payload.message,
                  })
                  .returning()
                  .catch(() => [undefined]);
                send({ type: "error", error: payload, message: assistant ?? null });
                finish();
              });
          },
          cancel() {
            closed = true;
            abort.abort();
          },
        });
        request.signal.addEventListener("abort", () => abort.abort(), { once: true });
        set.headers["cache-control"] = "no-store";
        return new Response(stream, {
          headers: {
            "content-type": "text/event-stream",
            "cache-control": "no-store",
            connection: "keep-alive",
            "x-copilot-conversation-id": conversation.id,
          },
        });
      },
      {
        auth: true,
        params: conversationParams,
        body: t.Object({ message: t.String({ minLength: 1, maxLength: 20_000 }) }),
        detail: {
          summary: "Send a message and stream the copilot's reply as server-sent events",
          description:
            "Events: user_message, text_delta, tool_started, tool_completed, result, error. The reply is stored when the stream ends.",
        },
      },
    );
}

async function findOwned(id: string, userId: string): Promise<Project> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, id), eq(project.userId, userId)))
    .limit(1);
  if (!row) throw new AppError({ status: 404, code: "project_not_found" });
  return row;
}

async function findConversation(id: string, projectId: string): Promise<CopilotConversation> {
  const [row] = await db
    .select()
    .from(copilotConversation)
    .where(and(eq(copilotConversation.id, id), eq(copilotConversation.projectId, projectId)))
    .limit(1);
  if (!row) throw new AppError({ status: 404, code: "conversation_not_found" });
  return row;
}

/**
 * Project snapshot handed to the copilot: the requirement checklist and every uploaded
 * file with its extracted (OCR) text, whether filed under the project or attached to
 * one of its requirements.
 */
async function loadContext(row: Project): Promise<CopilotProjectContext> {
  const requirements = await db
    .select()
    .from(projectRequirement)
    .where(eq(projectRequirement.projectId, row.id));
  const attachedIds = requirements.flatMap((r) => (r.uploadId ? [r.uploadId] : []));
  const uploads = await db
    .select({
      id: upload.id,
      filename: upload.filename,
      status: upload.status,
      pageCount: upload.pageCount,
      size: upload.size,
      text: upload.text,
      error: upload.error,
      extractedAt: upload.extractedAt,
      createdAt: upload.createdAt,
    })
    .from(upload)
    .where(
      and(
        eq(upload.userId, row.userId),
        attachedIds.length > 0
          ? or(eq(upload.projectId, row.id), inArray(upload.id, attachedIds))
          : eq(upload.projectId, row.id),
      ),
    )
    .orderBy(desc(upload.createdAt));
  return { project: row, requirements, uploads };
}

export { CopilotBusyError };
