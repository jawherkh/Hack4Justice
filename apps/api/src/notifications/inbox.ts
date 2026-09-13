import { notification, type NewNotification } from "@hack4justice/db";
import { NOTIFICATION_DOMAIN_BY_TYPE, type NotificationType } from "@hack4justice/shared";

import { db } from "../db";
import { logger } from "../logger";

export interface NotifyInput {
  userId: string;
  type: NotificationType;
  /**
   * Producer-chosen key, unique per user, e.g. `project:<id>:created`.
   * Emitting the same key again is a no-op, so handlers can be retried safely.
   */
  idempotencyKey: string;
  payload?: Record<string, string>;
  projectId?: string | null;
}

/**
 * Adds an in-app notification. Never throws: a failed notification must not
 * fail the action it describes. Returns true when a new row was inserted.
 */
export async function notify({
  userId,
  type,
  idempotencyKey,
  payload = {},
  projectId = null,
}: NotifyInput): Promise<boolean> {
  const values: NewNotification = {
    userId,
    idempotencyKey,
    domain: NOTIFICATION_DOMAIN_BY_TYPE[type],
    type,
    payload,
    projectId,
  };
  try {
    const rows = await db
      .insert(notification)
      .values(values)
      .onConflictDoNothing({ target: [notification.userId, notification.idempotencyKey] })
      .returning({ id: notification.id });
    return rows.length > 0;
  } catch (err) {
    logger.error({ err, userId, type, idempotencyKey }, "could not store notification");
    return false;
  }
}
