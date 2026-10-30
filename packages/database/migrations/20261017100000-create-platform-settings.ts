import { sql, type Kysely } from "kysely";

/**
 * Academy-wide settings an administrator manages on the Platform page: the
 * default appearance every visitor sees and the sign-in and enrolment rules
 * for students.
 *
 * One row for the whole academy (the `id` check keeps it that way). The
 * settings are one JSON document validated by the API contract
 * (`platformSettingsSchema`); a missing row, or a setting the document does
 * not hold, means the built-in default applies.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists platform_settings (
      id boolean primary key default true check (id),
      settings jsonb not null,
      updated_by uuid references users(id) on delete set null,
      created_at timestamptz not null default current_timestamp,
      updated_at timestamptz not null default current_timestamp
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop table if exists platform_settings`.execute(database);
}
