import { sql, type Kysely } from "kysely";

/**
 * Instructors could remove a whole section of their course but not one
 * lesson in it: the role lacked lesson.delete. Their own courses only, as
 * for every instructor permission.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key = 'lesson.delete'
    where roles.name = 'instructor'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    delete from role_permissions
    using roles, permissions
    where role_permissions.role_id = roles.id
      and role_permissions.permission_id = permissions.id
      and roles.name = 'instructor'
      and permissions.permission_key = 'lesson.delete'
  `.execute(database);
}
