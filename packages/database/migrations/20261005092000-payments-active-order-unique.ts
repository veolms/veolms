import { sql, type Kysely } from "kysely";

/**
 * `payments.order_id` had no uniqueness at all, so two concurrent
 * initializePayment calls for the same order could each insert a payment row
 * (and each create a real gateway order). The user could then pay the
 * gateway order whose row was later overwritten, leaving captured money that
 * no webhook or recovery pass could match to a payment.
 *
 * Partial unique: only one ACTIVE (initiated/processing) payment per order.
 * Historical failed/captured/refunded rows are untouched, so this is safe on
 * existing data unless an order already has two concurrently-active rows —
 * exactly the corruption this prevents (resolve manually before migrating).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create unique index if not exists payments_active_order_unique
      on payments (order_id)
      where status in ('initiated', 'processing')
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`drop index if exists payments_active_order_unique`.execute(
    database,
  );
}
