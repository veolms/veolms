import { MAX_VOLUNTARY_AMOUNT, MIN_VOLUNTARY_AMOUNT } from "@veolms/contracts";
import { CommerceErrors } from "../shared/commerce.errors.ts";

export interface CourseCharge {
  /** Amount the student will be charged for the item, before coupon. */
  unitPrice: number;
  /** Catalog portion eligible for coupons. Excludes any voluntary tip. */
  couponBase: number;
}

/**
 * Resolves what to charge for a course and how much of that charge coupons
 * may discount. Voluntary `customAmount` may raise the charge above catalog
 * price; it must never lower a paid course, and it is never coupon-eligible.
 */
export function resolveCourseCharge(input: {
  isPaidCourse: boolean;
  catalogPrice: number;
  customAmount?: number | null;
  currency: string;
}): CourseCharge {
  const { isPaidCourse, catalogPrice, customAmount, currency } = input;
  const catalog = isPaidCourse ? Math.max(0, catalogPrice) : 0;

  if (customAmount === undefined || customAmount === null) {
    return { unitPrice: catalog, couponBase: catalog };
  }

  if (!Number.isInteger(customAmount)) {
    throw CommerceErrors.PRICE_CALCULATION_FAILED(
      "Custom amount must be a whole integer.",
    );
  }

  if (isPaidCourse) {
    if (customAmount < catalog) {
      throw CommerceErrors.PRICE_CALCULATION_FAILED(
        `Custom amount cannot be less than the course price (${catalog} ${currency}).`,
      );
    }
    if (customAmount > MAX_VOLUNTARY_AMOUNT) {
      throw CommerceErrors.PRICE_CALCULATION_FAILED(
        `Custom amount cannot exceed ${MAX_VOLUNTARY_AMOUNT} ${currency}.`,
      );
    }
    return { unitPrice: customAmount, couponBase: catalog };
  }

  if (
    customAmount < MIN_VOLUNTARY_AMOUNT ||
    customAmount > MAX_VOLUNTARY_AMOUNT
  ) {
    throw CommerceErrors.PRICE_CALCULATION_FAILED(
      `Voluntary amount must be an integer between ${MIN_VOLUNTARY_AMOUNT} and ${MAX_VOLUNTARY_AMOUNT} ${currency}.`,
    );
  }

  return { unitPrice: customAmount, couponBase: 0 };
}

/**
 * Coupon discounts apply only to `eligibleCatalogSubtotal` (catalog prices of
 * coupon-eligible items). Tips are added after the discount.
 */
export function computeCouponDiscount(input: {
  discountType: "percentage" | "fixed";
  discountValue: number;
  maxDiscountAmount?: number | null;
  eligibleCatalogSubtotal: number;
}): number {
  const {
    discountType,
    discountValue,
    maxDiscountAmount,
    eligibleCatalogSubtotal,
  } = input;

  if (eligibleCatalogSubtotal <= 0) {
    return 0;
  }

  let totalDiscount: number;
  if (discountType === "percentage") {
    const calculated = Math.floor(
      (eligibleCatalogSubtotal * discountValue) / 100,
    );
    totalDiscount = maxDiscountAmount
      ? Math.min(calculated, maxDiscountAmount)
      : calculated;
  } else {
    totalDiscount = Math.min(discountValue, eligibleCatalogSubtotal);
  }

  return Math.min(totalDiscount, eligibleCatalogSubtotal);
}
