import type { Database } from "@hack4justice/db";
import { adminAccount, adminSession, adminUser, adminVerification } from "@hack4justice/db/schema";
import { AdminRole } from "@hack4justice/shared";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { admin } from "better-auth/plugins";

import { ac, roles } from "./access";

export const ADMIN_AUTH_BASE_PATH = "/api/admin/auth";

export interface CreateAdminAuthOptions {
  db: Database;
  /** Public URL of the API, e.g. http://localhost:3001 */
  baseURL: string;
  /** Random 32+ char string. Keep it different from the end-user auth secret. */
  secret: string;
  /** Origins allowed to call admin auth endpoints with cookies, e.g. the admin app. */
  trustedOrigins?: string[] | ((request?: Request) => string[]);
  rateLimit?: { enabled: boolean };
}

/**
 * Staff authentication for the admin panel. Separate tables, cookie prefix and
 * secret from end users; sign-up is disabled, accounts are created by a
 * superadmin (or the seeder).
 */
export function createAdminAuth({
  db,
  baseURL,
  secret,
  trustedOrigins = [],
  rateLimit = { enabled: true },
}: CreateAdminAuthOptions) {
  return betterAuth({
    baseURL,
    secret,
    basePath: ADMIN_AUTH_BASE_PATH,
    trustedOrigins,
    rateLimit: {
      enabled: rateLimit.enabled,
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 60, max: 5 },
        "/change-password": { window: 60, max: 5 },
      },
    },
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: adminUser,
        session: adminSession,
        account: adminAccount,
        verification: adminVerification,
      },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
    },
    session: {
      expiresIn: 60 * 60 * 12,
      updateAge: 60 * 60,
      cookieCache: { enabled: true, maxAge: 5 * 60 },
    },
    advanced: {
      cookiePrefix: "admin",
      database: { generateId: "uuid" },
    },
    // Staff management (create, roles, ban, sessions) is Better Auth's admin
    // plugin; only superadmins may call it.
    plugins: [admin({ ac, roles, adminRoles: [AdminRole.SUPERADMIN], defaultRole: AdminRole.SUPPORT })],
  });
}

export type AdminAuth = ReturnType<typeof createAdminAuth>;
export type AdminSession = AdminAuth["$Infer"]["Session"];
