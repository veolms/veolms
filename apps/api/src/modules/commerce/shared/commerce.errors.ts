import { AppError } from "../../../lib/errors.ts";

export const CommerceErrors = {
  COURSE_NOT_FOUND: (courseId: string) =>
    new AppError(404, "COURSE_NOT_FOUND", `Course with id "${courseId}" was not found.`),
  COURSE_NOT_AVAILABLE: (title: string) =>
    new AppError(400, "COURSE_NOT_AVAILABLE", `Course "${title}" is not available for purchase.`),
  COURSE_ALREADY_OWNED: (title: string) =>
    new AppError(409, "COURSE_ALREADY_OWNED", `You are already enrolled in "${title}".`),
  BUNDLE_NOT_FOUND: (bundleId: string) =>
    new AppError(404, "BUNDLE_NOT_FOUND", `Course bundle with id "${bundleId}" was not found.`),
  BUNDLE_NOT_AVAILABLE: (title: string) =>
    new AppError(400, "BUNDLE_NOT_AVAILABLE", `Course bundle "${title}" is not available for purchase.`),
  BUNDLE_ALL_COURSES_OWNED: (title: string) =>
    new AppError(409, "BUNDLE_ALL_COURSES_OWNED", `You already own all courses in bundle "${title}".`),
  EMPTY_CHECKOUT_ITEMS: () =>
    new AppError(400, "EMPTY_CHECKOUT_ITEMS", "No items provided for pricing calculation."),
  INVALID_COUPON: (code: string) =>
    new AppError(400, "INVALID_COUPON", `Coupon code "${code}" is invalid.`),
  COUPON_INACTIVE: (code: string) =>
    new AppError(400, "COUPON_INACTIVE", `Coupon "${code}" is currently inactive.`),
  COUPON_EXPIRED: (code: string) =>
    new AppError(400, "COUPON_EXPIRED", `Coupon "${code}" has expired.`),
  COUPON_NOT_STARTED: (code: string) =>
    new AppError(400, "COUPON_NOT_STARTED", `Coupon "${code}" is not valid yet.`),
  COUPON_USAGE_LIMIT_REACHED: (code: string) =>
    new AppError(400, "COUPON_USAGE_LIMIT_REACHED", `Coupon "${code}" usage limit has been reached.`),
  COUPON_USER_LIMIT_REACHED: (code: string) =>
    new AppError(400, "COUPON_USER_LIMIT_REACHED", `You have already used coupon "${code}" the maximum number of times.`),
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
    new AppError(409, "CART_ITEM_ALREADY_EXISTS", "This item is already in your cart."),
  CART_ITEM_NOT_FOUND: () =>
    new AppError(404, "CART_ITEM_NOT_FOUND", "The requested cart item was not found."),
  ORDER_NOT_FOUND: (orderId: string) =>
    new AppError(404, "ORDER_NOT_FOUND", `Order with id "${orderId}" was not found.`),
  ORDER_EXPIRED: () =>
    new AppError(400, "ORDER_EXPIRED", "This order has expired. Please initiate a new checkout."),
  ORDER_ALREADY_PAID: () =>
    new AppError(409, "ORDER_ALREADY_PAID", "This order has already been paid."),
  PAYMENT_NOT_FOUND: (identifier: string) =>
    new AppError(404, "PAYMENT_NOT_FOUND", `Payment record "${identifier}" was not found.`),
  PAYMENT_SIGNATURE_INVALID: () =>
    new AppError(400, "PAYMENT_SIGNATURE_INVALID", "Payment signature verification failed."),
  PAYMENT_AMOUNT_MISMATCH: () =>
    new AppError(400, "PAYMENT_AMOUNT_MISMATCH", "Payment amount does not match the order total."),
  PAYMENT_CURRENCY_MISMATCH: () =>
    new AppError(400, "PAYMENT_CURRENCY_MISMATCH", "Payment currency does not match the order currency."),
  PAYMENT_ALREADY_PROCESSED: () =>
    new AppError(409, "PAYMENT_ALREADY_PROCESSED", "This payment has already been processed."),
  PAYMENT_NOT_CAPTURED: (status: string) =>
    new AppError(400, "PAYMENT_NOT_CAPTURED", `Payment cannot be finalized because gateway status is "${status}" (expected "captured").`),
  REFUND_NOT_ALLOWED: (reason: string) =>
    new AppError(400, "REFUND_NOT_ALLOWED", `Refund could not be processed: ${reason}`),
  WEBHOOK_SIGNATURE_INVALID: () =>
    new AppError(400, "WEBHOOK_SIGNATURE_INVALID", "Webhook signature verification failed."),
  PRICE_CALCULATION_FAILED: (reason: string) =>
    new AppError(400, "PRICE_CALCULATION_FAILED", reason),
  IDEMPOTENCY_KEY_CONFLICT: () =>
    new AppError(409, "IDEMPOTENCY_KEY_CONFLICT", "Idempotency key has already been used by another account."),
};
