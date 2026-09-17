import { sql, type Kysely } from "kysely";

const quizMenuId = "00000000-0000-4000-8000-000000000701";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    insert into menus (
      id, parent_id, label, route_link, icon, expanded, check_list, is_both
    ) values (
      ${quizMenuId}::uuid, null, 'Quizzes', '/quizzes', 'CheckCircle',
      false, null, true
    )
    on conflict (id) do update set
      label = excluded.label,
      route_link = excluded.route_link,
      icon = excluded.icon,
      is_both = excluded.is_both,
      updated_at = current_timestamp
  `.execute(db);

  await sql`
    insert into permissions (
      id, role_id, menu_id, can_create, can_read, can_update, can_delete
    )
    select
      gen_random_uuid(), roles.id, ${quizMenuId}::uuid,
      roles.name <> 'student', true, roles.name <> 'student', roles.name = 'admin'
    from roles
    where roles.name in ('admin', 'instructor', 'student')
    on conflict (role_id, menu_id) do update set
      can_create = excluded.can_create,
      can_read = excluded.can_read,
      can_update = excluded.can_update,
      can_delete = excluded.can_delete,
      updated_at = current_timestamp
  `.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from permissions where menu_id = ${quizMenuId}::uuid`.execute(
    db,
  );
  await sql`delete from menus where id = ${quizMenuId}::uuid`.execute(db);
}
