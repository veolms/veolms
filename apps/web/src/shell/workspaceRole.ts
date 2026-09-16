import type { CourseRole } from "../courses/catalogue";

const CREATOR_ROLES = new Set([
  "creator",
  "instructor",
  "admin",
  "platform_admin",
  "platform administrator",
]);

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
  if (
    normalized.has("admin") ||
    normalized.has("platform_admin") ||
    normalized.has("platform administrator")
  ) {
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

export function hasAdminRole(
  roles: readonly string[] | null | undefined,
): boolean {
  if (!roles?.length) {
    return false;
  }
  return roles.some((role) => {
    const r = role.toLowerCase();
    return (
      r === "admin" ||
      r === "platform_admin" ||
      r === "platform administrator"
    );
  });
}

export function getRoleDisplayName(
  role: CourseRole,
  userRoles?: readonly string[] | null,
): string {
  if (role === "student") {
    return "Student";
  }
  if (hasAdminRole(userRoles)) {
    return "Admin";
  }
  return "Instructor";
}

