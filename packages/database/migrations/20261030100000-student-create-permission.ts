import { sql, type Kysely } from "kysely";

/**
 * `student.create` (position 79 in the contracts list, the seed's id
 * scheme): adding a student by name and email from the Students page. Only
 * the admin role gets it; any other role is given it in the role editor.
 */
const key = "student.create";
const position = 79;

function permissionId(position: number): string {
  return `00000000-0000-4000-b000-${String(position).padStart(12, "0")}`;
}

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into permissions (id, permission_key, domain, description)
    values (
      ${permissionId(position)}::uuid,
      ${key},
      'student',
      ${`Permission to perform ${key}`}
    )
    on conflict do nothing
  `.execute(database);
  // Admin holds every permission.
  await sql`
    insert into role_permissions (role_id, permission_id, effect)
    select roles.id, permissions.id, 'allow'
    from roles
    join permissions on permissions.permission_key = ${key}
    where roles.name = 'admin'
    on conflict (role_id, permission_id) do update set effect = 'allow'
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    delete from permissions where permission_key = ${key}
  `.execute(database);
}
