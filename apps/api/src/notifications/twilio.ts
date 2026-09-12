import type { DeliveryOutcome, NotificationChannel, Recipient, Transport } from "./notify";

export interface TwilioCredentials {
  accountSid?: string;
  authToken?: string;
  /** WhatsApp sender. A sandbox sender only reaches recipients who joined it. */
  whatsappFrom?: string;
  /** SMS sender. A WhatsApp sandbox number cannot send SMS, so this is separate. */
  smsFrom?: string;
}

const apiBase = "https://api.twilio.com/2010-04-01";

/**
 * Sends SMS and WhatsApp messages through Twilio.
 *
 * When credentials are absent the transport reports a simulated delivery instead of
 * failing, so a demo environment still records and displays the exact message body.
 */
export function createTwilioTransport(
  credentials: TwilioCredentials,
  fetchImpl: typeof fetch = fetch,
): Transport {
  const channels = ["sms", "whatsapp"] as const;

  return {
    channels,
    async send({ recipient, channel, body }): Promise<DeliveryOutcome> {
      const { accountSid, authToken } = credentials;
      const from = channel === "whatsapp" ? credentials.whatsappFrom : credentials.smsFrom;
      if (!accountSid || !authToken || !from) return { status: "simulated", reason: "provider_not_configured" };
      if (!recipient.phone) return { status: "simulated", reason: "recipient_has_no_phone" };

      const address = (value: string) => (channel === "whatsapp" ? `whatsapp:${value}` : value);
      const form = new URLSearchParams({ To: address(recipient.phone), From: address(from), Body: body });

      const response = await fetchImpl(`${apiBase}/Accounts/${accountSid}/Messages.json`, {
        method: "POST",
        headers: {
          authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
          "content-type": "application/x-www-form-urlencoded",
        },
        body: form,
      });

      if (response.ok) {
        const payload = (await response.json()) as { sid?: string };
        if (!payload.sid) return { status: "failed", reason: "provider_response_missing_id" };
        return { status: "sent", providerMessageId: payload.sid };
      }

      const detail = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
      // Trial accounts reject unverified recipients and unjoined sandbox numbers. That is a
      // configuration limit rather than a defect, so the message is recorded as simulated.
      if (isTrialRestriction(response.status, detail.code)) {
        return { status: "simulated", reason: `provider_trial_restriction_${detail.code ?? response.status}` };
      }
      return { status: "failed", reason: `provider_error_${detail.code ?? response.status}` };
    },
  } satisfies Transport & { channels: readonly NotificationChannel[] };
}

const trialRestrictionCodes = new Set([
  21608, // unverified number on a trial account
  21610, // recipient unsubscribed
  63007, // WhatsApp sender not joined to the sandbox
  63016, // message outside the permitted WhatsApp session window
]);

function isTrialRestriction(httpStatus: number, providerCode?: number) {
  if (providerCode !== undefined && trialRestrictionCodes.has(providerCode)) return true;
  return httpStatus === 403;
}

export type { Recipient };
