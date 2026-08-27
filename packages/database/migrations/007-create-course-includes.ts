import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("course_includes")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("text", "text", (column) => column.notNull())
    .addColumn("icon", "text")
    .addColumn("position", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_course_includes_course_id")
    .on("course_includes")
    .column("course_id")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("course_includes").execute();
}
