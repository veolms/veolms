import { sql, type Kysely } from "kysely";

/**
 * Keeps existing databases aligned with the three supported roles. This
 * migration follows the notification, fleet, and hardware migrations. The
 * instructor retains the creator role's UUID, so user-role and permission
 * assignments remain valid while the role name changes.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update roles
    set
      name = 'instructor',
      description = 'Course instructor and author',
      updated_at = current_timestamp
    where name = 'creator'
  `.execute(database);

  await sql`
    insert into roles (id, name, description)
    values (
      '00000000-0000-4000-8000-000000000000',
      'admin',
      'System administrator with full platform access'
    )
    on conflict (name) do update
    set
      description = excluded.description,
      updated_at = current_timestamp
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update roles
    set
      name = 'creator',
      description = 'Platform owner and creator',
      updated_at = current_timestamp
    where name = 'instructor'
  `.execute(database);

  await sql`delete from roles where name = 'admin'`.execute(database);
}


