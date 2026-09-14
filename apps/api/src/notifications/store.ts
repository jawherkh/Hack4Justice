import { notificationDelivery, userProfile } from "@hack4justice/db";
import { and, eq } from "drizzle-orm";

import { db } from "../db";
import type {
  Language,
  NotificationRecord,
  NotificationRequest,
  NotificationStore,
  Recipient,
  RecipientDirectory,
} from "./notify";

type Row = typeof notificationDelivery.$inferSelect;

function toRecord(row: Row): NotificationRecord {
  return {
    id: row.id,
    recipientId: row.recipientId,
    channel: row.channel,
    title: row.title,
    body: row.body,
    ...(row.dossierId ? { dossierId: row.dossierId } : {}),
    idempotencyKey: row.idempotencyKey,
    status: row.status,
    ...(row.providerMessageId ? { providerMessageId: row.providerMessageId } : {}),
    ...(row.failureReason ? { failureReason: row.failureReason } : {}),
    attempts: row.attempts,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * Delivery records in PostgreSQL.
 *
 * The unique key and the conditional attempt update are what stop one event reaching the
 * user twice: whichever caller wins the insert owns the message, and whichever wins the
 * attempt update owns that attempt.
 */
export const deliveryStore: NotificationStore = {
  async findByIdempotencyKey(key: string) {
    const [row] = await db
      .select()
      .from(notificationDelivery)
      .where(eq(notificationDelivery.idempotencyKey, key))
      .limit(1);
    return row ? toRecord(row) : undefined;
  },

  async insertQueued(request: NotificationRequest) {
    // Rejects on the unique key, which is how a second caller learns it lost the race.
    const [row] = await db
      .insert(notificationDelivery)
      .values({
        recipientId: request.recipientId,
        channel: request.channel,
        title: request.title,
        body: request.body,
        dossierId: request.dossierId ?? null,
        idempotencyKey: request.idempotencyKey,
        status: "queued",
        attempts: 0,
      })
      .returning();
    return toRecord(row!);
  },

  async claimAttempt(id: string, expectedAttempts: number) {
    const [row] = await db
      .update(notificationDelivery)
      .set({ attempts: expectedAttempts + 1, updatedAt: new Date() })
      // Applies only while the record still shows the attempt count the caller read, so
      // two callers retrying the same message cannot both reach the provider.
      .where(and(eq(notificationDelivery.id, id), eq(notificationDelivery.attempts, expectedAttempts)))
      .returning();
    return row ? toRecord(row) : undefined;
  },

  async markResult(id, result) {
    const [row] = await db
      .update(notificationDelivery)
      .set({
        status: result.status,
        providerMessageId: result.providerMessageId ?? null,
        failureReason: result.failureReason ?? null,
        updatedAt: new Date(),
      })
      .where(eq(notificationDelivery.id, id))
      .returning();
    return toRecord(row!);
  },
};

/** The message language, from the locale the user chose for the interface. */
function languageFor(locale: string): Language {
  return locale === "ar" ? "ar-TN" : "fr";
}

/**
 * Recipient facts from the user's own profile.
 *
 * A phone number alone is not permission to use it, so the profile's own switch decides
 * whether anything leaves the platform.
 */
export const profileDirectory: RecipientDirectory = {
  async find(recipientId: string): Promise<Recipient | undefined> {
    const [row] = await db
      .select({
        phone: userProfile.phone,
        locale: userProfile.preferredLocale,
        urgentAlerts: userProfile.urgentAlerts,
      })
      .from(userProfile)
      .where(eq(userProfile.userId, recipientId))
      .limit(1);
    if (!row) return undefined;
    return {
      id: recipientId,
      language: languageFor(row.locale),
      ...(row.phone ? { phone: row.phone } : {}),
      acceptsExternalMessages: row.urgentAlerts && Boolean(row.phone),
    };
  },
};
