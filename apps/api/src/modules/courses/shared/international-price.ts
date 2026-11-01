import type { InternationalCoursePrice } from "@veolms/contracts";

/** The stored columns of a course's price for buyers outside India. */
export interface StoredInternationalPrice {
  pricing_type?: string | null;
  international_currency?: string | null;
  international_price_minor?: number | string | null;
  international_sale_price_minor?: number | string | null;
}

/**
 * A course's price for buyers outside India as every answer presents it, or
 * null when it is sold in rupees everywhere. Only a paid course has one: a
 * free course is free for everybody.
 */
export function presentInternationalPrice(
  row: StoredInternationalPrice,
): InternationalCoursePrice | null {
  const salePriceMinor = Number(row.international_sale_price_minor ?? 0);
  if (
    row.pricing_type !== "paid" ||
    !row.international_currency ||
    salePriceMinor <= 0
  ) {
    return null;
  }
  return {
    currency: row.international_currency,
    priceMinor: Math.max(
      salePriceMinor,
      Number(row.international_price_minor ?? 0),
    ),
    salePriceMinor,
  };
}
