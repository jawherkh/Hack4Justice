import { createAccessControl } from "better-auth/plugins/access";
import { adminAc, defaultStatements } from "better-auth/plugins/admin/access";

/**
 * Access control for the staff instance's admin plugin. Statements mirror the
 * shared `AdminPermission` ranks: support reads, admin manages end users,
 * superadmin manages staff (full plugin access).
 */
export const statement = {
  ...defaultStatements,
  submission: ["review"],
} as const;

export const ac = createAccessControl(statement);

export const roles = {
  support: ac.newRole({ user: ["list", "get"], session: ["list"] }),
  admin: ac.newRole({ user: ["list", "get", "ban"], session: ["list", "revoke"], submission: ["review"] }),
  superadmin: ac.newRole({ ...adminAc.statements, submission: ["review"] }),
};
