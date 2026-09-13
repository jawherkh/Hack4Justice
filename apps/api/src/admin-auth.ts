import { createAdminAuth } from "@hack4justice/auth/admin/server";
import { AppError, can, isAdminRole, type AdminPermission, type AdminRole } from "@hack4justice/shared";
import { Elysia } from "elysia";

import { db } from "./db";
import { env } from "./env";
import { trustedOrigins } from "./trusted-origins";

if (!env.ADMIN_AUTH_SECRET && env.NODE_ENV === "production") {
  throw new Error("ADMIN_AUTH_SECRET is required in production");
}

export const adminAuth = createAdminAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.ADMIN_AUTH_SECRET ?? `${env.BETTER_AUTH_SECRET}:admin`,
  trustedOrigins: trustedOrigins([env.ADMIN_ORIGIN]),
  rateLimit: { enabled: env.NODE_ENV !== "test" },
});

/** Banned unless the ban has an expiry that already passed. */
export function isBanned(user: { banned?: boolean | null; banExpires?: Date | string | null }): boolean {
  if (!user.banned) return false;
  if (!user.banExpires) return true;
  return new Date(user.banExpires).getTime() > Date.now();
}

export interface Staff {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
}

/**
 * `admin: <permission>` route option: resolves the staff session, injects
 * `staff`, and fails with 401 / 403 when missing or under-privileged.
 */
export const adminGuard = new Elysia({ name: "admin-guard" }).macro({
  admin: (permission: AdminPermission) => ({
    async resolve({ request: { headers } }) {
      // Bypass the cookie cache so bans and revocations apply immediately.
      const result = await adminAuth.api.getSession({ headers, query: { disableCookieCache: true } });
      if (!result) throw new AppError({ status: 401, code: "unauthorized" });
      // The session cookie cache can outlive a ban by a few minutes; never trust it for banned users.
      if (isBanned(result.user)) throw new AppError({ status: 403, code: "banned" });
      const role = isAdminRole(result.user.role) ? result.user.role : null;
      if (!role) throw new AppError({ status: 403, code: "forbidden" });
      if (!can(role, permission)) throw new AppError({ status: 403, code: "forbidden" });
      const staff: Staff = { id: result.user.id, name: result.user.name, email: result.user.email, role };
      return { staff };
    },
  }),
});
