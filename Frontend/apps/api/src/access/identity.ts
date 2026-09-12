import { demoPrincipals } from "./fixtures";
import { AccessError, type Principal } from "./policy";

export type ResolvePrincipal = (request: Request) => Principal | Promise<Principal>;

export const unavailableIdentity: ResolvePrincipal = () => {
  throw new AccessError(503, "identity_provider_not_configured");
};

export function createDemoIdentity(enabled: boolean, environment: string): ResolvePrincipal {
  if (!enabled) return unavailableIdentity;
  if (environment !== "development" && environment !== "test") {
    throw new Error("Demo identities are permitted only in development or test");
  }
  return (request) => {
    const id = request.headers.get("x-demo-user");
    const principal = demoPrincipals.find((user) => user.id === id);
    if (!principal) throw new AccessError(401, "unauthenticated");
    // Roles and memberships always come from the server, never request headers/body.
    return principal;
  };
}
