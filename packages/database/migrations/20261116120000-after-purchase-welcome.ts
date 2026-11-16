import { sql, type Kysely } from "kysely";

/**
 * What a buyer reads after paying, set per course and per workshop: a
 * short welcome message (with `{first_name}` filled in) and one optional
 * button, such as "Join our WhatsApp group". All three are optional; when
 * the message is empty the order page and the email show a default.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings
      add column if not exists welcome_message text,
      add column if not exists welcome_link_label text,
      add column if not exists welcome_link_url text
  `.execute(database);
  await sql`
    alter table workshops
      add column if not exists welcome_message text,
      add column if not exists welcome_link_label text,
      add column if not exists welcome_link_url text
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_settings
      drop column if exists welcome_message,
      drop column if exists welcome_link_label,
      drop column if exists welcome_link_url
  `.execute(database);
  await sql`
    alter table workshops
      drop column if exists welcome_message,
      drop column if exists welcome_link_label,
      drop column if exists welcome_link_url
  `.execute(database);
}
