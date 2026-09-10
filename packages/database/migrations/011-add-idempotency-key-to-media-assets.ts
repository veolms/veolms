import { sql, type Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // Add idempotency_key column to media_assets
  await sql`
    alter table media_assets
      add column idempotency_key varchar(255) null
  `.execute(database);

  // Create unique index on (owner_id, idempotency_key) for idempotency enforcement
  await sql`
    create unique index media_assets_owner_idempotency_key_idx
      on media_assets(owner_id, idempotency_key)
      where idempotency_key is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  // Drop the unique index
  await sql`
    drop index if exists media_assets_owner_idempotency_key_idx
  `.execute(database);

  // Drop the idempotency_key column
  await sql`
    alter table media_assets
      drop column idempotency_key
  `.execute(database);
}
