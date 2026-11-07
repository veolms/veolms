import { sql, type Kysely } from "kysely";

/**
 * Course-group messages are kept for 120 months (10 years), not 12. The
 * stored setting moves too when it was still the old default.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_settings
      alter column course_retention_months set default 120
  `.execute(database);
  await sql`
    update chat_settings
      set course_retention_months = 120, updated_at = current_timestamp
      where course_retention_months = 12
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table chat_settings
      alter column course_retention_months set default 12
  `.execute(database);
}
