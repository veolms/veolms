import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE course_settings
    ADD COLUMN IF NOT EXISTS allow_notes BOOLEAN NOT NULL DEFAULT true;
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    ALTER TABLE course_settings
    DROP COLUMN IF EXISTS allow_notes;
  `.execute(database);
}
