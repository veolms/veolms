import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_learning_space_sessions_user_updated`.execute(
    database,
  );
  await database.schema
    .dropTable("learning_space_sessions")
    .ifExists()
    .execute();

  // Clean up any RBAC menu rows for Learning Space
  await sql`
    update rbac_menus
    set parent_id = null
    where parent_id in (
      select id from rbac_menus where label = 'Learning Space' or route_link = '/learning-space'
    )
  `.execute(database);

  await sql`
    delete from role_menu_permissions
    where menu_id in (
      select id from rbac_menus where label = 'Learning Space' or route_link = '/learning-space'
    )
  `.execute(database);

  await sql`
    delete from rbac_menus
    where label = 'Learning Space' or route_link = '/learning-space'
  `.execute(database);
}

export async function down(_database: Kysely<unknown>): Promise<void> {
  // Learning Space has been permanently removed from the system.
}
