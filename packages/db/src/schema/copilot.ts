import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";
import { project } from "./projects";

export const copilotMessageRole = pgEnum("copilot_message_role", ["user", "assistant"]);
export const copilotMessageStatus = pgEnum("copilot_message_status", ["completed", "failed"]);

/**
 * One chat thread between a user and the project copilot. The Agents SDK
 * session items are kept in `history` so a later turn resumes with the
 * model's own view of the thread; `copilot_message` rows are the display copy.
 */
export const copilotConversation = pgTable(
  "copilot_conversation",
  {
    ...id,
    projectId: uuid()
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Null until the first message, then derived from it unless renamed. */
    title: text(),
    /** Agents SDK session items (`AgentInputItem[]`), opaque to the rest of the app. */
    history: jsonb().$type<unknown[]>().notNull().default([]),
    lastMessageAt: timestamp({ withTimezone: true }),
    ...timestamps,
  },
  (table) => [index("copilot_conversation_project_id_idx").on(table.projectId, table.createdAt)],
);

/** A tool call the assistant made while producing a message, kept for display. */
export interface CopilotToolCall {
  callId: string;
  name: string;
  input?: unknown;
  output?: unknown;
  status: "completed" | "failed";
}

/** Ordered content of an assistant message: text segments interleaved with tool calls. */
export type CopilotMessagePart = { type: "text"; text: string } | ({ type: "tool" } & CopilotToolCall);

export const copilotMessage = pgTable(
  "copilot_message",
  {
    ...id,
    conversationId: uuid()
      .notNull()
      .references(() => copilotConversation.id, { onDelete: "cascade" }),
    role: copilotMessageRole().notNull(),
    /** Markdown for assistant turns, plain text for user turns. */
    content: text().notNull(),
    toolCalls: jsonb().$type<CopilotToolCall[]>().notNull().default([]),
    /** Same information as `content` + `toolCalls`, in the order it was produced. */
    parts: jsonb().$type<CopilotMessagePart[]>().notNull().default([]),
    status: copilotMessageStatus().notNull().default("completed"),
    error: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("copilot_message_conversation_id_idx").on(table.conversationId, table.createdAt)],
);

export type CopilotConversation = typeof copilotConversation.$inferSelect;
export type NewCopilotConversation = typeof copilotConversation.$inferInsert;
export type CopilotMessage = typeof copilotMessage.$inferSelect;
export type NewCopilotMessage = typeof copilotMessage.$inferInsert;
