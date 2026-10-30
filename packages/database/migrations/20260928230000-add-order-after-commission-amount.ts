import { sql, type Kysely } from "kysely";

/**
 * Creator earnings after platform/PG commission (paise).
 * Sourced from TagMango transaction `afterCommissionAmount` on migrate;
 * null for live checkouts until earnings are attributed.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table orders
      add column if not exists after_commission_amount integer
  `.execute(database);

  await sql`
    alter table orders
      drop constraint if exists orders_after_commission_non_negative
  `.execute(database);

  await sql`
    alter table orders
      add constraint orders_after_commission_non_negative
      check (after_commission_amount is null or after_commission_amount >= 0)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table orders
      drop constraint if exists orders_after_commission_non_negative
  `.execute(database);

  await sql`
    alter table orders
      drop column if exists after_commission_amount
  `.execute(database);
}
