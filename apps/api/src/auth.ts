import { createAuth } from "@hack4justice/auth";
import { AppError } from "@hack4justice/shared";
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
 * from cookies and injects `user` and `session`, or fails with 401.
 */
export const authGuard = new Elysia({ name: "auth-guard" }).macro({
  auth: {
    async resolve({ request: { headers } }) {
      const result = await auth.api.getSession({ headers });
      if (!result) throw new AppError({ status: 401, code: "unauthorized" });
      return { user: result.user, session: result.session };
    },
  },
});
