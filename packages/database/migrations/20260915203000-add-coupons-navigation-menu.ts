import { sql, type Kysely } from "kysely";

const couponMenuId = "00000000-0000-4000-9000-000000000018";

export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`
    insert into menus (
      id, parent_id, label, route_link, icon, expanded, check_list, is_both
    ) values (
      ${couponMenuId}::uuid, null, 'Coupons', '/coupons', 'Tag',
      false, null, false
    )
    on conflict (id) do update set
      label = excluded.label,
      route_link = excluded.route_link,
      icon = excluded.icon,
      is_both = excluded.is_both,
      updated_at = current_timestamp
  `.execute(db);

  await sql`
    insert into menu_permissions (
      id, role_id, menu_id, can_create, can_read, can_update, can_delete
    )
    select
      gen_random_uuid(), roles.id, ${couponMenuId}::uuid,
      true, true, true, (roles.name in ('admin', 'Administrator', 'administrator', 'platform_admin'))
    from roles
    where (roles.name in ('admin', 'instructor', 'Administrator', 'administrator', 'Instructor', 'platform_admin'))
    on conflict (role_id, menu_id) do update set
      can_create = excluded.can_create,
      can_read = excluded.can_read,
      can_update = excluded.can_update,
      can_delete = excluded.can_delete,
      updated_at = current_timestamp
  `.execute(db);
} 

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`delete from menu_permissions where menu_id = ${couponMenuId}::uuid`.execute(
    db,
  );
  await sql`delete from menus where id = ${couponMenuId}::uuid`.execute(db);
}
