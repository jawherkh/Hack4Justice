import { ADMIN_ROLES, AdminRole } from "@hack4justice/shared";
import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ADMIN_AUTH_BASE_PATH } from "./server";

export interface CreateAdminClientOptions {
  /** API origin, e.g. http://localhost:3001. Admin auth routes live under /api/admin/auth. */
  baseURL: string;
}

export function createAdminClient({ baseURL }: CreateAdminClientOptions) {
  return createAuthClient({
    baseURL,
    basePath: ADMIN_AUTH_BASE_PATH,
    fetchOptions: { credentials: "include" },
    plugins: [
      inferAdditionalFields({
        user: { role: { type: ADMIN_ROLES, required: false, defaultValue: AdminRole.SUPPORT, input: false } },
      }),
    ],
  });
}

export type AdminAuthClient = ReturnType<typeof createAdminClient>;
