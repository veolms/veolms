import { sql, type Kysely } from "kysely";

/**
 * A course no longer has a separate free/paid choice: it is free exactly when
 * it sells for zero. `pricing_type` stays as a stored column (checkout, video
 * access and discussions read it) but must now always agree with the price,
 * so existing rows are brought in line.
 *
 * - Courses marked free keep a price of zero. Any price left on such a row is
 *   kept as the original (struck-through) price with a sale price of zero.
 * - Courses marked paid whose learners pay nothing become free.
 */
export async function up(database: Kysely<unknown>): Promise<void> {
  await sql`
    update course_pricing
    set sale_price = case when price > 0 then 0 else null end
    where pricing_type = 'free'
      and sale_price is distinct from (case when price > 0 then 0 else null end)
  `.execute(database);

  await sql`
    update course_pricing
    set pricing_type = 'free'
    where pricing_type = 'paid'
      and coalesce(sale_price, price) = 0
  `.execute(database);
}

/** The rows were made consistent, not restructured: nothing to undo. */
export async function down(): Promise<void> {}
