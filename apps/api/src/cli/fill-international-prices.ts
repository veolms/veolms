/* eslint-disable no-console -- an operator CLI: the terminal is its output */
/**
 * Gives every sold course whose price for buyers outside India is the
 * automatic one that price, from today's USD/INR rate (rounded up to .99).
 * A course priced from now on gets it when it is saved; this is for the
 * courses priced before the automatic price existed, and to bring automatic
 * prices to today's rate. Courses with a typed price are left alone.
 *
 *   pnpm --filter @veolms/api international-prices:fill --dry-run
 *   pnpm --filter @veolms/api international-prices:fill
 *
 * It writes the database directly: restart the API afterwards (its course
 * caches) and refresh the static course pages and the CDN's copies.
 */
import { createDatabase } from "@veolms/database";
import { config } from "../config.ts";
import {
  automaticInternationalPrice,
  exchangeRates,
} from "../modules/commerce/pricing/automatic-international-price.ts";

const dryRun = process.argv.includes("--dry-run");
const dollars = (cents: number | null) =>
  cents === null ? "—" : `$${(cents / 100).toFixed(2)}`;

const inrPerUsd = await exchangeRates.inrPerUsd();
if (!inrPerUsd) {
  console.error("No exchange rate could be had; nothing changed.");
  process.exit(1);
}
console.log(`Rate: ₹${inrPerUsd} per $1${dryRun ? " (dry run)" : ""}`);

const database = createDatabase(config.DATABASE_URL);
try {
  const rows = await database
    .selectFrom("course_pricing as cp")
    .innerJoin("courses as c", "c.id", "cp.course_id")
    .select([
      "cp.id",
      "c.slug",
      "cp.price",
      "cp.sale_price",
      "cp.international_price_minor",
      "cp.international_sale_price_minor",
    ])
    .where("c.deleted_at", "is", null)
    .where("cp.pricing_type", "=", "paid")
    .where("cp.sale_price", ">", 0)
    .where("cp.linked_only", "=", false)
    // The automatic price is worked out from rupees.
    .where("cp.currency", "=", "INR")
    .where("cp.international_price_auto", "=", true)
    .orderBy("c.slug")
    .execute();

  for (const row of rows) {
    const next = automaticInternationalPrice({
      salePrice: row.sale_price,
      price: Math.max(row.price, row.sale_price),
      inrPerUsd,
    });
    console.log(
      `${row.slug.padEnd(48)} ₹${row.sale_price} (₹${row.price})  ` +
        `${dollars(row.international_sale_price_minor)} → ${dollars(next.salePriceMinor)} ` +
        `(${dollars(row.international_price_minor)} → ${dollars(next.priceMinor)})`,
    );
    if (dryRun) continue;
    await database
      .updateTable("course_pricing")
      .set({
        international_currency: next.currency,
        international_price_minor: next.priceMinor,
        international_sale_price_minor: next.salePriceMinor,
        updated_at: new Date(),
      })
      .where("id", "=", row.id)
      .execute();
  }
  console.log(
    `${rows.length} course${rows.length === 1 ? "" : "s"} ${dryRun ? "would be" : ""} priced.`,
  );
} finally {
  await database.destroy();
}
