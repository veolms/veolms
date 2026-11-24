import { sql, type Kysely } from "kysely";

/**
 * The AI provider's workspace. An Anthropic key made at the organisation
 * level (not inside a workspace) is refused unless each request names the
 * workspace to use; admins enter its id in Platform → AI.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ai_settings
      add column if not exists workspace_id text,
      add constraint ai_settings_workspace_length
        check (workspace_id is null or char_length(workspace_id) <= 100)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table ai_settings
      drop constraint if exists ai_settings_workspace_length,
      drop column if exists workspace_id
  `.execute(database);
}
