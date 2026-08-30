import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // 1. learning_threads
  await database.schema
    .createTable("learning_threads")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("academy_id", "uuid", (column) =>
      column.notNull().references("academy.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "uuid", (column) =>
      column.references("course_lessons.id").onDelete("cascade"),
    )
    .addColumn("assignment_id", "uuid")
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("kind", "text", (column) =>
      column
        .notNull()
        .defaultTo("comment")
        .check(sql`kind IN ('comment', 'question', 'note')`),
    )
    .addColumn("title", "text")
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("plain_text", "text", (column) => column.notNull())
    .addColumn("timestamp_seconds", "integer", (column) =>
      column.check(sql`timestamp_seconds IS NULL OR timestamp_seconds >= 0`),
    )
    .addColumn("visibility", "text", (column) =>
      column
        .notNull()
        .defaultTo("public")
        .check(sql`visibility IN ('public', 'unlisted', 'private')`),
    )
    .addColumn("status", "text", (column) =>
      column
        .notNull()
        .defaultTo("active")
        .check(sql`status IN ('active', 'hidden', 'deleted')`),
    )
    .addColumn("is_locked", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("accepted_answer_id", "uuid")
    .addColumn("likes_count", "integer", (column) =>
      column.notNull().defaultTo(0).check(sql`likes_count >= 0`),
    )
    .addColumn("replies_count", "integer", (column) =>
      column.notNull().defaultTo(0).check(sql`replies_count >= 0`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await database.schema
    .createIndex("idx_learning_threads_lesson_status")
    .on("learning_threads")
    .columns(["lesson_id", "status", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_learning_threads_assignment_status")
    .on("learning_threads")
    .columns(["assignment_id", "status", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_learning_threads_course_kind")
    .on("learning_threads")
    .columns(["course_id", "kind", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_learning_threads_user")
    .on("learning_threads")
    .columns(["user_id", "created_at"])
    .execute();

  // 2. learning_replies
  await database.schema
    .createTable("learning_replies")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("thread_id", "uuid", (column) =>
      column.notNull().references("learning_threads.id").onDelete("cascade"),
    )
    .addColumn("parent_reply_id", "uuid", (column) =>
      column.references("learning_replies.id").onDelete("cascade"),
    )
    .addColumn("reply_to_reply_id", "uuid", (column) =>
      column.references("learning_replies.id").onDelete("set null"),
    )
    .addColumn("reply_to_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("plain_text", "text", (column) => column.notNull())
    .addColumn("timestamp_seconds", "integer", (column) =>
      column.check(sql`timestamp_seconds IS NULL OR timestamp_seconds >= 0`),
    )
    .addColumn("is_accepted", "boolean", (column) => column.notNull().defaultTo(false))
    .addColumn("status", "text", (column) =>
      column
        .notNull()
        .defaultTo("active")
        .check(sql`status IN ('active', 'hidden', 'deleted')`),
    )
    .addColumn("likes_count", "integer", (column) =>
      column.notNull().defaultTo(0).check(sql`likes_count >= 0`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await database.schema
    .createIndex("idx_learning_replies_thread_status")
    .on("learning_replies")
    .columns(["thread_id", "status", "created_at"])
    .execute();

  await database.schema
    .createIndex("idx_learning_replies_reply_to")
    .on("learning_replies")
    .columns(["reply_to_reply_id"])
    .execute();

  // Foreign key for accepted_answer_id on learning_threads
  await database.schema
    .alterTable("learning_threads")
    .addForeignKeyConstraint(
      "fk_learning_threads_accepted_answer",
      ["accepted_answer_id"],
      "learning_replies",
      ["id"],
      (cb) => cb.onDelete("set null"),
    )
    .execute();

  // 3. learning_likes
  await database.schema
    .createTable("learning_likes")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("target_type", "text", (column) =>
      column.notNull().check(sql`target_type IN ('thread', 'reply')`),
    )
    .addColumn("target_id", "uuid", (column) => column.notNull())
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_likes_unique")
    .on("learning_likes")
    .columns(["user_id", "target_type", "target_id"])
    .unique()
    .execute();

  // 4. learning_bookmarks
  await database.schema
    .createTable("learning_bookmarks")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("thread_id", "uuid", (column) =>
      column.notNull().references("learning_threads.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_bookmarks_unique")
    .on("learning_bookmarks")
    .columns(["user_id", "thread_id"])
    .unique()
    .execute();

  // 5. learning_follows
  await database.schema
    .createTable("learning_follows")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("thread_id", "uuid", (column) =>
      column.notNull().references("learning_threads.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_follows_unique")
    .on("learning_follows")
    .columns(["user_id", "thread_id"])
    .unique()
    .execute();

  // 6. learning_mentions
  await database.schema
    .createTable("learning_mentions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("source_type", "text", (column) =>
      column.notNull().check(sql`source_type IN ('thread', 'reply')`),
    )
    .addColumn("source_id", "uuid", (column) => column.notNull())
    .addColumn("mentioned_user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_mentions_unique")
    .on("learning_mentions")
    .columns(["source_type", "source_id", "mentioned_user_id"])
    .unique()
    .execute();

  // 7. learning_notes
  await database.schema
    .createTable("learning_notes")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("academy_id", "uuid", (column) =>
      column.notNull().references("academy.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.notNull().references("courses.id").onDelete("cascade"),
    )
    .addColumn("lesson_id", "uuid", (column) =>
      column.notNull().references("course_lessons.id").onDelete("cascade"),
    )
    .addColumn("timestamp_seconds", "integer", (column) =>
      column.check(sql`timestamp_seconds IS NULL OR timestamp_seconds >= 0`),
    )
    .addColumn("title", "text")
    .addColumn("content", "text", (column) => column.notNull())
    .addColumn("plain_text", "text", (column) => column.notNull())
    .addColumn("tags", sql`text[]`, (column) =>
      column.notNull().defaultTo(sql`ARRAY[]::text[]`),
    )
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("deleted_at", "timestamptz")
    .execute();

  await database.schema
    .createIndex("idx_learning_notes_user_lesson")
    .on("learning_notes")
    .columns(["user_id", "lesson_id", "created_at"])
    .execute();

  // 8. learning_attachments
  await database.schema
    .createTable("learning_attachments")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("owner_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("target_type", "text", (column) =>
      column.check(sql`target_type IS NULL OR target_type IN ('thread', 'reply')`),
    )
    .addColumn("target_id", "uuid")
    .addColumn("kind", "text", (column) =>
      column
        .notNull()
        .check(sql`kind IN ('image', 'screenshot', 'code', 'document')`),
    )
    .addColumn("storage_key", "text", (column) => column.notNull())
    .addColumn("file_name", "text", (column) => column.notNull())
    .addColumn("file_url", "text", (column) => column.notNull())
    .addColumn("mime_type", "text", (column) => column.notNull())
    .addColumn("file_size", "integer", (column) =>
      column.notNull().check(sql`file_size >= 0`),
    )
    .addColumn("status", "text", (column) =>
      column
        .notNull()
        .defaultTo("ready")
        .check(sql`status IN ('uploading', 'ready', 'rejected', 'deleted')`),
    )
    .addColumn("metadata", "jsonb")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_attachments_target")
    .on("learning_attachments")
    .columns(["target_type", "target_id"])
    .execute();

  await database.schema
    .createIndex("idx_learning_attachments_owner")
    .on("learning_attachments")
    .columns(["owner_id", "status"])
    .execute();

  // 9. learning_reports
  await database.schema
    .createTable("learning_reports")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("course_id", "uuid", (column) =>
      column.references("courses.id").onDelete("cascade"),
    )
    .addColumn("reporter_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("target_type", "text", (column) =>
      column.notNull().check(sql`target_type IN ('thread', 'reply')`),
    )
    .addColumn("target_id", "uuid", (column) => column.notNull())
    .addColumn("reason", "text", (column) =>
      column
        .notNull()
        .check(
          sql`reason IN ('spam', 'harassment', 'inappropriate', 'misinformation', 'copyright', 'other')`,
        ),
    )
    .addColumn("details", "text")
    .addColumn("status", "text", (column) =>
      column
        .notNull()
        .defaultTo("pending")
        .check(sql`status IN ('pending', 'reviewed', 'dismissed', 'actioned')`),
    )
    .addColumn("reviewed_by_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("action_taken", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_reports_unique_pending")
    .on("learning_reports")
    .columns(["reporter_id", "target_type", "target_id", "status"])
    .execute();

  // 10. learning_suspensions
  await database.schema
    .createTable("learning_suspensions")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("academy_id", "uuid", (column) =>
      column.notNull().references("academy.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.references("courses.id").onDelete("cascade"),
    )
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("suspended_by_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("scope", "text", (column) =>
      column
        .notNull()
        .defaultTo("all")
        .check(sql`scope IN ('commenting', 'qa', 'all')`),
    )
    .addColumn("reason", "text", (column) => column.notNull())
    .addColumn("expires_at", "timestamptz")
    .addColumn("is_active", "boolean", (column) => column.notNull().defaultTo(true))
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_suspensions_user_scope")
    .on("learning_suspensions")
    .columns(["user_id", "is_active", "scope"])
    .execute();

  // 11. learning_audit_logs
  await database.schema
    .createTable("learning_audit_logs")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("academy_id", "uuid", (column) =>
      column.notNull().references("academy.id").onDelete("cascade"),
    )
    .addColumn("course_id", "uuid", (column) =>
      column.references("courses.id").onDelete("cascade"),
    )
    .addColumn("actor_user_id", "uuid", (column) =>
      column.references("users.id").onDelete("set null"),
    )
    .addColumn("action", "text", (column) => column.notNull())
    .addColumn("target_type", "text", (column) => column.notNull())
    .addColumn("target_id", "uuid", (column) => column.notNull())
    .addColumn("details", "jsonb")
    .addColumn("ip_address", "text")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .execute();

  await database.schema
    .createIndex("idx_learning_audit_logs_actor")
    .on("learning_audit_logs")
    .columns(["actor_user_id", "created_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("learning_audit_logs").ifExists().execute();
  await database.schema.dropTable("learning_suspensions").ifExists().execute();
  await database.schema.dropTable("learning_reports").ifExists().execute();
  await database.schema.dropTable("learning_attachments").ifExists().execute();
  await database.schema.dropTable("learning_notes").ifExists().execute();
  await database.schema.dropTable("learning_mentions").ifExists().execute();
  await database.schema.dropTable("learning_follows").ifExists().execute();
  await database.schema.dropTable("learning_bookmarks").ifExists().execute();
  await database.schema.dropTable("learning_likes").ifExists().execute();
  await database.schema.dropTable("learning_replies").ifExists().execute();
  await database.schema.dropTable("learning_threads").ifExists().execute();
}
