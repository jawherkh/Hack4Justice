import { env } from "./env";

const LOCALHOST_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

/**
 * Better Auth trusted origins. Production: the configured origins only.
 * Development: also whatever localhost port the request comes from, since vite
 * moves to the next free port when the configured one is taken.
 */
export function trustedOrigins(configured: string[]): string[] | ((request?: Request) => string[]) {
  if (env.NODE_ENV === "production") return configured;
  return (request) => {
    const origin = request?.headers.get("origin");
    return origin && LOCALHOST_ORIGIN.test(origin) ? [...configured, origin] : configured;
  };
}
