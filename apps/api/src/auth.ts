import { createAuth } from "@hack4justice/auth";
import { Elysia } from "elysia";

import { db } from "./db";
import { env } from "./env";

export const auth = createAuth({
  db,
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.WEB_ORIGIN],
});

/**
 * Adds an `auth: true` route option that resolves the Better Auth session
 * from cookies and injects `user` and `session`, or returns 401.
 */
export const authGuard = new Elysia({ name: "auth-guard" }).macro({
  auth: {
    async resolve({ status, request: { headers } }) {
      const result = await auth.api.getSession({ headers });
      if (!result) return status(401, { error: "Unauthorized" });
      return { user: result.user, session: result.session };
    },
  },
});
