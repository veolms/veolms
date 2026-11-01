import { sql } from "kysely";
import type { DatabaseExecutor } from "./schema/index.ts";

/**
 * Platform-wide role grants. `role_assignments` is what grants access;
 * `user_roles` is still read by the older role-name checks, so until those
 * are gone every write goes to both tables. Use these instead of writing
 * either table directly.
 */

export async function grantPlatformRole(
  database: DatabaseExecutor,
  grant: { userId: string; roleId: string; createdBy?: string | null },
): Promise<void> {
  await database
    .insertInto("user_roles")
    .values({ user_id: grant.userId, role_id: grant.roleId })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  await sql`
    insert into role_assignments (id, user_id, role_id, scope_type, course_id, created_by)
    values (
      ${crypto.randomUUID()}::uuid,
      ${grant.userId}::uuid,
      ${grant.roleId}::uuid,
      'platform',
      null,
      ${grant.createdBy ?? null}::uuid
    )
    on conflict (user_id, role_id) where scope_type = 'platform' do nothing
  `.execute(database);
}

export async function revokePlatformRole(
  database: DatabaseExecutor,
  revoke: { userId: string; roleId: string },
): Promise<void> {
  await database
    .deleteFrom("user_roles")
    .where("user_id", "=", revoke.userId)
    .where("role_id", "=", revoke.roleId)
    .execute();

  await database
    .deleteFrom("role_assignments")
    .where("user_id", "=", revoke.userId)
    .where("role_id", "=", revoke.roleId)
    .where("scope_type", "=", "platform")
    .execute();
}
