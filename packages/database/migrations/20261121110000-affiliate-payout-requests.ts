import { sql, type Kysely } from "kysely";

/**
 * An affiliate asks for a payout with an Idempotency-Key (PRD section
 * 13.2): a repeated request with the same key (a double tap, a retry after a
 * lost answer) returns the same payout instead of being refused as a second
 * one. The key is kept on the payout, unique per affiliate.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table affiliate_payouts
      add column if not exists idempotency_key varchar(100)
  `.execute(database);
  await sql`
    create unique index if not exists affiliate_payouts_idempotency_key
      on affiliate_payouts (affiliate_id, idempotency_key)
      where idempotency_key is not null
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists affiliate_payouts_idempotency_key`.execute(
    database,
  );
  await sql`
    alter table affiliate_payouts drop column if exists idempotency_key
  `.execute(database);
}
