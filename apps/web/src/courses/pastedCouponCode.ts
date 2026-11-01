/** The longest code the server accepts (`couponCode` in the checkout contract). */
const MAX_COUPON_CODE_LENGTH = 50;

/**
 * What was pasted on a course's page, as a coupon code to try; null when it
 * cannot be one.
 *
 * A code is one word. A sentence, a link, a file path or an e-mail address
 * that happens to be on the clipboard is left alone: trying those would put
 * "invalid coupon" on the page for something the visitor never meant as a
 * code. Anything that is one word is tried, and the server says whether it
 * is a coupon.
 */
export function readPastedCouponCode(
  text: string | null | undefined,
): string | null {
  const code = (text ?? "").trim().toUpperCase();
  if (!code || code.length > MAX_COUPON_CODE_LENGTH) return null;
  if (/[\s/\\:@]/.test(code)) return null;
  return code;
}
