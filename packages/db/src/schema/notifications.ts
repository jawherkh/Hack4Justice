import { NOTIFICATION_DOMAINS, NOTIFICATION_TYPES } from "@hack4justice/shared";
import { index, jsonb, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id } from "./columns";

export const notificationDomain = pgEnum("notification_domain", NOTIFICATION_DOMAINS);
export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);

/**
 * In-app inbox entry. Text is rendered client-side from `type` + `payload` so it
 * follows the user's locale. `idempotencyKey` is chosen by the producer so the
 * same event can be emitted twice without creating two notifications.
 */
export const notification = pgTable(
  "notification",
  {
    ...id,
    userId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    idempotencyKey: text().notNull(),
    domain: notificationDomain().notNull(),
    type: notificationType().notNull(),
    payload: jsonb().$type<Record<string, string>>().notNull().default({}),
    /** Where the notification links to, when it is about a project. */
    projectId: uuid(),
    readAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notification_user_id_created_at_idx").on(table.userId, table.createdAt),
    uniqueIndex("notification_idempotency_unique").on(table.userId, table.idempotencyKey),
  ],
);

export type Notification = typeof notification.$inferSelect;
export type NewNotification = typeof notification.$inferInsert;
