import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("courses")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("slug", "text", (column) => column.notNull().unique())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("short_description", "text", (column) => column.notNull())
    .addColumn("description", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint("courses_title_nonempty", sql`char_length(trim(title)) > 0`)
    .addCheckConstraint("courses_status_valid", sql`status in ('draft', 'published', 'archived')`)
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("courses").execute();
}
