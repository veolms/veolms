import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("learning_progress")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "uuid", (column) =>
      column.notNull().references("course_lessons.id").onDelete("cascade"),
    )
    .addColumn("progress_percent", "integer", (column) =>
      column
        .notNull()
        .defaultTo(0)
        .check(sql`progress_percent between 0 and 100`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("learning_progress_user_course_lesson_unique", [
      "user_id",
      "course_id",
      "lesson_id",
    ])
    .execute();

  await sql`
    create index idx_learning_progress_user_course
      on learning_progress (user_id, course_id)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_learning_progress_user_course`.execute(
    database,
  );
  await database.schema.dropTable("learning_progress").ifExists().execute();
}
