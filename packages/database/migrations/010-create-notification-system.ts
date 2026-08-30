import { sql, type Kysely } from "kysely";

/**
 * Creates the durable notification record, delivery-attempt, and preference
 * tables. Keep this migration name stable: it has already been applied to
 * existing databases and Kysely uses the name as the migration identity.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .createTable("notifications")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("source_event_id", "uuid", (column) => column.notNull())
    .addColumn("recipient_user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("type", "text", (column) => column.notNull())
    .addColumn("category", "text", (column) => column.notNull())
    .addColumn("title", "text", (column) => column.notNull())
    .addColumn("body", "text", (column) => column.notNull())
    .addColumn("deep_link", "text")
    .addColumn("read_at", "timestamptz")
    .addColumn("archived_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint(
      "notifications_event_recipient_type_unique",
      ["source_event_id", "recipient_user_id", "type"],
    )
    .addCheckConstraint(
      "notifications_category_valid",
      sql`category in ('transactional', 'social', 'learning', 'system')`,
    )
    .execute();

  await database.schema
    .createIndex("idx_notifications_recipient_created")
    .on("notifications")
    .columns(["recipient_user_id", sql`created_at desc`])
    .execute();

  await database.schema
    .createTable("notification_deliveries")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("notification_id", "uuid", (column) =>
      column.notNull().references("notifications.id").onDelete("cascade"),
    )
    .addColumn("channel", "text", (column) => column.notNull())
    .addColumn("status", "text", (column) => column.notNull())
    .addColumn("destination", "text")
    .addColumn("payload", "jsonb")
    .addColumn("attempt_count", "integer", (column) =>
      column.notNull().defaultTo(0),
    )
    .addColumn("next_attempt_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("locked_until", "timestamptz")
    .addColumn("provider_message_id", "text")
    .addColumn("last_error", "text")
    .addColumn("sent_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addUniqueConstraint(
      "notification_deliveries_notification_channel_unique",
      ["notification_id", "channel"],
    )
    .addCheckConstraint(
      "notification_deliveries_channel_valid",
      sql`channel in ('in_app', 'email')`,
    )
    .addCheckConstraint(
      "notification_deliveries_status_valid",
      sql`status in ('pending', 'processing', 'sent', 'failed', 'skipped')`,
    )
    .addCheckConstraint(
      "notification_deliveries_attempt_count_nonnegative",
      sql`attempt_count >= 0`,
    )
    .execute();

  await database.schema
    .createIndex("idx_notification_deliveries_due")
    .on("notification_deliveries")
    .columns(["channel", "status", "next_attempt_at"])
    .execute();

  await database.schema
    .createIndex("idx_notification_deliveries_stale")
    .on("notification_deliveries")
    .columns(["status", "locked_until"])
    .execute();

  await database.schema
    .createTable("notification_preferences")
    .addColumn("user_id", "uuid", (column) =>
      column.notNull().references("users.id").onDelete("cascade"),
    )
    .addColumn("notification_type", "text", (column) => column.notNull())
    .addColumn("channel", "text", (column) => column.notNull())
    .addColumn("enabled", "boolean", (column) => column.notNull())
    .addPrimaryKeyConstraint("notification_preferences_primary", [
      "user_id",
      "notification_type",
      "channel",
    ])
    .addCheckConstraint(
      "notification_preferences_channel_valid",
      sql`channel in ('in_app', 'email')`,
    )
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("notification_preferences").execute();
  await database.schema.dropTable("notification_deliveries").execute();
  await database.schema.dropTable("notifications").execute();
}
