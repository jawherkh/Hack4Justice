import { createAuthClient } from "better-auth/react";

export interface CreateAuthClientOptions {
  /** API origin, e.g. http://localhost:3001. Auth routes live under /api/auth. */
  baseURL: string;
}

export function createClient({ baseURL }: CreateAuthClientOptions) {
  return createAuthClient({
    baseURL,
    basePath: "/api/auth",
    fetchOptions: { credentials: "include" },
  });
}

export type AuthClient = ReturnType<typeof createClient>;
