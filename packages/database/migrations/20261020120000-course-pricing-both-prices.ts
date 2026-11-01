import { sql, type Kysely } from "kysely";

/**
 * A course's price is always both numbers: `sale_price`, what a learner
 * pays (zero makes the course free), and `price`, the marked price it is
 * struck through from, never below it. No discount is the two being equal.
 *
 * Rows that held one number only (`sale_price` null: imported courses, and
 * prices saved without an original price) are read as having no discount,
 * which is how every page showed them. A row whose sale price was above its
 * price is repaired by raising the price to it. The pricing type is then
 * the one the API derives (free exactly when it sells for zero), and a
 * discount badge without a discount is switched off.
 *
 * The constraint keeps every later write to this shape, whatever writes it
 * (the course editor, an import script, a hand-written update).
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update course_pricing
    set sale_price = case when pricing_type = 'free' then 0 else price end
    where sale_price is null
  `.execute(database);
  await sql`
    update course_pricing set price = sale_price where sale_price > price
  `.execute(database);
  await sql`
    update course_pricing
    set pricing_type = case when sale_price = 0 then 'free' else 'paid' end
    where pricing_type is distinct from
      (case when sale_price = 0 then 'free' else 'paid' end)
  `.execute(database);
  await sql`
    update course_pricing set show_discount_badge = false
    where show_discount_badge and price <= sale_price
  `.execute(database);

  await sql`
    alter table course_pricing alter column sale_price set not null
  `.execute(database);
  await sql`
    alter table course_pricing
    add constraint course_pricing_sale_price_rules check (
      sale_price >= 0
      and sale_price <= price
      and (pricing_type = 'free') = (sale_price = 0)
    )
  `.execute(database);
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await sql`
    alter table course_pricing
    drop constraint if exists course_pricing_sale_price_rules
  `.execute(database);
  await sql`
    alter table course_pricing alter column sale_price drop not null
  `.execute(database);
}
