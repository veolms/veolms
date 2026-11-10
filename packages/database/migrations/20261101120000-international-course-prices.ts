import { sql, type Kysely } from "kysely";

/**
 * A course's price for buyers outside India, worked out from the day's
 * exchange rate or typed by staff in the course editor, and what a payment
 * in another currency settled for.
 *
 * `course_pricing.international_*`: the marked price and the sale price in
 * the currency's minor units (cents), so $43.99 is 4399. The rupee prices
 * beside them stay in whole rupees. All three are set or none is; a course
 * without them is sold in rupees everywhere. A linked-only course has no
 * price, so it has none either.
 *
 * `course_pricing.international_price_auto`: the price is the automatic
 * one (the rupee prices at the day's rate, rounded up to .99) and is worked
 * out again when the rupee prices change. False once staff type a price
 * or remove it. On by default, so a course priced from now on gets one.
 *
 * `orders.settlement_*`: for an order paid in another currency, the amount
 * the gateway settles it for in its own currency (Razorpay: rupees), in
 * minor units. Revenue reports count such an order through it. Null for an
 * order paid in the settlement currency itself.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing
      add column if not exists international_currency text,
      add column if not exists international_price_minor integer,
      add column if not exists international_sale_price_minor integer,
      add column if not exists international_price_auto boolean not null default true
  `.execute(database);
  await sql`
    alter table course_pricing
      drop constraint if exists course_pricing_international_rules
  `.execute(database);
  await sql`
    alter table course_pricing
      add constraint course_pricing_international_rules
      check (
        (
          international_currency is null
          and international_price_minor is null
          and international_sale_price_minor is null
        )
        or (
          international_currency is not null
          and char_length(international_currency) = 3
          and international_price_minor is not null
          and international_sale_price_minor is not null
          and international_sale_price_minor > 0
          and international_price_minor >= international_sale_price_minor
          and not linked_only
        )
      )
  `.execute(database);

  await sql`
    alter table orders
      add column if not exists settlement_amount integer,
      add column if not exists settlement_currency text
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table orders
      drop column if exists settlement_currency,
      drop column if exists settlement_amount
  `.execute(database);
  await sql`
    alter table course_pricing
      drop constraint if exists course_pricing_international_rules
  `.execute(database);
  await sql`
    alter table course_pricing
      drop column if exists international_price_auto,
      drop column if exists international_sale_price_minor,
      drop column if exists international_price_minor,
      drop column if exists international_currency
  `.execute(database);
}
