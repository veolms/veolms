import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`alter table media_assets add column if not exists metadata jsonb not null default '{}'::jsonb`.execute(database);
  await sql`alter table media_assets drop constraint if exists media_assets_status_valid`.execute(database);
  await sql`
    alter table media_assets add constraint media_assets_status_valid
    check (status in ('uploading', 'uploaded', 'processing', 'ready', 'failed'))
  `.execute(database);

  await database.schema
    .createTable("image_jobs")
    .ifNotExists()
    .addColumn("id", "uuid", (column) => column.primaryKey())
    .addColumn("media_id", "uuid", (column) =>
      column.notNull().unique().references("media_assets.id").onDelete("cascade"),
    )
    .addColumn("status", "text", (column) => column.notNull().defaultTo("queued"))
    .addColumn("attempts", "integer", (column) => column.notNull().defaultTo(0))
    .addColumn("error_message", "text")
    .addColumn("started_at", "timestamptz")
    .addColumn("completed_at", "timestamptz")
    .addColumn("created_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addColumn("updated_at", "timestamptz", (column) =>
      column.notNull().defaultTo(sql`CURRENT_TIMESTAMP`),
    )
    .addCheckConstraint("image_jobs_status_valid", sql`status in ('queued', 'processing', 'completed', 'failed')`)
    .execute();
  await database.schema
    .createIndex("idx_image_jobs_queue")
    .ifNotExists()
    .on("image_jobs")
    .columns(["status", "created_at"])
    .execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("image_jobs").ifExists().execute();
  await sql`alter table media_assets drop column if exists metadata`.execute(database);
}
