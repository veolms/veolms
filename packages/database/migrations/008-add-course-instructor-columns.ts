import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("courses")
    .addColumn("instructor_alias", "text")
    .execute();

  await database.schema
    .alterTable("course_settings")
    .addColumn("show_instructor_name", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .execute();

  // Backfill existing rows if any
  await sql`
    update course_settings
    set show_instructor_name = true
    where show_instructor_name is null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .alterTable("course_settings")
    .dropColumn("show_instructor_name")
    .execute();

  await database.schema
    .alterTable("courses")
    .dropColumn("instructor_alias")
    .execute();
}
