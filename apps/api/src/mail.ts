import { logger } from "./logger";

export interface Mail {
  to: { email: string; name?: string };
  subject: string;
  text: string;
}

/**
 * Outbound email. No provider is configured yet, so messages are logged.
 * Swap the body of `sendMail` for a real transport (Resend, SES, Cloudflare
 * Email Service, ...) without touching callers.
 */
export async function sendMail(mail: Mail): Promise<void> {
  logger.info(
    { to: mail.to.email, subject: mail.subject, body: mail.text },
    "mail (logged, no provider configured)",
  );
}
