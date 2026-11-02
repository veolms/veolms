import { sql } from "kysely";
import type { DatabaseExecutor as Executor } from "@veolms/database";
import { getUserEffectivePermissions } from "../../authorization/index.ts";
import type { Actor, RoleFacts } from "./team.rules.ts";

/** Reads both the roles and the members side needs. */

const liveAssignment = sql<boolean>`(ra.expires_at is null or ra.expires_at > now())`;

export async function findRolesByIds(
  database: Executor,
  roleIds: readonly string[],
): Promise<RoleFacts[]> {
  if (roleIds.length === 0) return [];
  const rows = await database
    .selectFrom("roles as r")
    .leftJoin("role_permissions as rp", (join) =>
      join.onRef("rp.role_id", "=", "r.id").on("rp.effect", "=", "allow"),
    )
    .leftJoin("permissions as p", "p.id", "rp.permission_id")
    .select([
      "r.id",
      "r.name",
      "r.is_system",
      sql<
        string[]
      >`coalesce(array_agg(p.permission_key) filter (where p.permission_key is not null), '{}')`.as(
        "permissions",
      ),
    ])
    .where("r.id", "in", roleIds)
    .groupBy("r.id")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    isSystem: row.is_system,
    permissions: row.permissions,
  }));
}

export async function listPlatformRoleNames(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("role_assignments as ra")
    .innerJoin("roles as r", "r.id", "ra.role_id")
    .select("r.name")
    .where("ra.user_id", "=", userId)
    .where("ra.scope_type", "=", "platform")
    .where(liveAssignment)
    .execute();
  return rows.map((row) => row.name);
}

/**
 * The actor as the rules see them, read fresh (not from the session cache).
 * Only permissions that reach every course count: an instructor's stop at
 * their own courses, so they are not theirs to hand out academy-wide.
 */
export async function loadActor(
  database: Executor,
  userId: string,
): Promise<Actor> {
  const [roleNames, permissions] = await Promise.all([
    listPlatformRoleNames(database, userId),
    getUserEffectivePermissions(database, {
      userId,
      courseId: null,
      excludeOwnCoursesOnlyRoles: true,
    }),
  ]);
  return { userId, roleNames, permissions: new Set(permissions) };
}

/** Platform role ids the user holds, the student role left out. */
export async function listTeamRoleIds(
  database: Executor,
  userId: string,
): Promise<string[]> {
  const rows = await database
    .selectFrom("role_assignments as ra")
    .innerJoin("roles as r", "r.id", "ra.role_id")
    .select("r.id")
    .where("ra.user_id", "=", userId)
    .where("ra.scope_type", "=", "platform")
    .where("r.name", "<>", "student")
    .where(liveAssignment)
    .execute();
  return rows.map((row) => row.id);
}

/**
 * Locks every live admin assignment and returns who holds one, so two
 * requests cannot each remove a different "other" admin at the same time.
 */
export async function lockAdminHolders(database: Executor): Promise<string[]> {
  const rows = await database
    .selectFrom("role_assignments as ra")
    .innerJoin("roles as r", "r.id", "ra.role_id")
    .innerJoin("users as u", "u.id", "ra.user_id")
    .select("ra.user_id")
    .where("r.name", "=", "admin")
    .where("ra.scope_type", "=", "platform")
    .where("u.is_deleted", "=", false)
    .where(liveAssignment)
    .forUpdate("ra")
    .execute();
  return [...new Set(rows.map((row) => row.user_id))];
}

export async function findRoleIdByName(
  database: Executor,
  name: string,
): Promise<string | null> {
  const row = await database
    .selectFrom("roles")
    .select("id")
    .where("name", "=", name)
    .executeTakeFirst();
  return row?.id ?? null;
}

export async function isFeatureEnabled(
  database: Executor,
  featureKey: string,
): Promise<boolean> {
  const row = await database
    .selectFrom("features")
    .select("enabled")
    .where("feature_key", "=", featureKey)
    .executeTakeFirst();
  // A missing row counts as on, as the permission guard reads it.
  return row?.enabled ?? true;
}
