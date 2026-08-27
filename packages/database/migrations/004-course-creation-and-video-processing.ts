import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. Create categories table
  await database.schema
    .createTable("categories")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("name", "text", (column) => column.notNull().unique())
    .addColumn("slug", "text", (column) => column.notNull().unique())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  // 2. Create media_assets table
  await database.schema
    .createTable("media_assets")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("type", "text", (column) => column.notNull())
    .addColumn("storage_provider", "text", (column) => column.notNull())
    .addColumn("storage_key", "text", (column) => column.notNull().unique())
    .addColumn("original_filename", "text", (column) => column.notNull())
    .addColumn("mime_type", "text", (column) => column.notNull())
    .addColumn("size_bytes", "bigint", (column) => column.notNull())
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_seconds", "integer")
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "media_assets_status_valid",
      sql`status in ('uploading', 'ready', 'failed')`,
    )
    .execute();

  // 3. Alter courses table
  // Make short_description and description nullable for lightweight initial creation
  await sql`alter table courses alter column short_description drop not null`.execute(
    database,
  );
  await sql`alter table courses alter column description drop not null`.execute(
    database,
  );

  await database.schema
    .alterTable("courses")
    .addColumn("creator_id", "uuid", (column) =>
      column.references("users.id").onDelete("cascade"),
    )
    .addColumn("category_id", "uuid", (column) =>
      column.references("categories.id").onDelete("set null"),
    )
    .addColumn("difficulty", "text")
    .addColumn("thumbnail_media_id", "uuid", (column) =>
      column.references("media_assets.id").onDelete("set null"),
    )
    .addColumn("trailer_media_id", "uuid", (column) =>
      column.references("media_assets.id").onDelete("set null"),
    )
    .addColumn("version", "integer", (column) => column.notNull().defaultTo(1))
    .addColumn("published_at", "timestamptz")
    .addColumn("deleted_at", "timestamptz")
    .execute();

  // Add constraint for course difficulty
  await sql`
    alter table courses
      add constraint courses_difficulty_valid
      check (difficulty in ('beginner', 'intermediate', 'advanced'))
  `.execute(database);

  // 4. Create course_sections table
  await database.schema
    .createTable("course_sections")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("position", "integer", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  // 5. Create course_lessons table
  await database.schema
    .createTable("course_lessons")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("section_id", "uuid", (column) =>
      column.notNull().references("course_sections.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("content_type", "text", (column) => column.notNull())
    .addColumn("content_media_id", "uuid", (column) =>
      column.references("media_assets.id").onDelete("set null"),
    )
    .addColumn("position", "integer", (column) => column.notNull())
    .addColumn("is_preview", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("is_published", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .addCheckConstraint(
      "course_lessons_content_type_valid",
      sql`content_type in ('video', 'document')`,
    )
    .execute();

  // 6. Create lesson_resources table
  await database.schema
    .createTable("lesson_resources")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("lesson_id", "uuid", (column) =>
      column.notNull().references("course_lessons.id").onDelete("cascade"),
    )
    .addColumn("media_asset_id", "uuid", (column) =>
      column.notNull().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("description", "text")
    .addColumn("position", "integer", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  // 7. Create course_access_rules table
  await database.schema
    .createTable("course_access_rules")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().unique().references("courses.id").onDelete("cascade"),
    )
    .addColumn("access_type", "text", (column) => column.notNull())
    .addColumn("duration_type", "text", (column) => column.notNull())
    .addColumn("duration_days", "integer")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "course_access_rules_access_type_valid",
      sql`access_type in ('everyone', 'restricted')`,
    )
    .addCheckConstraint(
      "course_access_rules_duration_type_valid",
      sql`duration_type in ('lifetime', 'fixed_duration', 'custom_expiration')`,
    )
    .execute();

  // 8. Create course_pricing table
  await database.schema
    .createTable("course_pricing")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().unique().references("courses.id").onDelete("cascade"),
    )
    .addColumn("pricing_type", "text", (column) => column.notNull())
    .addColumn("price", "integer", (column) => column.notNull())
    .addColumn("currency", "text", (column) =>
      column.notNull().defaultTo("INR"),
    )
    .addColumn("sale_price", "integer")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint(
      "course_pricing_pricing_type_valid",
      sql`pricing_type in ('free', 'paid')`,
    )
    .execute();

  // 9. Create course_settings table
  await database.schema
    .createTable("course_settings")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().unique().references("courses.id").onDelete("cascade"),
    )
    .addColumn("allow_qa", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("allow_comments", "boolean", (column) =>
      column.notNull().defaultTo(true),
    )
    .addColumn("allow_downloads", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("certificate_enabled", "boolean", (column) =>
      column.notNull().defaultTo(false),
    )
    .addColumn("language", "text", (column) => column.notNull().defaultTo("en"))
    .addColumn("estimated_duration", "integer")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 10. Create video_jobs table
  await database.schema
    .createTable("video_jobs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("video_id", "uuid", (column) =>
      column.notNull().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("input_path", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("progress_percent", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("current_stage", "text", (column) => column.notNull())
    .addColumn("worker_id", "text")
    .addColumn("quality", sql`integer[]`, (column) =>
      column.notNull().defaultTo(sql`ARRAY[720]::integer[]`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("failed_at", "timestamptz")
    .addColumn("error", "text")
    .addCheckConstraint(
      "video_jobs_status_valid",
      sql`status in ('queued', 'processing', 'completed', 'failed')`,
    )
    .addCheckConstraint(
      "video_jobs_stage_valid",
      sql`current_stage in ('queued', 'downloading', 'transcoding', 'uploading', 'finalizing', 'completed', 'failed')`,
    )
    .execute();

  // 11. Create video_outputs table
  await database.schema
    .createTable("video_outputs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("video_id", "uuid", (column) =>
      column.notNull().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("master_playlist_path", "text", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  // 12. Create foreign-key indexes
  await database.schema
    .createIndex("idx_media_assets_owner_id")
    .on("media_assets")
    .column("owner_id")
    .execute();

  await database.schema
    .createIndex("idx_courses_creator_id")
    .on("courses")
    .column("creator_id")
    .execute();

  await database.schema
    .createIndex("idx_courses_category_id")
    .on("courses")
    .column("category_id")
    .execute();

  await database.schema
    .createIndex("idx_course_sections_course_id")
    .on("course_sections")
    .column("course_id")
    .execute();

  await database.schema
    .createIndex("idx_course_lessons_course_id")
    .on("course_lessons")
    .column("course_id")
    .execute();

  await database.schema
    .createIndex("idx_course_lessons_section_id")
    .on("course_lessons")
    .column("section_id")
    .execute();

  await database.schema
    .createIndex("idx_lesson_resources_lesson_id")
    .on("lesson_resources")
    .column("lesson_id")
    .execute();

  await database.schema
    .createIndex("idx_lesson_resources_media_asset_id")
    .on("lesson_resources")
    .column("media_asset_id")
    .execute();

  await database.schema
    .createIndex("idx_video_jobs_video_id")
    .on("video_jobs")
    .column("video_id")
    .execute();

  await database.schema
    .createIndex("idx_video_outputs_video_id")
    .on("video_outputs")
    .column("video_id")
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("video_outputs").execute();
  await database.schema.dropTable("video_jobs").execute();
  await database.schema.dropTable("course_settings").execute();
  await database.schema.dropTable("course_pricing").execute();
  await database.schema.dropTable("course_access_rules").execute();
  await database.schema.dropTable("lesson_resources").execute();
  await database.schema.dropTable("course_lessons").execute();
  await database.schema.dropTable("course_sections").execute();

  // Drop courses FK indexes before dropping columns
  await database.schema
    .dropIndex("idx_courses_creator_id")
    .ifExists()
    .execute();
  await database.schema
    .dropIndex("idx_courses_category_id")
    .ifExists()
    .execute();

  // Revert course alterations
  await sql`alter table courses drop constraint if exists courses_difficulty_valid`.execute(
    database,
  );
  await database.schema
    .alterTable("courses")
    .dropColumn("creator_id")
    .dropColumn("category_id")
    .dropColumn("difficulty")
    .dropColumn("thumbnail_media_id")
    .dropColumn("trailer_media_id")
    .dropColumn("version")
    .dropColumn("published_at")
    .dropColumn("deleted_at")
    .execute();

  // Backfill NULLs before restoring NOT NULL constraints
  await sql`update courses set short_description = coalesce(short_description, '') where short_description is null`.execute(
    database,
  );
  await sql`update courses set description = coalesce(description, '') where description is null`.execute(
    database,
  );

  await sql`alter table courses alter column short_description set not null`.execute(
    database,
  );
  await sql`alter table courses alter column description set not null`.execute(
    database,
  );

  await database.schema.dropTable("media_assets").execute();
  await database.schema.dropTable("categories").execute();
}
