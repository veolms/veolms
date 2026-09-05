import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // Add idempotency_key column to media_assets table for idempotent request handling
  await sql`
    alter table media_assets
      add column idempotency_key varchar(255) nullable
  `.execute(database);

  // Create unique index on (owner_id, idempotency_key) for idempotency enforcement.
  // This ensures:
  // 1. Only one media asset can be created per idempotency key per user
  // 2. If two concurrent requests arrive with same key, the database constraint
  //    prevents the second from inserting, allowing us to detect and handle the race
  // 3. The index is partial (WHERE idempotency_key IS NOT NULL) so null values
  //    (requests without idempotency key) don't conflict with each other
  await sql`
    create unique index media_assets_owner_idempotency_unique
      on media_assets(owner_id, idempotency_key)
      where idempotency_key is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Drop the unique index
  await sql`
    drop index if exists media_assets_owner_idempotency_unique
  `.execute(database);

  // Remove the idempotency_key column
  await sql`
    alter table media_assets
      drop column idempotency_key
  `.execute(database);
}
