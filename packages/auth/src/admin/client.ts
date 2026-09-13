import { adminClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { ac, roles } from "./access";
import { ADMIN_AUTH_BASE_PATH } from "./server";

export interface CreateAdminClientOptions {
  /** API origin, e.g. http://localhost:3001. Admin auth routes live under /api/admin/auth. */
  baseURL: string;
}

/** Staff auth client with the admin plugin: user management, ban / unban, session revocation. */
export function createAdminClient({ baseURL }: CreateAdminClientOptions) {
  return createAuthClient({
    baseURL,
    basePath: ADMIN_AUTH_BASE_PATH,
    fetchOptions: { credentials: "include" },
    plugins: [adminClient({ ac, roles })],
  });
}

export type AdminAuthClient = ReturnType<typeof createAdminClient>;
