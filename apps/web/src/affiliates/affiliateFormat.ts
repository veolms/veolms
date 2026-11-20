import { formatMoney } from "@veolms/contracts/commerce/money";

/** "20%", or "₹100" for a fixed amount. */
export function formatAffiliateRate(
  rate: {
    rateType: "percent" | "fixed";
    rateValue: number;
    currency: string | null;
  } | null,
): string {
  if (!rate) return "Set by the academy";
  if (rate.rateType === "percent") {
    const percent = rate.rateValue / 100;
    return `${Number.isInteger(percent) ? percent : percent.toFixed(2)}%`;
  }
  return formatMoney(rate.rateValue, { currency: rate.currency ?? "INR" });
}

/** Whole minor units as money: 50000 INR is "₹500". */
export function formatAffiliateMoney(money: {
  amountMinor: number;
  currency: string;
}) {
  return formatMoney(money.amountMinor, { currency: money.currency });
}

/** A fresh Idempotency-Key for one press of a button. */
export function newIdempotencyKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
