import { sql, type Kysely } from "kysely";

/**
 * Client-supplied idempotency key for admin-initiated refunds. Scoped per
 * order: a retried or double-submitted request carrying the same key
 * resolves to the refund row it already created instead of reserving (and
 * sending to the gateway) a second one. Partial so refunds without a key
 * (webhook-created, legacy callers) are unaffected.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table refunds add column if not exists idempotency_key text
  `.execute(database);

  await sql`
    create unique index if not exists idx_refunds_order_idempotency_key
      on refunds (order_id, idempotency_key)
      where idempotency_key is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists idx_refunds_order_idempotency_key`.execute(
    database,
  );
  await sql`alter table refunds drop column if exists idempotency_key`.execute(
    database,
  );
}
