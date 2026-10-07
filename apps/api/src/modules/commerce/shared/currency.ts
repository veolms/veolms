/**
 * Money conversion lives in `@veolms/contracts` (commerce/money.ts) so the
 * API and the web share one implementation. Stored order and price columns
 * are major units (499 means ₹499); payments, refunds and everything on a
 * gateway webhook are minor units (49900 paise). Any comparison between the
 * two MUST convert through these helpers first.
 */
export {
  formatMoney,
  minorUnitsPerMajor,
  toMajorUnits,
  toMinorUnits,
} from "@veolms/contracts";
