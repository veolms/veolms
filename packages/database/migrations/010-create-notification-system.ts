import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_outbox_events_unprocessed`.execute(
    database,
  );

  await sql`
    alter table outbox_events
      rename column event_name to event_type
  `.execute(database);
  await sql`
    alter table outbox_events
      rename column error to last_error
  `.execute(database);
  await sql`
    alter table outbox_events
      add column event_version integer not null default 1,
      add column dedupe_key text,
      add column status text not null default 'pending',
      add column attempt_count integer not null default 0,
      add column available_at timestamptz not null default current_timestamp,
      add column locked_until timestamptz,
      add column occurred_at timestamptz not null default current_timestamp
  `.execute(database);

  await sql`
    update outbox_events
    set dedupe_key = 'legacy:' || id::text,
        status = case when processed_at is null then 'pending' else 'processed' end,
        occurred_at = created_at
  `.execute(database);

  await sql`
    alter table outbox_events
      alter column dedupe_key set not null,
      drop column aggregate_type,
      drop column aggregate_id,
      add constraint outbox_events_dedupe_key_unique unique (dedupe_key),
      add constraint outbox_events_status_valid
        check (status in ('pending', 'processing', 'processed', 'failed')),
      add constraint outbox_events_attempt_count_nonnegative
        check (attempt_count >= 0)
  `.execute(database);

  await database.schema
    .createTable("notifications")
    .addColumn("id", "uuid", (column) => column.primaryKey())
    // Deliberately not an FK: notification history survives outbox cleanup.
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
    .addUniqueConstraint("notifications_event_recipient_type_unique", [
      "source_event_id",
      "recipient_user_id",
      "type",
    ])
    .addCheckConstraint(
      "notifications_category_valid",
      sql`category in ('transactional', 'social', 'learning', 'system')`,
    )
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

  await database.schema
    .createIndex("idx_outbox_events_due")
    .on("outbox_events")
    .columns(["status", "available_at"])
    .execute();
  await database.schema
    .createIndex("idx_outbox_events_stale")
    .on("outbox_events")
    .columns(["status", "locked_until"])
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
  await sql`
    create index idx_notifications_recipient_created
      on notifications (recipient_user_id, created_at desc)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema
    .dropTable("notification_preferences")
    .ifExists()
    .execute();
  await database.schema
    .dropTable("notification_deliveries")
    .ifExists()
    .execute();
  await database.schema.dropTable("notifications").ifExists().execute();

  await sql`drop index if exists idx_outbox_events_due`.execute(database);
  await sql`drop index if exists idx_outbox_events_stale`.execute(database);

  await sql`
    alter table outbox_events
      drop constraint if exists outbox_events_dedupe_key_unique,
      drop constraint if exists outbox_events_status_valid,
      drop constraint if exists outbox_events_attempt_count_nonnegative,
      add column aggregate_type varchar(50),
      add column aggregate_id varchar(255)
  `.execute(database);
  await sql`
    update outbox_events
    set aggregate_type = 'legacy', aggregate_id = id::text
  `.execute(database);
  await sql`
    alter table outbox_events
      alter column aggregate_type set not null,
      alter column aggregate_id set not null,
      drop column event_version,
      drop column dedupe_key,
      drop column status,
      drop column attempt_count,
      drop column available_at,
      drop column locked_until,
      drop column occurred_at
  `.execute(database);
  await sql`
    alter table outbox_events rename column event_type to event_name
  `.execute(database);
  await sql`
    alter table outbox_events rename column last_error to error
  `.execute(database);
  await sql`
    create index idx_outbox_events_unprocessed
      on outbox_events (created_at) where processed_at is null
  `.execute(database);
}
