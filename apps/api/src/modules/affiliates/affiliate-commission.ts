import {
  AFFILIATE_PERCENT_BASIS_POINTS_MAX,
  type AffiliateCommissionStatus,
  type AffiliateRateType,
  type AffiliateRuleTargetType,
} from "@veolms/contracts";

/**
 * How much an affiliate earns, worked out without the database (PRD
 * sections 9 and 10). Every amount is a whole number of minor units; every
 * rounding is half up (half away from zero for negative amounts), done in
 * BigInt so no product of two amounts can lose precision.
 */

/** A live rule, as the rules repository returns it. */
export interface CommissionRule {
  id: string;
  affiliateId: string | null;
  targetType: AffiliateRuleTargetType | null;
  targetId: string | null;
  rateType: AffiliateRateType;
  /** Percent: basis points (2000 = 20%). Fixed: minor units. */
  rateValue: number;
  /** Fixed rules only: the currency the amount is in. */
  currency: string | null;
}

/** What is being sold, to whom the credit goes, and in which currency. */
export interface CommissionTarget {
  affiliateId: string;
  targetType: AffiliateRuleTargetType;
  targetId: string;
  /** The order's currency. */
  currency: string;
}

/** `a × b ÷ c`, rounded half away from zero. `c` must be positive. */
function mulDivRound(a: number, b: number, c: number): number {
  if (c <= 0) throw new RangeError("Divisor must be positive");
  const product = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  const negative = product < 0n;
  const magnitude = negative ? -product : product;
  const rounded = (magnitude * 2n + divisor) / (divisor * 2n);
  return Number(negative ? -rounded : rounded);
}

/**
 * The rule that decides a commission: the most specific live rule wins —
 * this affiliate and this product, then this affiliate, then this product,
 * then the program default. A fixed rule in another currency than the
 * order's is passed over, and the next rule in that order applies. Null when
 * no rule applies (the program has no default).
 */
export function resolveCommissionRule(
  rules: readonly CommissionRule[],
  target: CommissionTarget,
): CommissionRule | null {
  const isProduct = (rule: CommissionRule) =>
    rule.targetType === target.targetType && rule.targetId === target.targetId;
  const isEveryProduct = (rule: CommissionRule) =>
    rule.targetType === null && rule.targetId === null;
  const tiers: ((rule: CommissionRule) => boolean)[] = [
    (rule) => rule.affiliateId === target.affiliateId && isProduct(rule),
    (rule) => rule.affiliateId === target.affiliateId && isEveryProduct(rule),
    (rule) => rule.affiliateId === null && isProduct(rule),
    (rule) => rule.affiliateId === null && isEveryProduct(rule),
  ];
  const usable = (rule: CommissionRule) =>
    rule.rateType === "percent" ||
    rule.currency?.toUpperCase() === target.currency.toUpperCase();
  for (const matches of tiers) {
    const rule = rules.find(
      (candidate) => matches(candidate) && usable(candidate),
    );
    if (rule) return rule;
  }
  return null;
}

/** The parts of an order item the commission is worked out from. */
export interface CommissionItemAmounts {
  /** What the buyer pays for the item, after discount (order_items.final_amount). */
  finalAmount: number;
  /** The tax inside it (order_items.tax_amount); zero while checkout charges none. */
  taxAmount: number;
}

/**
 * The commission base: the item's price after discount, without tax, in the
 * order's currency. The gateway's fee is not taken off (PRD decision D-4).
 * Never below zero.
 */
export function commissionBase(item: CommissionItemAmounts): number {
  return Math.max(0, item.finalAmount - item.taxAmount);
}

/**
 * The commission on one item: `round(base × rate)` for a percentage, or the
 * fixed amount capped at the base. Zero when the base is zero (a free course,
 * a 100% coupon) or the rule is 0%.
 */
export function calculateCommission(
  baseAmount: number,
  rule: Pick<CommissionRule, "rateType" | "rateValue">,
): number {
  if (!Number.isInteger(baseAmount)) {
    throw new RangeError("The base must be whole minor units");
  }
  if (baseAmount <= 0 || rule.rateValue <= 0) return 0;
  if (rule.rateType === "fixed") return Math.min(rule.rateValue, baseAmount);
  const rate = Math.min(rule.rateValue, AFFILIATE_PERCENT_BASIS_POINTS_MAX);
  return mulDivRound(baseAmount, rate, AFFILIATE_PERCENT_BASIS_POINTS_MAX);
}

export interface ReversalInput {
  /** The sale row being reversed. */
  sale: { amount: number; status: AffiliateCommissionStatus };
  /** What this refund gives back for the item. */
  refundedAmount: number;
  /** What the buyer paid for the item (order_items.final_amount). */
  itemAmount: number;
  /** The sum of earlier reversals of this sale (zero or negative). */
  alreadyReversed: number;
}

/**
 * The (negative) reversal a refund writes against a sale:
 * `-round(commission × refunded ÷ item amount)`, never more than what is
 * left of the commission. Zero when the sale was rejected (it never counted)
 * or nothing is left to reverse.
 */
export function calculateReversal(input: ReversalInput): number {
  const { sale, refundedAmount, itemAmount, alreadyReversed } = input;
  if (sale.status === "rejected" || sale.amount <= 0) return 0;
  if (refundedAmount <= 0 || itemAmount <= 0) return 0;
  const remaining = sale.amount + Math.min(0, alreadyReversed);
  if (remaining <= 0) return 0;
  const proportional = mulDivRound(
    sale.amount,
    Math.min(refundedAmount, itemAmount),
    itemAmount,
  );
  return -Math.min(proportional, remaining);
}

/**
 * A commission in the order's currency, in the academy's currency, using the
 * order's own settlement ratio (`settlement ÷ total`), the one revenue
 * reports use. Null when the order has no settlement value yet.
 */
export function convertToPayoutCurrency(
  amount: number,
  order: { totalAmount: number; settlementAmount: number | null },
): number | null {
  if (order.settlementAmount === null || order.totalAmount <= 0) return null;
  return mulDivRound(amount, order.settlementAmount, order.totalAmount);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** When a commission earned at `paidAt` is owed: after the hold period. */
export function commissionAvailableAt(paidAt: Date, holdDays: number): Date {
  return new Date(paidAt.getTime() + holdDays * DAY_MS);
}
