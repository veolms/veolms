import { sql, type Kysely } from "kysely";

/**
 * Transacted money is stored in minor units (49900 = ₹499), like payments,
 * refunds and credit notes already were. Until now order totals, order
 * items and coupon redemptions held whole major units (499), and every
 * reader converted. Catalog prices an admin types (course, bundle and quiz
 * prices, coupon values) stay in major units; checkout converts them once
 * when it writes the order.
 *
 * Which orders are converted: every order, unless it already holds minor
 * units, as an import from another platform may have written it. Two
 * things show that, and nothing checkout writes has either:
 *
 * - a payment for exactly the order's non-zero total. A major-unit order's
 *   payment is 100 times its total, because the gateway charges minor units.
 * - for an order of nothing (a full discount), a payment through a real
 *   gateway. Checkout records a free order with a "free" payment.
 *
 * Such an already-minor order also had its invoice PDF made from amounts
 * read as major units (100 times too large), so its stored PDF is dropped
 * and made again, under the same invoice number, on its next download.
 *
 * The converted orders are listed in `order_amount_unit_conversions`, so
 * `down` undoes exactly what `up` did.
 */
const ORDER_COLUMNS = [
  "subtotal_amount",
  "discount_amount",
  "tax_amount",
  "total_amount",
  "cgst_amount",
  "sgst_amount",
  "igst_amount",
] as const;

const ORDER_ITEM_COLUMNS = [
  "unit_price",
  "discount_amount",
  "tax_amount",
  "final_amount",
  "cgst_amount",
  "sgst_amount",
  "igst_amount",
] as const;

function scale(
  columns: readonly string[],
  operator: "*" | "/",
): ReturnType<typeof sql.raw> {
  return sql.raw(
    columns.map((column) => `${column} = ${column} ${operator} 100`).join(", "),
  );
}

export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    create table if not exists order_amount_unit_conversions (
      order_id uuid primary key
    )
  `.execute(database);

  // Orders still in major units: neither sign of an already-minor order.
  await sql`
    insert into order_amount_unit_conversions (order_id)
    select o.id from orders o
    where not exists (
      select 1 from payments p
      where p.order_id = o.id
        and (
          (o.total_amount > 0 and p.amount = o.total_amount)
          or (o.total_amount = 0 and p.gateway_provider <> 'free')
        )
    )
    on conflict do nothing
  `.execute(database);

  await sql`
    update orders set ${scale(ORDER_COLUMNS, "*")}
    where id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  await sql`
    update order_items set ${scale(ORDER_ITEM_COLUMNS, "*")}
    where order_id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  await sql`
    update coupon_redemptions set discount_amount = discount_amount * 100
    where order_id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  // Already-minor orders: their invoice PDFs showed amounts 100x too large.
  await sql`
    update orders set invoice_pdf_key = null
    where invoice_pdf_key is not null
      and id not in (select order_id from order_amount_unit_conversions)
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    update orders set ${scale(ORDER_COLUMNS, "/")}
    where id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  await sql`
    update order_items set ${scale(ORDER_ITEM_COLUMNS, "/")}
    where order_id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  await sql`
    update coupon_redemptions set discount_amount = discount_amount / 100
    where order_id in (select order_id from order_amount_unit_conversions)
  `.execute(database);

  await sql`drop table if exists order_amount_unit_conversions`.execute(
    database,
  );
}
