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
  trustedOrigins?: string[];
}

export function createAuth({ db, baseURL, secret, trustedOrigins = [] }: CreateAuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    basePath: "/api/auth",
    trustedOrigins,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    emailAndPassword: { enabled: true },
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
