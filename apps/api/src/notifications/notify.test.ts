import { describe, expect, test } from "bun:test";
import { randomUUID } from "node:crypto";

import {
  Notifier,
  renderTemplate,
  type NotificationRecord,
  type NotificationRequest,
  type NotificationStore,
  type Recipient,
  type RecipientDirectory,
  type Transport,
} from "./notify";
import { createTwilioTransport } from "./twilio";

class MemoryStore implements NotificationStore {
  readonly records: NotificationRecord[] = [];

  async findByIdempotencyKey(key: string) {
    return this.records.find((record) => record.idempotencyKey === key);
  }

  async insertQueued(request: NotificationRequest) {
    const now = new Date().toISOString();
    const record: NotificationRecord = {
      id: randomUUID(),
      recipientId: request.recipientId,
      channel: request.channel,
      title: request.title,
      body: request.body,
      dossierId: request.dossierId,
      idempotencyKey: request.idempotencyKey,
      status: "queued",
      attempts: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return record;
  }

  async markResult(id: string, result: { status: NotificationRecord["status"]; providerMessageId?: string; failureReason?: string }) {
    const record = this.records.find((candidate) => candidate.id === id);
    if (!record) throw new Error("unknown notification");
    record.status = result.status;
    record.providerMessageId = result.providerMessageId;
    record.failureReason = result.failureReason;
    record.attempts += 1;
    record.updatedAt = new Date().toISOString();
    return record;
  }
}

const owner: Recipient = { id: "owner", language: "fr", phone: "+21620000000", acceptsExternalMessages: true };
const optedOut: Recipient = { ...owner, id: "quiet", acceptsExternalMessages: false };
const arabicOwner: Recipient = { ...owner, id: "arabic", language: "ar-TN" };

const directory: RecipientDirectory = {
  async find(id) {
    return [owner, optedOut, arabicOwner].find((recipient) => recipient.id === id);
  },
};

const message = (overrides: Partial<NotificationRequest> = {}): NotificationRequest => ({
  recipientId: owner.id,
  channel: "whatsapp",
  title: "Dossier accepte",
  body: "Votre dossier a ete accepte.",
  idempotencyKey: randomUUID(),
  ...overrides,
});

const acceptingTransport = (sid = "SM123"): Transport => ({
  channels: ["sms", "whatsapp"],
  async send() {
    return { status: "sent", providerMessageId: sid };
  },
});

describe("outbound notification delivery", () => {
  test("records the message before delivery and stores the provider id on success", async () => {
    const store = new MemoryStore();
    const notifier = new Notifier({ store, recipients: directory, transports: [acceptingTransport("SMabc")] });

    const record = await notifier.notify(message());

    expect(store.records).toHaveLength(1);
    expect(record.status).toBe("sent");
    expect(record.providerMessageId).toBe("SMabc");
    expect(record.body).toBe("Votre dossier a ete accepte.");
  });

  test("an unconfigured channel is simulated with the body kept for display", async () => {
    const store = new MemoryStore();
    const notifier = new Notifier({ store, recipients: directory });

    const record = await notifier.notify(message({ body: "Message de secours" }));

    expect(record.status).toBe("simulated");
    expect(record.failureReason).toBe("channel_not_configured");
    expect(record.body).toBe("Message de secours");
  });

  test("a provider failure is recorded without throwing to the caller", async () => {
    const store = new MemoryStore();
    const failing: Transport = {
      channels: ["whatsapp"],
      async send() {
        throw new Error("connection_reset");
      },
    };
    const notifier = new Notifier({ store, recipients: directory, transports: [failing] });

    const record = await notifier.notify(message());

    expect(record.status).toBe("failed");
    expect(record.failureReason).toBe("connection_reset");
  });

  test("an opted-out recipient is skipped externally but still receives in-app messages", async () => {
    const store = new MemoryStore();
    const notifier = new Notifier({ store, recipients: directory, transports: [acceptingTransport()] });

    const external = await notifier.notify(message({ recipientId: optedOut.id }));
    expect(external.status).toBe("simulated");
    expect(external.failureReason).toBe("recipient_opted_out");

    const inApp = await notifier.notify(message({ recipientId: optedOut.id, channel: "in_app" }));
    expect(inApp.status).toBe("sent");
  });

  test("an unknown recipient fails instead of contacting the provider", async () => {
    const store = new MemoryStore();
    let calls = 0;
    const counting: Transport = {
      channels: ["whatsapp"],
      async send() {
        calls += 1;
        return { status: "sent", providerMessageId: "SM0" };
      },
    };
    const notifier = new Notifier({ store, recipients: directory, transports: [counting] });

    const record = await notifier.notify(message({ recipientId: "missing" }));

    expect(record.status).toBe("failed");
    expect(record.failureReason).toBe("unknown_recipient");
    expect(calls).toBe(0);
  });

  test("repeating one idempotency key does not send the recipient a second message", async () => {
    const store = new MemoryStore();
    let calls = 0;
    const counting: Transport = {
      channels: ["whatsapp"],
      async send() {
        calls += 1;
        return { status: "sent", providerMessageId: `SM${calls}` };
      },
    };
    const notifier = new Notifier({ store, recipients: directory, transports: [counting] });
    const request = message();

    const first = await notifier.notify(request);
    const second = await notifier.notify(request);

    expect(calls).toBe(1);
    expect(store.records).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.providerMessageId).toBe("SM1");
  });

  test("templates name the dossier and next action in the recipient's language", () => {
    const input = { dossierReference: "DGI-2026-114", subject: "accepte", nextAction: "telecharger l'attestation" };

    const french = renderTemplate("fr", "decision", input);
    expect(french.body).toContain("DGI-2026-114");
    expect(french.body).toContain("telecharger l'attestation");

    const arabic = renderTemplate("ar-TN", "decision", input);
    expect(arabic.body).toContain("DGI-2026-114");
    expect(arabic.body).toContain("الخطوة الموالية");
    expect(arabic.body).not.toBe(french.body);
  });
});

