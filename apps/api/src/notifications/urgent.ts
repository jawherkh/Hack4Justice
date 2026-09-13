import { isUrgentNotification, type NotificationType as Type } from "@hack4justice/shared";

import { env } from "../env";
import { logger } from "../logger";
import { buildUrgentMessage } from "./messages";
import { Notifier, type Language, type NotificationRecord } from "./notify";
import { deliveryStore, profileDirectory } from "./store";
import { createTwilioTransport } from "./twilio";

const notifier = new Notifier({
  store: deliveryStore,
  recipients: profileDirectory,
  transports: [
    createTwilioTransport({
      accountSid: env.TWILIO_ACCOUNT_SID,
      authToken: env.TWILIO_AUTH_TOKEN,
      whatsappFrom: env.TWILIO_WHATSAPP_FROM,
      smsFrom: env.TWILIO_SMS_FROM,
    }),
  ],
});

export interface UrgentAlertInput {
  userId: string;
  type: Type;
  payload: Record<string, string>;
  /** The same key the inbox row uses, so one event produces one message. */
  idempotencyKey: string;
  projectId?: string | null;
  language?: Language;
}

/**
 * Sends an urgent notification to the user's phone, in addition to the inbox.
 *
 * Only what blocks the procedure is sent. Delivery never throws and never blocks the
 * caller: a provider outage must not undo the refusal or the failed extraction that
 * produced the alert, and the inbox entry already exists either way.
 */
export async function alertIfUrgent(input: UrgentAlertInput): Promise<NotificationRecord | undefined> {
  if (!isUrgentNotification(input.type, input.payload)) return undefined;

  try {
    const recipient = await profileDirectory.find(input.userId);
    // Nothing to send to, or the user has not asked for phone alerts.
    if (!recipient?.acceptsExternalMessages) return undefined;

    const rendered = buildUrgentMessage(input.type, input.payload, input.language ?? recipient.language);

    return await notifier.notify({
      recipientId: input.userId,
      channel: "whatsapp",
      title: rendered.title,
      body: rendered.body,
      ...(input.projectId ? { dossierId: input.projectId } : {}),
      // Distinct from the inbox row's own key, which is unique per user rather than
      // globally, so two users cannot collide on one delivery record.
      idempotencyKey: `whatsapp:${input.userId}:${input.idempotencyKey}`,
    });
  } catch (err) {
    logger.error({ err, userId: input.userId, type: input.type }, "could not send urgent alert");
    return undefined;
  }
}
