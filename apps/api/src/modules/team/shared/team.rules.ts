import { AppError } from "../../../lib/errors.ts";
import { ADMIN_ROLE, STUDENT_ROLE } from "../../auth/index.ts";

/**
 * The team rules, kept free of the database so each one is tested on its
 * own. Services load the facts and call these inside their transaction.
 */

export interface RoleFacts {
  id: string;
  name: string;
  isSystem: boolean;
  permissions: readonly string[];
}

export interface Actor {
  userId: string;
  /** The actor's platform role names, read inside the transaction. */
  roleNames: readonly string[];
  /** The actor's effective platform permissions. */
  permissions: ReadonlySet<string>;
}

/**
 * Names a custom role may not take: the built-in roles, and the spellings
 * older code still treats as an administrator.
 */
const RESERVED_ROLE_NAMES = new Set([
  ADMIN_ROLE,
  STUDENT_ROLE,
  "administrator",
  "platform_admin",
  "platform administrator",
  "creator",
]);

export function isAdmin(actor: Actor): boolean {
  return actor.roleNames.some((name) => name.toLowerCase() === ADMIN_ROLE);
}

export function isAdminRole(role: { name: string }): boolean {
  return role.name.toLowerCase() === ADMIN_ROLE;
}

export function isReservedRoleName(name: string): boolean {
  return RESERVED_ROLE_NAMES.has(name.trim().toLowerCase());
}

/**
 * No privilege escalation: to grant, take away, create or change a role the
 * actor must hold every permission in it. Only an admin hands out admin.
 */
export function assertCanHandleRoles(
  actor: Actor,
  roles: readonly Pick<RoleFacts, "name" | "permissions">[],
): void {
  if (isAdmin(actor)) return;
  for (const role of roles) {
    const missing = isAdminRole(role)
      ? ["admin"]
      : role.permissions.filter((key) => !actor.permissions.has(key));
    if (missing.length > 0) {
      throw new AppError(
        403,
        "PRIVILEGE_ESCALATION",
        `You can only give out access you hold yourself. Missing: ${missing.join(", ")}.`,
      );
    }
  }
}

/** Same check for a bare permission list (a role being created or edited). */
export function assertCanGrantPermissions(
  actor: Actor,
  permissions: readonly string[],
): void {
  assertCanHandleRoles(actor, [{ name: "", permissions }]);
}

/** Never leave the platform without an admin. */
export function assertKeepsAnAdmin(remainingAdminCount: number): void {
  if (remainingAdminCount < 1) {
    throw new AppError(
      409,
      "LAST_ADMIN",
      "This is the last admin. Make someone else an admin first.",
    );
  }
}

function isTeamManagementKey(key: string): boolean {
  return key.startsWith("team.") || key.startsWith("role.");
}

/**
 * You cannot take away your own team or role permissions: compare what the
 * actor holds now with what they would hold after the change.
 */
export function assertNoSelfLockout(
  currentPermissions: ReadonlySet<string>,
  permissionsAfter: ReadonlySet<string>,
): void {
  const lost = [...currentPermissions].filter(
    (key) => isTeamManagementKey(key) && !permissionsAfter.has(key),
  );
  if (lost.length > 0) {
    throw new AppError(
      409,
      "SELF_LOCKOUT",
      `This change would remove your own access to manage the team (${lost.join(", ")}). Ask another admin to make it.`,
    );
  }
}

/**
 * Admin always holds every permission, so its role is never edited. The
 * other built-in roles are an admin's to tune; anyone else duplicates them.
 */
export function assertEditableRole(
  actor: Actor,
  role: Pick<RoleFacts, "name" | "isSystem">,
): void {
  if (isAdminRole(role)) {
    throw new AppError(
      409,
      "ROLE_IS_SYSTEM",
      "The admin role always holds every permission.",
    );
  }
  if (role.isSystem && !isAdmin(actor)) {
    throw new AppError(
      409,
      "ROLE_IS_SYSTEM",
      "Only an admin can change a built-in role. Duplicate it to make your own.",
    );
  }
}

export function assertDeletableRole(role: Pick<RoleFacts, "isSystem">): void {
  if (role.isSystem) {
    throw new AppError(
      409,
      "ROLE_IS_SYSTEM",
      "Built-in roles cannot be deleted.",
    );
  }
}

/** Taking someone off the team is its own permission, however it is asked. */
export function assertCanRemoveMembers(actor: Actor): void {
  if (isAdmin(actor) || actor.permissions.has("team.remove")) return;
  throw new AppError(
    403,
    "PERMISSION_DENIED",
    "Taking someone off the team needs the team.remove permission.",
  );
}

export function assertRoleUnused(usage: number): void {
  if (usage > 0) {
    throw new AppError(
      409,
      "ROLE_IN_USE",
      "Someone holds this role or has been invited with it. Change their roles first.",
    );
  }
}

/** Splits a full replace into what to add and what to take away. */
export function diffRoleIds(
  current: readonly string[],
  next: readonly string[],
): { added: string[]; removed: string[] } {
  const currentSet = new Set(current);
  const nextSet = new Set(next);
  return {
    added: [...nextSet].filter((id) => !currentSet.has(id)),
    removed: [...currentSet].filter((id) => !nextSet.has(id)),
  };
}
