import { sql, type Kysely } from "kysely";

/**
 * A lesson's PATCH used to need only `lesson.details.update`, whatever it
 * changed. It now also needs `lesson.content.update` to change the content
 * and `lesson.publish` to publish or hide it, so those two ticks in the role
 * editor finally mean something.
 *
 * Every role that could do these through `lesson.details.update` keeps
 * them: it is given both keys here. An admin can take them away after.
 */
const newKeys = ["lesson.content.update", "lesson.publish"] as const;
const keyList = sql.join(newKeys.map((key) => sql`${key}`));

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select holders.role_id, permissions.id, 'allow'
    from role_permissions holders
    join permissions details on details.id = holders.permission_id
    join permissions on permissions.permission_key in (${keyList})
    where details.permission_key = 'lesson.details.update'
      and holders.effect = 'allow'
    on conflict (role_id, permission_id) do nothing
  `.execute(database);
}

/** The grants stay: taking them back could remove what a role relied on. */
export async function down(): Promise<void> {}
