import { computeCouponDiscount } from "./pricing.amount.ts";

/** A discount as a coupon or one of its rules sets it (amounts in rupees). */
export interface CouponDiscountTerms {
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountAmount: number | null;
}

export interface CouponAllocationItem {
  /** Catalog amount the coupon may discount, in the charge's units. */
  couponBase: number;
  /** The same amount in rupees; equal to couponBase for a rupee charge. */
  domesticCouponBase: number;
  /** This item's own terms under the coupon; null takes the coupon's. */
  rule: CouponDiscountTerms | null;
}

/**
 * Splits a coupon's discount over the items it applies to.
 *
 * Items without a rule share the coupon's own terms exactly as before rules
 * existed: a percentage of their total, or a fixed amount over all of them,
 * capped by the coupon's maximum and spread in proportion to price (the last
 * item takes the rounding). An item with a rule gets its rule's discount on
 * its own price, capped by the rule's maximum. With rules present, the
 * coupon's maximum caps the whole order's coupon discount.
 *
 * Rupee amounts (fixed values, maximums) are converted into the charge's
 * units at `couponBase / domesticCouponBase`, rounded down, the rate the
 * items themselves sell at; percentages need no converting.
 *
 * Returns one discount per item, in the order given.
 */
export function allocateCouponDiscount(input: {
  coupon: CouponDiscountTerms;
  items: readonly CouponAllocationItem[];
}): number[] {
  const { coupon, items } = input;
  const discounts = items.map(() => 0);

  const toCharge = (rupees: number, base: number, domesticBase: number) =>
    domesticBase > 0 && base !== domesticBase
      ? Math.floor((rupees * base) / domesticBase)
      : rupees;

  // The coupon's own terms, over every item without a rule.
  const shared = items
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.rule === null && item.couponBase > 0);
  const hasRules = items.some((item) => item.rule !== null);
  const sharedBase = shared.reduce((sum, { item }) => sum + item.couponBase, 0);
  const sharedDomestic = shared.reduce(
    (sum, { item }) => sum + item.domesticCouponBase,
    0,
  );
  const sharedTotal = computeCouponDiscount({
    discountType: coupon.discountType,
    discountValue:
      coupon.discountType === "fixed"
        ? toCharge(coupon.discountValue, sharedBase, sharedDomestic)
        : coupon.discountValue,
    // With rules the coupon's maximum caps the whole order, below.
    maxDiscountAmount:
      !hasRules && coupon.maxDiscountAmount
        ? toCharge(coupon.maxDiscountAmount, sharedBase, sharedDomestic)
        : null,
    eligibleCatalogSubtotal: sharedBase,
  });
  spread(
    sharedTotal,
    shared.map(({ item, index }) => ({ weight: item.couponBase, index })),
    discounts,
  );

  // Each rule, on its own item.
  items.forEach((item, index) => {
    if (!item.rule || item.couponBase <= 0) return;
    const { rule } = item;
    discounts[index] = computeCouponDiscount({
      discountType: rule.discountType,
      discountValue:
        rule.discountType === "fixed"
          ? toCharge(
              rule.discountValue,
              item.couponBase,
              item.domesticCouponBase,
            )
          : rule.discountValue,
      maxDiscountAmount: rule.maxDiscountAmount
        ? toCharge(
            rule.maxDiscountAmount,
            item.couponBase,
            item.domesticCouponBase,
          )
        : null,
      eligibleCatalogSubtotal: item.couponBase,
    });
  });

  if (hasRules && coupon.maxDiscountAmount) {
    const base = items.reduce((sum, item) => sum + item.couponBase, 0);
    const domestic = items.reduce((s, item) => s + item.domesticCouponBase, 0);
    const cap = toCharge(coupon.maxDiscountAmount, base, domestic);
    const total = discounts.reduce((sum, d) => sum + d, 0);
    if (total > cap) {
      const given = discounts.map((d, index) => ({ weight: d, index }));
      discounts.fill(0);
      spread(cap, given, discounts);
    }
  }

  return discounts;
}

/** Shares `total` by weight, rounding down; the last share takes the rest. */
function spread(
  total: number,
  shares: ReadonlyArray<{ weight: number; index: number }>,
  into: number[],
): void {
  const weightSum = shares.reduce((sum, s) => sum + s.weight, 0);
  if (total <= 0 || weightSum <= 0) return;
  let left = total;
  shares.forEach((share, i) => {
    const amount =
      i === shares.length - 1
        ? left
        : Math.floor((share.weight / weightSum) * total);
    into[share.index] = amount;
    left -= amount;
  });
}
