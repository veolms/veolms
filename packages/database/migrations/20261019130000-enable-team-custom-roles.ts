import { sql, type Kysely } from "kysely";

/**
 * Custom team roles go live: every route and page now checks permissions
 * rather than role names, so a member holding a custom role gets the same
 * answer from the API and the sidebar.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    insert into features (feature_key, description, enabled)
    values ('team_custom_roles', 'Custom team roles built from permissions', true)
    on conflict (feature_key) do update set enabled = true
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update features set enabled = false where feature_key = 'team_custom_roles'
  `.execute(database);
}
