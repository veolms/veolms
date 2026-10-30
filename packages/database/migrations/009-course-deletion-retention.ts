import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("course_deletion_jobs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().unique().references("courses.id").onDelete("cascade"),
    )
    .addColumn("scheduled_for", "timestamptz", (column) => column.notNull())
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("scheduled"),
    )
    .addColumn("attempt_count", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("next_attempt_at", "timestamptz")
    .addColumn("lease_until", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "course_deletion_jobs_status_valid",
      sql`status in ('scheduled', 'processing', 'failed')`,
    )
    .addCheckConstraint(
      "course_deletion_jobs_attempt_count_nonnegative",
      sql`attempt_count >= 0`,
    )
    .execute();

  await database.schema
    .createTable("course_deletion_storage_items")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    // Deliberately not a foreign key: the course and its deletion job are
    // removed before object-storage cleanup completes.
    .addColumn("course_id", "uuid", (column) => column.notNull())
    .addColumn("deletion_job_id", "uuid", (column) => column.notNull())
    .addColumn("storage_key", "text", (column) => column.notNull())
    .addColumn("delete_mode", "text", (column) =>
      column.notNull().defaultTo("object"),
    )
    .addColumn("status", "text", (column) =>
      column.notNull().defaultTo("scheduled"),
    )
    .addColumn("attempt_count", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("next_attempt_at", "timestamptz")
    .addColumn("lease_until", "timestamptz")
    .addColumn("last_error", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "course_deletion_storage_items_mode_valid",
      sql`delete_mode in ('object', 'prefix')`,
    )
    .addCheckConstraint(
      "course_deletion_storage_items_status_valid",
      sql`status in ('scheduled', 'processing', 'failed')`,
    )
    .addCheckConstraint(
      "course_deletion_storage_items_attempt_count_nonnegative",
      sql`attempt_count >= 0`,
    )
    .execute();

  await database.schema
    .createIndex("idx_course_deletion_jobs_due")
    .on("course_deletion_jobs")
    .columns(["status", "scheduled_for", "id"])
    .execute();

  await database.schema
    .createIndex("idx_course_deletion_jobs_lease")
    .on("course_deletion_jobs")
    .columns(["status", "lease_until"])
    .execute();

  await database.schema
    .createIndex("idx_course_deletion_storage_items_due")
    .on("course_deletion_storage_items")
    .columns(["status", "next_attempt_at", "created_at", "id"])
    .execute();

  await database.schema
    .createIndex("idx_course_deletion_storage_items_lease")
    .on("course_deletion_storage_items")
    .columns(["status", "lease_until"])
    .execute();

  await database.schema
    .createIndex("idx_courses_deleted_at")
    .on("courses")
    .column("deleted_at")
    .where("deleted_at", "is not", null)
    .execute();

  // These indexes keep the shared-media safety check bounded as the course
  // catalogue grows.
  await database.schema
    .createIndex("idx_courses_thumbnail_media_id")
    .on("courses")
    .column("thumbnail_media_id")
    .execute();
  await database.schema
    .createIndex("idx_courses_trailer_media_id")
    .on("courses")
    .column("trailer_media_id")
    .execute();
  await database.schema
    .createIndex("idx_course_lessons_content_media_id")
    .on("course_lessons")
    .column("content_media_id")
    .execute();

  // Courses soft-deleted before this retention workflow existed still need a
  // durable purge record. Reusing the course ID is safe because each course
  // can have only one active deletion job.
  await sql`
    insert into course_deletion_jobs
      (id, course_id, scheduled_for, status)
    select id, id, deleted_at + interval '30 days', 'scheduled'
    from courses
    where deleted_at is not null
    on conflict (course_id) do nothing
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropIndex("idx_course_lessons_content_media_id")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_courses_trailer_media_id")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_courses_thumbnail_media_id")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_courses_deleted_at")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_course_deletion_storage_items_lease")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_course_deletion_storage_items_due")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_course_deletion_jobs_lease")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_course_deletion_jobs_due")
    .ifExists()
    .execute();
  await database.schema
    .dropTable("course_deletion_storage_items")
    .ifExists()
    .execute();
  await database.schema.dropTable("course_deletion_jobs").execute();
}
