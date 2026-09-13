import { index, integer, pgEnum, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth";
import { id, timestamps } from "./columns";

export const deliveryChannel = pgEnum("delivery_channel", ["in_app", "whatsapp", "sms", "email"]);
export const deliveryStatus = pgEnum("delivery_status", ["queued", "sent", "failed", "simulated"]);

/**
 * One attempt to reach a user outside the app.
 *
 * The inbox row says what happened; this says whether the user was actually told. Keeping
 * it separate means a provider outage is visible and retryable instead of silently losing
 * the one message that needed to arrive, and the unique key makes a repeated event reach
 * the user once.
 */
export const notificationDelivery = pgTable(
  "notification_delivery",
  {
    ...id,
    recipientId: uuid()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    channel: deliveryChannel().notNull(),
    title: text().notNull(),
    body: text().notNull(),
    /** The project the message is about, when it is about one. */
    dossierId: text(),
    /** Chosen by the producer, and the same key the inbox row uses. */
    idempotencyKey: text().notNull(),
    status: deliveryStatus().notNull().default("queued"),
    /** The provider's own id for the message, kept so a delivery can be traced with them. */
    providerMessageId: text(),
    failureReason: text(),
    attempts: integer().notNull().default(0),
    ...timestamps,
  },
  (table) => [
    index("notification_delivery_recipient_idx").on(table.recipientId, table.createdAt),
    // Two callers handling the same event must not both reach the provider.
    uniqueIndex("notification_delivery_idempotency_unique").on(table.idempotencyKey),
  ],
);

export type NotificationDelivery = typeof notificationDelivery.$inferSelect;
export type NewNotificationDelivery = typeof notificationDelivery.$inferInsert;
