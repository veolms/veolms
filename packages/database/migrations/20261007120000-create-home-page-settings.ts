import { sql, type Kysely } from "kysely";

/**
 * The signed-out home page, as the academy admin configures it: hero copy,
 * highlight cards, which courses each row shows and which discussions are
 * pinned or hidden.
 *
 * One row for the whole academy (the `id` check keeps it that way). The
 * settings are stored as one JSON document validated by the API contract
 * (`homePageSettingsSchema`): they are always read and written whole, and a
 * missing row means "use the built-in defaults".
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists home_page_settings (
      id boolean primary key default true check (id),
      settings jsonb not null,
      updated_by uuid references users(id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists home_page_settings`.execute(database);
}
