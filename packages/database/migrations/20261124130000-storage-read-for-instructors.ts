import { sql, type Kysely } from "kysely";

/**
 * Instructors see Settings > Student storage too (the owner, 24 Nov): every
 * student's space and their requests for more. Seeing only: approving,
 * changing limits and blocking (`storage.manage`) stay with admins.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key = 'storage.read'
    where roles.name = 'instructor'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    delete from role_permissions
    where role_id in (select id from roles where name = 'instructor')
      and permission_id in (
        select id from permissions where permission_key = 'storage.read'
      )
  `.execute(database);
}
