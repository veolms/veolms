import { sql, type Kysely } from "kysely";

/**
 * "VeoLMS Team" becomes a built-in role: the in-house team sees everything
 * the staff workspace shows, read-only, except money (revenue analytics and
 * orders). An admin can change its permissions later; its name stays.
 *
 * An academy that already made a custom role of that name keeps its
 * members: they move to the built-in row, which takes the role's place. Its
 * permissions become the read-only set below.
 *
 * Kept equal to `ROLE_CAPABILITY_MAPPINGS.veolms_team` in the seed by hand:
 * a migration must not change when the seed does.
 */
const ROLE_ID = "00000000-0000-4000-8000-00000000000a";
const ROLE_NAME = "VeoLMS Team";
const ROLE_DESCRIPTION =
  "The in-house team: sees everything read-only, except revenue and orders";
const MIGRATING_NAME = "__veolms_team_migrating";

const readKeys = [
  "course.read",
  "course.preview",
  "lesson.read",
  "quiz.read",
  "submission.read",
  "student.read",
  "enrollment.read",
  "discussion.read",
  "analytics.course.read",
  "coupon.read",
  "platform.settings.read",
  "team.read",
  "role.read",
] as const;

const keyList = sql.join(readKeys.map((key) => sql`${key}`));

export async function up(database: Kysely<unknown>): Promise<void> {
  // A custom role that already holds the name gives it up for now.
  const existing = await sql<{ id: string }>`
    select id from roles
    where lower(name) = lower(${ROLE_NAME}) and id <> ${ROLE_ID}::uuid
  `.execute(database);
  const oldId = existing.rows[0]?.id ?? null;
  if (oldId) {
    await sql`
      update roles set name = ${MIGRATING_NAME} where id = ${oldId}::uuid
    `.execute(database);
  }

  await sql`
    insert into roles (id, name, description, is_system, own_courses_only)
    values (${ROLE_ID}::uuid, ${ROLE_NAME}, ${ROLE_DESCRIPTION}, true, false)
    on conflict (id) do update set
      name = excluded.name,
      is_system = true,
      own_courses_only = false,
      updated_at = now()
  `.execute(database);

  if (oldId) {
    // The new row is empty, so nothing it holds can clash with what moves.
    for (const table of [
      "role_assignments",
      "user_roles",
      "team_invitation_roles",
      "menu_permissions",
    ]) {
      await sql`
        update ${sql.table(table)} set role_id = ${ROLE_ID}::uuid
        where role_id = ${oldId}::uuid
      `.execute(database);
    }
    await sql`delete from roles where id = ${oldId}::uuid`.execute(database);
  }

  await sql`
    delete from role_permissions where role_id = ${ROLE_ID}::uuid
  `.execute(database);
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select ${ROLE_ID}::uuid, permissions.id, 'allow'
    from permissions
    where permissions.permission_key in (${keyList})
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

/** Back to an ordinary custom role; its members and permissions stay. */
export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update roles set is_system = false, updated_at = now()
    where id = ${ROLE_ID}::uuid
  `.execute(database);
}
