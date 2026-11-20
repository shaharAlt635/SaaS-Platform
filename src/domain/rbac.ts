/**
 * Role-based access control. Pure policy: no I/O, fully unit-testable.
 */

export const ROLES = ["OWNER", "ADMIN", "MEMBER", "VIEWER"] as const;
export type Role = (typeof ROLES)[number];

export const PERMISSIONS = [
  "organization:read",
  "organization:update",
  "organization:delete",
  "members:read",
  "members:invite",
  "members:update",
  "members:remove",
  "billing:read",
  "billing:manage",
  "analytics:read",
  "api_keys:read",
  "api_keys:manage",
  "audit_log:read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

const VIEWER: readonly Permission[] = ["organization:read", "members:read", "analytics:read"];
const MEMBER: readonly Permission[] = [...VIEWER, "api_keys:read"];
const ADMIN: readonly Permission[] = [
  ...MEMBER,
  "organization:update",
  "members:invite",
  "members:update",
  "members:remove",
  "billing:read",
  "api_keys:manage",
  "audit_log:read",
];
const OWNER: readonly Permission[] = [...ADMIN, "organization:delete", "billing:manage"];

export const ROLE_PERMISSIONS: Readonly<Record<Role, ReadonlySet<Permission>>> = {
  OWNER: new Set(OWNER),
  ADMIN: new Set(ADMIN),
  MEMBER: new Set(MEMBER),
  VIEWER: new Set(VIEWER),
};

export const ROLE_META: Readonly<Record<Role, { label: string; description: string }>> = {
  OWNER: { label: "Owner", description: "Full access, including billing and deleting the organization." },
  ADMIN: { label: "Admin", description: "Manage members, settings and API keys." },
  MEMBER: { label: "Member", description: "View analytics and API keys." },
  VIEWER: { label: "Viewer", description: "Read-only access to analytics." },
};

const ROLE_RANK: Readonly<Record<Role, number>> = { OWNER: 4, ADMIN: 3, MEMBER: 2, VIEWER: 1 };

export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

export function hasPermission(role: Role, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function permissionsFor(role: Role): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

/** An actor may grant any role up to and including their own rank. */
export function canAssignRole(actor: Role, role: Role): boolean {
  return ROLE_RANK[actor] >= ROLE_RANK[role];
}

export function assignableRoles(actor: Role): Role[] {
  return ROLES.filter((role) => canAssignRole(actor, role));
}

/**
 * An actor may manage (change role of / remove) members ranked strictly below them.
 * Owners may also manage other owners.
 */
export function canManageMember(actor: Role, target: Role): boolean {
  return actor === "OWNER" || ROLE_RANK[actor] > ROLE_RANK[target];
}
