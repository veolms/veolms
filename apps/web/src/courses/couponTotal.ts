/**
 * A coupon total on the course price card, and the amount it belongs to.
 *
 * The server works a coupon total out for one amount: the catalogue price,
 * or the buyer's own higher amount. The card used to keep the total without
 * the amount, so after the buyer changed their amount the pay button went on
 * naming the earlier total while a click sent the new amount. Each total now
 * carries the amount it was worked out for, and the card compares the two
 * before it offers to take a payment.
 */
export interface AppliedCoupon {
  code: string;
  discountAmount: number;
  totalAmount: number;
  currency: string;
  discountLabel?: string;
  /** What was to be charged before the coupon when `totalAmount` was worked out. */
  pricedForAmount: number;
}

export function checkoutCourseItem(
  courseId: string,
  options: { isFree: boolean; amount: number; catalogPrice: number },
) {
  const includeCustom =
    options.amount > 0 &&
    (options.isFree || options.amount >= options.catalogPrice);
  return {
    itemType: "course" as const,
    courseId,
    ...(includeCustom ? { customAmount: options.amount } : {}),
  };
}

/**
 * What a paid course costs before any coupon: the buyer's own amount when
 * it is above the catalogue price, the catalogue price otherwise.
 */
export function payableBeforeCoupon(
  voluntaryAmount: number,
  catalogPrice: number,
): number {
  return voluntaryAmount > catalogPrice ? voluntaryAmount : catalogPrice;
}

/**
 * True while the coupon total on the card was worked out for a different
 * amount from the one a payment would send now. Nothing may be paid then.
 */
export function isCouponTotalStale(
  coupon: Pick<AppliedCoupon, "pricedForAmount"> | null,
  payableAmount: number,
): boolean {
  return coupon !== null && coupon.pricedForAmount !== payableAmount;
}

/**
 * What the struck-through price and the saving badge beside a coupon total
 * may truthfully say.
 *
 * A coupon reduces the catalogue price only; anything the buyer adds on top
 * is charged in full. With no added amount the card compares the total with
 * the catalogue price and shows the coupon's own label, as it always has.
 * With an added amount that comparison is false twice over: the total is
 * above the catalogue price, and "10% OFF" is not 10% of what is being paid.
 * The card then compares the total with the amount before the coupon and
 * states the saving in money, both taken from the server's own figures; when
 * the coupon takes nothing off, it claims nothing.
 */
export type CouponSaving =
  | { against: "catalogue" }
  | { against: "ownAmount"; wasAmount: number; savedAmount: number }
  | { against: "nothing" };

export function describeCouponSaving(
  coupon: Pick<
    AppliedCoupon,
    "pricedForAmount" | "totalAmount" | "discountAmount"
  >,
  catalogPrice: number,
): CouponSaving {
  if (coupon.pricedForAmount <= catalogPrice) return { against: "catalogue" };
  if (coupon.discountAmount <= 0) return { against: "nothing" };
  return {
    against: "ownAmount",
    wasAmount: coupon.totalAmount + coupon.discountAmount,
    savedAmount: coupon.discountAmount,
  };
}
