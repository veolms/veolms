/**
 * What a course's status means for someone trying to buy it:
 *
 *  - `on_sale`: published. It can be bought, on its own or in a bundle.
 *  - `archived`: no longer sold. Those who already have it keep it; nobody
 *    can start or continue a purchase of it, or of a bundle that holds it.
 *  - `hidden`: a draft, missing, or anything else. Answered like a course
 *    that does not exist, so nothing about it is disclosed.
 */
export type CourseSaleState = "on_sale" | "archived" | "hidden";

export function courseSaleState(
  status: string | null | undefined,
): CourseSaleState {
  if (status === "published") return "on_sale";
  if (status === "archived") return "archived";
  return "hidden";
}

/**
 * What a course costs before any coupon or voluntary amount, and whether it
 * is a paid course at all.
 *
 * A course is free exactly when it sells for nothing: a sale price of zero
 * makes a priced course free, whatever `pricing_type` was stored with it.
 * It is then enrolled in without paying, like any free course, and the
 * rules for free courses apply to it (a restricted one is entered by a
 * grant from staff only; a coupon has nothing to take off).
 */
export function resolveCoursePricing(
  pricing:
    | {
        pricing_type: string | null | undefined;
        price: number;
        sale_price: number | null | undefined;
      }
    | null
    | undefined,
): { pricingType: "free" | "paid"; catalogPrice: number } {
  if (!pricing || pricing.pricing_type !== "paid") {
    return { pricingType: "free", catalogPrice: 0 };
  }
  const catalogPrice = Math.max(0, pricing.sale_price ?? pricing.price);
  return catalogPrice > 0
    ? { pricingType: "paid", catalogPrice }
    : { pricingType: "free", catalogPrice: 0 };
}

/**
 * What a course costs a buyer outside India: its price for buyers there, in
 * the currency's minor units (cents), or null when it is sold in rupees
 * everywhere. Asked only for a paid course: a free course is free for all.
 */
export function resolveInternationalCharge(
  pricing:
    | {
        international_currency?: string | null;
        international_sale_price_minor?: number | null;
      }
    | null
    | undefined,
): { currency: string; salePriceMinor: number } | null {
  const salePriceMinor = Number(pricing?.international_sale_price_minor ?? 0);
  if (!pricing?.international_currency || salePriceMinor <= 0) return null;
  return { currency: pricing.international_currency, salePriceMinor };
}
