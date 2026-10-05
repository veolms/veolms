/**
 * Course/order pricing is stored in major currency units (499 means ₹499),
 * while payment gateways — and therefore `payments.amount`, `refunds.amount`
 * and every amount arriving on a gateway webhook — use the currency's
 * smallest unit (49900 paise). Any comparison between the two MUST convert
 * through this helper first; comparing them raw misclassifies a 1% partial
 * refund as a full refund (and vice versa).
 */
const ZERO_DECIMAL_CURRENCIES = new Set([
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

export function toMinorUnits(amount: number, currency: string): number {
  if (!Number.isSafeInteger(amount) || amount < 0) {
    throw new Error(`Invalid order amount: ${amount}`);
  }

  const multiplier = ZERO_DECIMAL_CURRENCIES.has(currency.toUpperCase())
    ? 1
    : 100;
  const minorUnits = amount * multiplier;

  if (!Number.isSafeInteger(minorUnits)) {
    throw new Error(
      `Order amount is too large for gateway: ${amount} ${currency}`,
    );
  }

  return minorUnits;
}
