import type { CourseRole } from "../courses/catalogue";

export const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "platform_admin",
  "platform administrator",
]);

export const STAFF_ROLES = new Set([
  "admin",
  "administrator",
  "creator",
  "instructor",
  "platform_admin",
  "platform administrator",
  "superadmin",
  "super_admin",
]);

export const CREATOR_ROLES = new Set(["creator", "instructor", ...ADMIN_ROLES]);

export function normalizeRoles(
  roles: readonly string[] | null | undefined,
): string[] {
  if (!roles?.length) return [];
  return roles.map((r) => r.trim().toLowerCase());
}

export function getWorkspaceRoleStorageKey(userId?: string | null): string {
  return userId ? `veolms-role-${userId}` : "veolms-role";
}

export function getAllowedWorkspaceRoles(
  roles: readonly string[] | null | undefined,
): CourseRole[] {
  if (!roles?.length) {
    return [];
  }

  const normalized = new Set(normalizeRoles(roles));
  if ([...normalized].some((role) => ADMIN_ROLES.has(role))) {
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

export function getUserRoles(user: unknown): readonly string[] | undefined {
  if (typeof user !== "object" || user === null || !("roles" in user)) {
    return undefined;
  }

  const roles = user.roles;
  return Array.isArray(roles) && roles.every((role) => typeof role === "string")
    ? roles
    : undefined;
}

export function hasAdminRole(
  roles: readonly string[] | null | undefined,
): boolean {
  if (!roles?.length) {
    return false;
  }
  return normalizeRoles(roles).some((role) => ADMIN_ROLES.has(role));
}

export function isStaffRole(
  roles: readonly string[] | null | undefined,
): boolean {
  if (!roles?.length) {
    return false;
  }
  return normalizeRoles(roles).some((role) => STAFF_ROLES.has(role));
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
