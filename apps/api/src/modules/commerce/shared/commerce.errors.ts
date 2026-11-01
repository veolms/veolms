import { AppError } from "../../../lib/errors.ts";

export const CommerceErrors = {
  COURSE_NOT_FOUND: (courseId: string) =>
    new AppError(
      404,
      "COURSE_NOT_FOUND",
      `Course with id "${courseId}" was not found.`,
    ),
  COURSE_ALREADY_OWNED: (title: string) =>
    new AppError(
      409,
      "COURSE_ALREADY_OWNED",
      `You are already enrolled in "${title}".`,
    ),
  COURSE_ACCESS_RESTRICTED: (title: string) =>
    new AppError(
      403,
      "COURSE_ACCESS_RESTRICTED",
      `"${title}" is open only to learners who have been given access. It cannot be enrolled in from here.`,
    ),
  ENROLLMENT_NOT_FOUND: () =>
    new AppError(
      404,
      "ENROLLMENT_NOT_FOUND",
      "You are not enrolled in this course.",
    ),
  UNENROLL_NOT_ALLOWED: () =>
    new AppError(
      409,
      "UNENROLL_NOT_ALLOWED",
      "You can only unenroll from a free course you joined at no cost.",
    ),
  BUNDLE_NOT_FOUND: (bundleId: string) =>
    new AppError(
      404,
      "BUNDLE_NOT_FOUND",
      `Course bundle with id "${bundleId}" was not found.`,
    ),
  BUNDLE_ALL_COURSES_OWNED: (title: string) =>
    new AppError(
      409,
      "BUNDLE_ALL_COURSES_OWNED",
      `You already own all courses in bundle "${title}".`,
    ),
  BUNDLE_CONTAINS_OWNED_COURSE: (title: string, ownedTitles: string[]) =>
    new AppError(
      409,
      "BUNDLE_CONTAINS_OWNED_COURSE",
      `Bundle "${title}" includes ${ownedTitles.map((owned) => `"${owned}"`).join(", ")}, which you are already enrolled in. Buy the other courses on their own so you do not pay for it again.`,
    ),
  /**
   * `secondsLeft` is how long until the earlier payment window is certainly
   * closed. An error carries no field for it, so the buyer is told in
   * minutes, rounded up.
   */
  CHECKOUT_IN_PROGRESS: (title: string, secondsLeft: number) => {
    const minutes = Math.max(1, Math.ceil(secondsLeft / 60));
    return new AppError(
      409,
      "CHECKOUT_IN_PROGRESS",
      `A payment for "${title}" was already started. Finish that payment, or try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}. This keeps you from paying twice.`,
    );
  },
  MANUAL_PAYMENT_PENDING: (title: string) =>
    new AppError(
      409,
      "MANUAL_PAYMENT_PENDING",
      `You reported a bank transfer for "${title}". It is being checked, so another payment cannot be started for it now.`,
    ),
  MANUAL_PAYMENT_NOT_PENDING: () =>
    new AppError(
      409,
      "MANUAL_PAYMENT_NOT_PENDING",
      "There is no bank transfer waiting to be checked for this order, so there is nothing to withdraw.",
    ),
  /** For staff: the buyer already has what the transfer would pay for. */
  MANUAL_PAYMENT_ALREADY_COVERED: (heldTitles: readonly string[]) =>
    new AppError(
      409,
      "MANUAL_PAYMENT_ALREADY_COVERED",
      `The buyer already has access to ${heldTitles.map((title) => `"${title}"`).join(", ")}, so this transfer cannot be verified: it would be a second payment. If the transfer arrived, return it outside the platform, then reject this request.`,
    ),
  COURSE_NOT_AVAILABLE: () =>
    new AppError(
      409,
      "COURSE_NOT_AVAILABLE",
      "This course is no longer available for purchase.",
    ),
  BUNDLE_COURSE_NOT_AVAILABLE: (title: string) =>
    new AppError(
      409,
      "COURSE_NOT_AVAILABLE",
      `Bundle "${title}" includes a course that is no longer available for purchase, so the bundle cannot be bought.`,
    ),
  CART_ITEMS_OVERLAP: () =>
    new AppError(
      409,
      "CART_ITEMS_OVERLAP",
      "Your cart already has this course, on its own or inside a bundle. Remove that item first so you do not pay for it twice.",
    ),
  QUIZ_NOT_FOUND: (id: string) =>
    new AppError(404, "QUIZ_NOT_FOUND", `Quiz offering "${id}" was not found.`),
  QUIZ_NOT_PURCHASABLE: (title: string) =>
    new AppError(
      400,
      "QUIZ_NOT_PURCHASABLE",
      `Quiz "${title}" is free and does not need to be purchased.`,
    ),
  QUIZ_COURSE_ACCESS_REQUIRED: (title: string) =>
    new AppError(
      403,
      "QUIZ_COURSE_ACCESS_REQUIRED",
      `Get access to the course before buying "${title}".`,
    ),
  QUIZ_ALREADY_OWNED: (title: string) =>
    new AppError(
      409,
      "QUIZ_ALREADY_OWNED",
      `You already have active access to "${title}".`,
    ),
  EMPTY_CHECKOUT_ITEMS: () =>
    new AppError(
      400,
      "EMPTY_CHECKOUT_ITEMS",
      "No items provided for pricing calculation.",
    ),
  INVALID_COUPON: (code: string) =>
    new AppError(400, "INVALID_COUPON", `Coupon code "${code}" is invalid.`),
  COUPON_INACTIVE: (code: string) =>
    new AppError(
      400,
      "COUPON_INACTIVE",
      `Coupon "${code}" is currently inactive.`,
    ),
  COUPON_EXPIRED: (code: string) =>
    new AppError(400, "COUPON_EXPIRED", `Coupon "${code}" has expired.`),
  COUPON_NOT_STARTED: (code: string) =>
    new AppError(
      400,
      "COUPON_NOT_STARTED",
      `Coupon "${code}" is not valid yet.`,
    ),
  COUPON_USAGE_LIMIT_REACHED: (code: string) =>
    new AppError(
      400,
      "COUPON_USAGE_LIMIT_REACHED",
      `Coupon "${code}" usage limit has been reached.`,
    ),
  COUPON_USER_LIMIT_REACHED: (code: string) =>
    new AppError(
      400,
      "COUPON_USER_LIMIT_REACHED",
      `You have already used coupon "${code}" the maximum number of times.`,
    ),
  COUPON_MIN_ORDER_NOT_MET: (code: string, minAmount: number) =>
    new AppError(
      400,
      "COUPON_MIN_ORDER_NOT_MET",
      `Coupon "${code}" requires a minimum order amount of ${minAmount}.`,
    ),
  COUPON_NOT_APPLICABLE: (code: string) =>
    new AppError(
      400,
      "COUPON_NOT_APPLICABLE",
      `Coupon "${code}" is not applicable to any items in your order.`,
    ),
  CART_ITEM_ALREADY_EXISTS: () =>
    new AppError(
      409,
      "CART_ITEM_ALREADY_EXISTS",
      "This item is already in your cart.",
    ),
  CART_ITEM_NOT_FOUND: () =>
    new AppError(
      404,
      "CART_ITEM_NOT_FOUND",
      "The requested cart item was not found.",
    ),
  ORDER_NOT_FOUND: (orderId: string) =>
    new AppError(
      404,
      "ORDER_NOT_FOUND",
      `Order with id "${orderId}" was not found.`,
    ),
  ORDER_EXPIRED: () =>
    new AppError(
      400,
      "ORDER_EXPIRED",
      "This order has expired. Please initiate a new checkout.",
    ),
  ORDER_ALREADY_PAID: () =>
    new AppError(
      409,
      "ORDER_ALREADY_PAID",
      "This order has already been paid.",
    ),
  PAYMENT_NOT_FOUND: (identifier: string) =>
    new AppError(
      404,
      "PAYMENT_NOT_FOUND",
      `Payment record "${identifier}" was not found.`,
    ),
  PAYMENT_SIGNATURE_INVALID: () =>
    new AppError(
      400,
      "PAYMENT_SIGNATURE_INVALID",
      "Payment signature verification failed.",
    ),
  PAYMENT_AMOUNT_MISMATCH: () =>
    new AppError(
      400,
      "PAYMENT_AMOUNT_MISMATCH",
      "Payment amount does not match the order total.",
    ),
  PAYMENT_CURRENCY_MISMATCH: () =>
    new AppError(
      400,
      "PAYMENT_CURRENCY_MISMATCH",
      "Payment currency does not match the order currency.",
    ),
  PAYMENT_ALREADY_PROCESSED: () =>
    new AppError(
      409,
      "PAYMENT_ALREADY_PROCESSED",
      "This payment has already been processed.",
    ),
  PAYMENT_NOT_CAPTURED: () =>
    new AppError(
      400,
      "PAYMENT_NOT_CAPTURED",
      "Payment cannot be finalized because it has not been captured yet.",
    ),
  REFUND_NOT_ALLOWED: (reason: string) =>
    new AppError(
      400,
      "REFUND_NOT_ALLOWED",
      `Refund could not be processed: ${reason}`,
    ),
  REFUND_IDEMPOTENCY_KEY_REUSED: () =>
    new AppError(
      409,
      "REFUND_IDEMPOTENCY_KEY_REUSED",
      "This idempotency key was already used for a different refund request on this order.",
    ),
  WEBHOOK_SIGNATURE_INVALID: () =>
    new AppError(
      400,
      "WEBHOOK_SIGNATURE_INVALID",
      "Webhook signature verification failed.",
    ),
  PRICE_CALCULATION_FAILED: (reason: string) =>
    new AppError(400, "PRICE_CALCULATION_FAILED", reason),
  IDEMPOTENCY_KEY_CONFLICT: () =>
    new AppError(
      409,
      "IDEMPOTENCY_KEY_CONFLICT",
      "Idempotency key has already been used by another account.",
    ),
};

/**
 * What a caller is told when the payment gateway refuses a request.
 *
 * The gateway adapter raises `PAYMENT_GATEWAY_ERROR` with the provider's own
 * HTTP status and error text (a rejected merchant key arrives as a 401 with
 * the provider's wording), and a sub-500 `AppError` reaches the client
 * verbatim. This swaps a 4xx one for a fixed 502; the original rides along as
 * `cause`, so the error handler's log of the 5xx still shows what the provider
 * said. Anything else — including gateway 5xx/timeouts, which the error
 * handler already masks — is returned unchanged.
 *
 * Call it where the error leaves the service, after any logic that needs the
 * provider's status (see `isDefinitiveGatewayRejection` in refund.service.ts).
 */
export function toClientGatewayError(err: unknown): unknown {
  if (
    !(err instanceof AppError) ||
    err.code !== "PAYMENT_GATEWAY_ERROR" ||
    err.statusCode >= 500
  ) {
    return err;
  }

  const clientError = new AppError(
    502,
    "PAYMENT_GATEWAY_ERROR",
    "The payment provider could not process this request.",
  );
  clientError.cause = err;
  return clientError;
}
