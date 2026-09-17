import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("course_settings")
    .addColumn("allow_notes", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("course_settings")
    .dropColumn("allow_notes")
    .execute();
}
