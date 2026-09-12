import { z } from "zod";

export const notificationChannels = ["in_app", "whatsapp", "sms", "email"] as const;
export const notificationStatuses = ["queued", "sent", "failed", "simulated"] as const;

export type NotificationChannel = (typeof notificationChannels)[number];
export type NotificationStatus = (typeof notificationStatuses)[number];
export type Language = "ar-TN" | "fr";

export const notificationRequest = z.object({
  recipientId: z.string().min(1),
  channel: z.enum(notificationChannels),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
  dossierId: z.string().min(1).optional(),
  idempotencyKey: z.string().min(1).max(200),
});

export type NotificationRequest = z.infer<typeof notificationRequest>;

export interface NotificationRecord {
  id: string;
  recipientId: string;
  channel: NotificationChannel;
  title: string;
  body: string;
  dossierId?: string;
  idempotencyKey: string;
  status: NotificationStatus;
  providerMessageId?: string;
  failureReason?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
}

/** Persistence port. Any store that satisfies this can back the adapter. */
export interface NotificationStore {
  /** Returns the existing record for this key, or undefined when it is new. */
  findByIdempotencyKey(key: string): Promise<NotificationRecord | undefined>;
  insertQueued(request: NotificationRequest): Promise<NotificationRecord>;
  markResult(
    id: string,
    result: { status: NotificationStatus; providerMessageId?: string; failureReason?: string },
  ): Promise<NotificationRecord>;
}

/** Recipient facts the adapter needs to decide how and whether to deliver. */
export interface Recipient {
  id: string;
  language: Language;
  phone?: string;
  email?: string;
  /** External channels are skipped when the recipient has opted out. */
  acceptsExternalMessages: boolean;
}

export interface RecipientDirectory {
  find(recipientId: string): Promise<Recipient | undefined>;
}

export type DeliveryOutcome =
  | { status: "sent"; providerMessageId: string }
  | { status: "simulated"; reason: string }
  | { status: "failed"; reason: string };

/** Delivery port. One implementation per outbound provider. */
export interface Transport {
  readonly channels: readonly NotificationChannel[];
  send(message: { recipient: Recipient; channel: NotificationChannel; title: string; body: string }): Promise<DeliveryOutcome>;
}

const maxAttempts = 3;

export interface NotifierOptions {
  store: NotificationStore;
  recipients: RecipientDirectory;
  transports?: readonly Transport[];
}

export class Notifier {
  private readonly store: NotificationStore;
  private readonly recipients: RecipientDirectory;
  private readonly transports: readonly Transport[];

  constructor(options: NotifierOptions) {
    this.store = options.store;
    this.recipients = options.recipients;
    this.transports = options.transports ?? [];
  }

  /**
   * Records the message, then tries to deliver it. Delivery problems are recorded
   * on the notification and never thrown, so a failed message cannot roll back the
   * dossier action that triggered it.
   */
  async notify(input: NotificationRequest): Promise<NotificationRecord> {
    const request = notificationRequest.parse(input);

    const existing = await this.store.findByIdempotencyKey(request.idempotencyKey);
    if (existing && existing.status !== "queued") return existing;
    if (existing && existing.attempts >= maxAttempts) return existing;

    const record = existing ?? (await this.store.insertQueued(request));

    const recipient = await this.recipients.find(request.recipientId);
    if (!recipient) {
      return await this.store.markResult(record.id, { status: "failed", failureReason: "unknown_recipient" });
    }

    if (request.channel === "in_app") {
      return await this.store.markResult(record.id, { status: "sent" });
    }

    if (!recipient.acceptsExternalMessages) {
      return await this.store.markResult(record.id, { status: "simulated", failureReason: "recipient_opted_out" });
    }

    const transport = this.transports.find((candidate) => candidate.channels.includes(request.channel));
    if (!transport) {
      return await this.store.markResult(record.id, { status: "simulated", failureReason: "channel_not_configured" });
    }

    let outcome: DeliveryOutcome;
    try {
      outcome = await transport.send({ recipient, channel: request.channel, title: request.title, body: request.body });
    } catch (error) {
      outcome = { status: "failed", reason: error instanceof Error ? error.message : "transport_error" };
    }

    if (outcome.status === "sent") {
      return await this.store.markResult(record.id, { status: "sent", providerMessageId: outcome.providerMessageId });
    }
    return await this.store.markResult(record.id, { status: outcome.status, failureReason: outcome.reason });
  }
}

export interface TemplateInput {
  dossierReference: string;
  subject: string;
  nextAction: string;
}

type TemplateKind = "decision" | "obligation";

const templates: Record<Language, Record<TemplateKind, (input: TemplateInput) => { title: string; body: string }>> = {
  fr: {
    decision: ({ dossierReference, subject, nextAction }) => ({
      title: `Dossier ${dossierReference} : ${subject}`,
      body: `Votre dossier ${dossierReference} a fait l'objet de la decision suivante : ${subject}. Prochaine etape : ${nextAction}.`,
    }),
    obligation: ({ dossierReference, subject, nextAction }) => ({
      title: `Obligation ${subject}`,
      body: `Une obligation concernant votre dossier ${dossierReference} a change : ${subject}. Prochaine etape : ${nextAction}.`,
    }),
  },
  "ar-TN": {
    decision: ({ dossierReference, subject, nextAction }) => ({
      title: `الملف ${dossierReference}: ${subject}`,
      body: `تم اتخاذ القرار التالي بخصوص ملفكم ${dossierReference}: ${subject}. الخطوة الموالية: ${nextAction}.`,
    }),
    obligation: ({ dossierReference, subject, nextAction }) => ({
      title: `التزام ${subject}`,
      body: `تغير التزام يخص ملفكم ${dossierReference}: ${subject}. الخطوة الموالية: ${nextAction}.`,
    }),
  },
};

/** Renders the message in the recipient's language, naming the dossier and the next action. */
export function renderTemplate(language: Language, kind: TemplateKind, input: TemplateInput) {
  return templates[language][kind](input);
}
