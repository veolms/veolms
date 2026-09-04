import type { CourseRole } from "../courses/catalogue";

const CREATOR_ROLES = new Set(["creator", "instructor", "admin"]);

export function getWorkspaceRoleStorageKey(userId?: string | null): string {
  return userId ? `veolms-role-${userId}` : "veolms-role";
}

export function getAllowedWorkspaceRoles(
  roles: readonly string[] | null | undefined,
): CourseRole[] {
  if (!roles?.length) {
    return [];
  }

  const normalized = new Set(roles.map((role) => role.toLowerCase()));
  if (normalized.has("admin")) {
    return ["student", "creator"];
  }

  const allowed: CourseRole[] = [];
  if (normalized.has("student")) {
    allowed.push("student");
  }
  if ([...normalized].some((role) => CREATOR_ROLES.has(role))) {
    allowed.push("creator");
  }
  return allowed;
}

export function getVisibleWorkspaceRoles(
  roles: readonly string[] | null | undefined,
  currentRole: CourseRole,
): CourseRole[] {
  const allowed = getAllowedWorkspaceRoles(roles);
  return allowed.length > 0 ? allowed : [currentRole];
}

export function resolveWorkspaceRole(
  roles: readonly string[] | null | undefined,
  currentRole: CourseRole,
): CourseRole {
  const visible = getVisibleWorkspaceRoles(roles, currentRole);
  return visible.includes(currentRole)
    ? currentRole
    : (visible[0] ?? "student");
}

export function getUserRoles(
  user: { roles?: readonly string[] } | null | undefined,
): readonly string[] | undefined {
  return user && "roles" in user && Array.isArray(user.roles)
    ? user.roles
    : undefined;
}
