/** Staff roles for the admin panel. Ordered from least to most privileged. */
export const AdminRole = {
  SUPPORT: "support",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
} as const;
export type AdminRole = (typeof AdminRole)[keyof typeof AdminRole];
export const ADMIN_ROLES = Object.values(AdminRole) as [AdminRole, ...AdminRole[]];

const RANK: Record<AdminRole, number> = { support: 0, admin: 1, superadmin: 2 };

export function isAdminRole(value: unknown): value is AdminRole {
  return typeof value === "string" && (ADMIN_ROLES as readonly string[]).includes(value);
}

/** True when `role` is at least `required` in the hierarchy. */
export function hasRole(role: AdminRole, required: AdminRole): boolean {
  return RANK[role] >= RANK[required];
}

/** What each role may do. Support is read-only. */
export const AdminPermission = {
  VIEW: "view",
  REVIEW_SUBMISSIONS: "review_submissions",
  MANAGE_STAFF: "manage_staff",
} as const;
export type AdminPermission = (typeof AdminPermission)[keyof typeof AdminPermission];

const REQUIRED_ROLE: Record<AdminPermission, AdminRole> = {
  view: AdminRole.SUPPORT,
  review_submissions: AdminRole.ADMIN,
  manage_staff: AdminRole.SUPERADMIN,
};

export function can(role: AdminRole, permission: AdminPermission): boolean {
  return hasRole(role, REQUIRED_ROLE[permission]);
}
