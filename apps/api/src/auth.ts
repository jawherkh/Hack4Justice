import { createAuth } from "@hack4justice/auth";
import { AppError } from "@hack4justice/shared";
import { Elysia } from "elysia";

import { db } from "./db";
import { env } from "./env";
import { sendMail } from "./mail";
import { isBanned } from "./admin-auth";
import { trustedOrigins } from "./trusted-origins";

export const auth = createAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: trustedOrigins([env.WEB_ORIGIN]),
  rateLimit: { enabled: env.NODE_ENV !== "test" },
  sendResetPassword: ({ to, url }) =>
    sendMail({
      to,
      subject: "Reset your Hack4Justice password",
      text: `Hello ${to.name},\n\nReset your password using this link (valid for one hour):\n${url}\n\nIf you did not ask for this, ignore this email.`,
    }),
});

/**
 * Adds an `auth: true` route option that resolves the Better Auth session
 * from cookies and injects `user` and `session`, or fails with 401.
 */
export const authGuard = new Elysia({ name: "auth-guard" }).macro({
  auth: {
    async resolve({ request: { headers } }) {
      // Bypass the cookie cache so bans and revocations apply immediately.
      const result = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (!result) throw new AppError({ status: 401, code: "unauthorized" });
      if (isBanned(result.user)) throw new AppError({ status: 403, code: "banned" });
      return { user: result.user, session: result.session };
    },
  },
});
