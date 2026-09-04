import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("learning_space_sessions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "uuid", (column) =>
      column.references("course_lessons.id").onDelete("set null"),
    )
    .addColumn("lesson_number", "integer")
    .addColumn("origin", "text", (column) =>
      column.notNull().defaultTo("courses"),
    )
    .addColumn("return_path", "text", (column) =>
      column.notNull().defaultTo("/courses"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint("learning_space_sessions_user_course_unique", [
      "user_id",
      "course_id",
    ])
    .addCheckConstraint(
      "learning_space_sessions_lesson_number_valid",
      sql`lesson_number is null or lesson_number > 0`,
    )
    .addCheckConstraint(
      "learning_space_sessions_origin_valid",
      sql`origin in ('home', 'courses', 'wishlist')`,
    )
    .execute();

  await sql`
    create index idx_learning_space_sessions_user_updated
      on learning_space_sessions (user_id, updated_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_learning_space_sessions_user_updated`.execute(
    database,
  );
  await database.schema
    .dropTable("learning_space_sessions")
    .ifExists()
    .execute();
}
