import type { CourseRole } from "../courses/catalogue";

export const ADMIN_ROLES = new Set([
  "admin",
  "administrator",
  "platform_admin",
  "platform administrator",
]);

/**
 * Any role beyond student puts the account on the team: built-in staff
 * roles and every custom team role. Which pages it may open is decided by
 * its permissions (see navigation.ts), not by the role's name.
 */
export function hasTeamRole(
  roles: readonly string[] | null | undefined,
): boolean {
  return normalizeRoles(roles).some((role) => role !== "student");
}

export function normalizeRoles(
  roles: readonly string[] | null | undefined,
): string[] {
  if (!roles?.length) return [];
  return roles.map((r) => r.trim().toLowerCase());
}

export function getWorkspaceRoleStorageKey(userId?: string | null): string {
  return userId ? `veolms-role-${userId}` : "veolms-role";
}

/**
 * The view an account opens in: the one it last chose on this device, or,
 * with none saved, the creator view for an admin and the student view for
 * everyone else (other team roles included). The shell opens in it, and the
 * route guard judges the home page by it: the home is the dashboard only in
 * the creator view.
 */
export function readSavedWorkspaceView(
  userId: string | null | undefined,
  roles: readonly string[] | null | undefined,
): CourseRole {
  let stored: string | null = null;
  if (typeof window !== "undefined") {
    try {
      stored = window.localStorage.getItem(getWorkspaceRoleStorageKey(userId));
    } catch {
      stored = null;
    }
  }
  if (stored === "student") return "student";
  return stored === "creator" || hasAdminRole(roles) ? "creator" : "student";
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
  if ([...normalized].some((role) => role !== "student")) {
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
  return hasTeamRole(roles);
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
  const normalized = normalizeRoles(userRoles);
  if (normalized.includes("instructor") || normalized.includes("creator")) {
    return "Instructor";
  }
  return "Team";
}

export function getShellProfileSubtitle(
  role: CourseRole,
  userRoles: readonly string[] | null | undefined,
  username: string | null | undefined,
  canSwitchWorkspace: boolean,
): string {
  if (role === "student" && !canSwitchWorkspace) {
    const handle = username?.trim();
    if (handle) {
      return handle.startsWith("@") ? handle : `@${handle}`;
    }
  }
  return getRoleDisplayName(role, userRoles);
}
