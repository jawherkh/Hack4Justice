import type { Database } from "@hack4justice/db";
import * as schema from "@hack4justice/db/schema";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

export interface CreateAuthOptions {
  db: Database;
  /** Public URL of the API, e.g. http://localhost:3001 */
  baseURL: string;
  /** Random 32+ char string. Generate with `openssl rand -base64 32`. */
  secret: string;
  /** Origins allowed to call auth endpoints with cookies, e.g. the web app. */
  trustedOrigins?: string[] | ((request?: Request) => string[]);
  /** Delivers the password-reset link. Without it, "forgot password" is disabled. */
  sendResetPassword?: (input: ResetPasswordEmail) => Promise<void>;
  /** Per-IP rate limiting on auth endpoints. Defaults to enabled. Disable for tests. */
  rateLimit?: { enabled: boolean };
}

export interface ResetPasswordEmail {
  to: { email: string; name: string };
  /** Link that verifies the token and lands on the web app's reset page. */
  url: string;
  token: string;
}

export function createAuth({
  db,
  baseURL,
  secret,
  trustedOrigins = [],
  sendResetPassword,
  rateLimit = { enabled: true },
}: CreateAuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    basePath: "/api/auth",
    trustedOrigins,
    rateLimit: {
      enabled: rateLimit.enabled,
      // Global ceiling per IP, then tighter limits on credential endpoints.
      window: 60,
      max: 100,
      customRules: {
        "/sign-in/email": { window: 60, max: 10 },
        "/sign-up/email": { window: 60, max: 5 },
        "/request-password-reset": { window: 60, max: 3 },
        "/reset-password": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      resetPasswordTokenExpiresIn: 60 * 60,
      ...(sendResetPassword
        ? {
            sendResetPassword: ({ user, url, token }) =>
              sendResetPassword({ to: { email: user.email, name: user.name }, url, token }),
          }
        : {}),
    },
    session: {
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      database: { generateId: "uuid" },
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
