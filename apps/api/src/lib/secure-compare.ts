import crypto from "node:crypto";

/**
 * Constant-time string comparison — the standard defense against a timing
 * side-channel when checking a secret against user input (HMAC signatures,
 * static tokens, etc.). A naive `===` compare returns as soon as the first
 * mismatched byte is found, so response time leaks how many leading
 * characters were correct; `crypto.timingSafeEqual` always compares the
 * full buffer regardless of where the first difference is.
 *
 * The length check has to come first and return early — it is NOT itself
 * timing-safe — because `timingSafeEqual` throws on mismatched buffer
 * lengths rather than returning `false`. That's fine: a length mismatch
 * alone only leaks the length of the input, never any of the secret's
 * content, so it isn't the side-channel this function defends against.
 *
 * Previously hand-rolled identically in 3 places (Razorpay
 * `verifyPaymentSignature`, `verifyWebhookSignature`, and auth's
 * `isValidSetupToken`) — a future timing-safety fix now only needs to land
 * here once instead of being found and applied in three separate call sites.
 */
export function secureCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, "utf-8");
  const bBuf = Buffer.from(b, "utf-8");

  if (aBuf.length !== bBuf.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuf, bBuf);
}