describe("provider transport", () => {
  const offline = async () => {
    throw new Error("the provider must not be contacted in tests");
  };

  test("missing credentials simulate instead of calling the provider", async () => {
    const transport = createTwilioTransport({}, offline as unknown as typeof fetch);

    const outcome = await transport.send({ recipient: owner, channel: "whatsapp", title: "t", body: "b" });

    expect(outcome).toEqual({ status: "simulated", reason: "provider_not_configured" });
  });

  test("a trial restriction is simulated rather than treated as a defect", async () => {
    const transport = createTwilioTransport(
      { accountSid: "AC1", authToken: "token", from: "+15550000000" },
      (async () =>
        new Response(JSON.stringify({ code: 21608, message: "unverified" }), { status: 400 })) as unknown as typeof fetch,
    );

    const outcome = await transport.send({ recipient: owner, channel: "whatsapp", title: "t", body: "b" });

    expect(outcome).toEqual({ status: "simulated", reason: "provider_trial_restriction_21608" });
  });

  test("a genuine provider error is reported as a failure", async () => {
    const transport = createTwilioTransport(
      { accountSid: "AC1", authToken: "token", from: "+15550000000" },
      (async () =>
        new Response(JSON.stringify({ code: 30001, message: "queue overflow" }), { status: 500 })) as unknown as typeof fetch,
    );

    const outcome = await transport.send({ recipient: owner, channel: "sms", title: "t", body: "b" });

    expect(outcome).toEqual({ status: "failed", reason: "provider_error_30001" });
  });

  test("a successful send returns the provider message id and addresses WhatsApp correctly", async () => {
    let sentTo = "";
    const transport = createTwilioTransport(
      { accountSid: "AC1", authToken: "token", from: "+15550000000" },
      (async (_url: string, init: RequestInit) => {
        sentTo = String((init.body as URLSearchParams).get("To"));
        return new Response(JSON.stringify({ sid: "SM999" }), { status: 200 });
      }) as unknown as typeof fetch,
    );

    const outcome = await transport.send({ recipient: owner, channel: "whatsapp", title: "t", body: "b" });

    expect(outcome).toEqual({ status: "sent", providerMessageId: "SM999" });
    expect(sentTo).toBe("whatsapp:+21620000000");
  });
});
