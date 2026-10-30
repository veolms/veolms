/**
 * A purchase a visitor started before signing in.
 *
 * "Pay Now" (or "Enroll for Free") from a visitor who is not signed in opens
 * the login pop-up. Signing in used to end there: the pop-up closed on the
 * course page and the buyer had to find the button and press it again. The
 * press is kept here instead, and the course page carries on with it once
 * the buyer is signed in: the mobile number first where the academy asks
 * for one, then the payment window.
 *
 * Kept in this tab's session storage, which outlasts a sign-in with Google
 * that leaves the page and comes back to it, and goes with the tab. Only for
 * a while: a press from long ago is not what someone signing in today means.
 */

const STORAGE_KEY = "veolms-pending-purchase-v1";
const MAX_AGE_MS = 30 * 60 * 1000;

export interface PendingPurchase {
  courseId: string;
  /** The amount chosen above the price, when there was one. */
  amount?: number;
  /** The coupon applied when the button was pressed. */
  couponCode?: string;
}

interface StoredPurchase extends PendingPurchase {
  savedAt: number;
}

function read(): StoredPurchase | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredPurchase> | null;
    if (
      !stored ||
      typeof stored.courseId !== "string" ||
      typeof stored.savedAt !== "number"
    ) {
      return null;
    }
    return {
      courseId: stored.courseId,
      savedAt: stored.savedAt,
      ...(typeof stored.amount === "number" ? { amount: stored.amount } : {}),
      ...(typeof stored.couponCode === "string"
        ? { couponCode: stored.couponCode }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Keeps the purchase a visitor is signing in to make. */
export function rememberPendingPurchase(purchase: PendingPurchase): void {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...purchase, savedAt: Date.now() }),
    );
  } catch {
    // Without storage the buyer presses the button again after signing in.
  }
}

/**
 * The purchase waiting for this course, if there is a recent one; it is
 * handed out once.
 */
export function takePendingPurchase(courseId: string): PendingPurchase | null {
  const stored = read();
  if (!stored || stored.courseId !== courseId) return null;
  forgetPendingPurchase();
  if (Date.now() - stored.savedAt > MAX_AGE_MS) return null;
  const { savedAt: _savedAt, ...purchase } = stored;
  return purchase;
}

/**
 * Drops the waiting purchase (of this course only, when one is named): the
 * visitor closed the login pop-up without signing in, or turned out to own
 * the course already.
 */
export function forgetPendingPurchase(courseId?: string): void {
  if (courseId !== undefined && read()?.courseId !== courseId) return;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to drop.
  }
}
