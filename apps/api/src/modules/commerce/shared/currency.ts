/**
 * Money conversion lives in `@veolms/contracts` (commerce/money.ts) so the
 * API and the web share one implementation.
 *
 * Transacted money is stored in minor units (49900 = ₹499): orders, order
 * items, coupon redemptions, payments, refunds, credit notes and everything
 * on a gateway webhook. Catalog prices an admin types (course, bundle and
 * quiz prices, coupon values, the pricing preview) are whole major units;
 * they are converted once, when an order is written.
 */
export {
  formatMoney,
  minorUnitsPerMajor,
  pricingAmountToMinorUnits,
  toMajorUnits,
  toMinorUnits,
} from "@veolms/contracts";
