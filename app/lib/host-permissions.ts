import type { HostRole } from "@prisma/client";

export type HostPermission =
  | "dashboard:view"
  | "games:create"
  | "games:manage"
  | "games:view"
  | "claims:manage"
  | "wheels:operate"
  | "prizeClaims:manage"
  | "games:archive"
  | "settings:manage"
  | "backups:manage"
  | "hosts:manage"
  | "games:delete";

const ROLE_PERMISSIONS: Record<HostRole, ReadonlySet<HostPermission>> = {
  OWNER: new Set([
    "dashboard:view",
      "games:create",
      "games:manage",
    "games:view",
    "claims:manage",
    "wheels:operate",
    "prizeClaims:manage",
    "games:archive",
    "settings:manage",
    "backups:manage",
    "hosts:manage",
    "games:delete",
  ]),
  HOST: new Set([
    "dashboard:view",
      "games:create",
      "games:manage",
    "games:view",
    "claims:manage",
    "wheels:operate",
    "prizeClaims:manage",
    "games:archive",
  ]),
  MODERATOR: new Set(["dashboard:view", "games:view", "claims:manage"]),
  VIEWER: new Set(["dashboard:view", "games:view"]),
};

export function hostRoleAllows(role: HostRole, permission: HostPermission) {
  return ROLE_PERMISSIONS[role].has(permission);
}

export function hostPermissions(role: HostRole) {
  return [...ROLE_PERMISSIONS[role]];
}
