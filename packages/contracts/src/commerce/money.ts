/**
 * Money units, conversion and display — the single place every amount goes
 * through. Dependency-free on purpose so the web can import it from
 * `@veolms/contracts/commerce/money` without pulling in zod.
 *
 * Amounts are always whole numbers, in one of two units:
 *
 * - **minor** — the currency's smallest unit (49900 = ₹499.00). Everything
 *   that describes money that actually moved uses it: payments, refunds,
 *   gateway and webhook amounts, credit notes, order responses, invoices,
 *   order statistics and revenue analytics. All arithmetic and all
 *   aggregates on transacted money are done in minor units.
 *
 * - **major** — whole currency units (499 = ₹499). List prices use it: course,
 *   bundle and quiz prices, coupon discount/min/max amounts, the checkout
 *   preview, and — in storage only — the `orders` and `order_items` columns,
 *   which are converted to minor units before they leave the API.
 *
 * Mixing the two without converting is how a partial refund once looked like
 * a full one and how invoices showed ₹4.99 for a ₹499 order. Convert with
 * {@link toMinorUnits} / {@link toMajorUnits}; show with {@link formatMoney}.
 * Never divide or multiply by 100 anywhere else.
 */

export type MoneyUnit = "minor" | "major";

/** ISO 4217 currencies that have no minor unit (1 major = 1 minor). */
const ZERO_DECIMAL_CURRENCIES: ReadonlySet<string> = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "UGX",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

/** How many minor units make one major unit: 100 for INR, 1 for JPY. */
export function minorUnitsPerMajor(currency: string): number {
  return ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase()) ? 1 : 100;
}

/**
 * Converts a whole major-unit amount (a list price, a stored order total) to
 * minor units. Throws on a negative, fractional or unsafe value rather than
 * guessing — a wrong amount here is a wrong charge.
 */
export function toMinorUnits(amountMajor: number, currency: string): number {
  if (!Number.isSafeInteger(amountMajor) || amountMajor < 0) {
    throw new Error(`Invalid order amount: ${amountMajor}`);
  }

  const minorUnits = amountMajor * minorUnitsPerMajor(currency);

  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(
      `Order amount is too large for gateway: ${amountMajor} ${currency}`,
    );
  }

  return minorUnits;
}

/**
 * Converts minor units to major units for DISPLAY or for pre-filling an
 * input. The result can be fractional (10050 paise = 100.5), so it must not
 * be stored or used in further money arithmetic.
 */
export function toMajorUnits(amountMinor: number, currency: string): number {
  return amountMinor / minorUnitsPerMajor(currency);
}

export interface FormatMoneyOptions {
  /** ISO 4217 code. Defaults to INR. */
  currency?: string | undefined;
  /** Unit of the amount passed in. Defaults to minor units. */
  unit?: MoneyUnit | undefined;
  /**
   * - `"auto"` (default): no decimals for whole amounts (₹499), two when the
   *   amount has a fractional part (₹99.50).
   * - `"always"`: always the currency's decimals (₹499.00) — invoices.
   * - `"never"`: rounded to the whole unit (₹100) — compact summaries.
   */
  decimals?: "auto" | "always" | "never" | undefined;
  /** BCP 47 locale. Defaults to en-IN for INR, en-US otherwise. */
  locale?: string | undefined;
}

/**
 * Formats an amount for people to read. Takes minor units unless told
 * otherwise, so the usual call is `formatMoney(order.totalAmount, { currency })`.
 */
export function formatMoney(
  amount: number,
  options: FormatMoneyOptions = {},
): string {
  const currency = (options.currency ?? "INR").toUpperCase();
  const perMajor = minorUnitsPerMajor(currency);
  const value = options.unit === "major" ? amount : amount / perMajor;
  const currencyDecimals = perMajor === 1 ? 0 : 2;
  const decimals = options.decimals ?? "auto";

  const fractionDigits =
    decimals === "never"
      ? 0
      : decimals === "always"
        ? currencyDecimals
        : Number.isInteger(value)
          ? 0
          : currencyDecimals;

  return new Intl.NumberFormat(
    options.locale ?? (currency === "INR" ? "en-IN" : "en-US"),
    {
      style: "currency",
      currency,
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    },
  ).format(value);
}
