import type { OrderStatus } from "@veolms/database";
import { isOrderAlreadyPaid } from "./surplus-payment.ts";

/**
 * An extra payment: money the gateway captured that buys the buyer nothing
 * they do not already have. Two ways it happens:
 *
 *  - the order it arrived for had already been paid (surplus-payment.ts);
 *  - the buyer already has access to something the order sells (a course of
 *    it, or its quiz pass), usually because the order was replaced by
 *    another one that was then paid, or by a free enrolment, and the old
 *    gateway order was paid afterwards. A gateway order cannot be withdrawn;
 *  - the order it arrived for was closed without being paid and can no
 *    longer be paid (cancelled, failed).
 *
 * Nothing is granted for an extra payment and no access changes. It is kept
 * on its payment row with SURPLUS_CAPTURE_ERROR_CODE, which is what puts it
 * on the staff list of money to return. When automatic refunds are on, a
 * refund of the whole amount is reserved in the same transaction (a row in
 * `refunds` with AUTO_REFUND_REASON) and then sent to the gateway by
 * extra-payment-refund.service.ts. The payment leaves the staff list when
 * the money has gone back.
 */

/** The reason on a refund this code made by itself. */
export const AUTO_REFUND_REASON = "Automatic refund of an extra payment";

/**
 * The idempotency key of the one automatic refund a payment can have.
 * `refunds` allows one row per order and key, so the same payment is never
 * reserved for refund twice.
 */
export function autoRefundKey(paymentId: string): string {
  return `auto-refund:${paymentId}`;
}

export function isAutoRefundKey(key: string | null | undefined): boolean {
  return Boolean(key?.startsWith("auto-refund:"));
}

/**
 * Whether a payment's money came through the payment gateway. A no-cost
 * order's payment moved no money, and a manual transfer never passed the
 * gateway, so neither can be refunded through it.
 */
export function isGatewayMoney(payment: {
  gateway_provider: string;
  amount: number;
}): boolean {
  return (
    payment.amount > 0 &&
    payment.gateway_provider !== "free" &&
    payment.gateway_provider !== "manual"
  );
}

/** The order states a first payment can still pay (markOrderPaidIfPending). */
function canStillBePaid(status: OrderStatus): boolean {
  return (
    status === "pending" ||
    status === "payment_processing" ||
    status === "expired"
  );
}

export type CapturedPaymentDecision =
  /** The first payment for something the buyer does not have: deliver it. */
  | { kind: "fulfil" }
  /**
   * Extra money. `refund` says whether it is sent back automatically;
   * otherwise it is only listed for staff.
   */
  | {
      kind: "extra";
      why: "order_already_paid" | "already_held" | "order_closed";
      refund: boolean;
    }
  /**
   * Neither payable nor paid (cancelled, failed), and no money was taken (a
   * no-cost payment): there is nothing to keep. Left to the caller.
   */
  | { kind: "not_fulfillable" };

/**
 * What to do with a payment the gateway has captured, decided inside the
 * transaction that records it, with the order row locked.
 *
 * `heldTitles` is what the buyer already has of what the order sells. It
 * only counts for gateway money while automatic refunds are on: with them
 * off, a late payment is honoured as it always was and staff see the
 * duplicate on their list.
 *
 * Money for an order that was closed and cannot be paid any more
 * (cancelled, failed) is extra money too, never an error: the gateway has
 * it and will not change its mind. A cancelled order is not honoured the
 * way an expired one is. Expiry only says the deadline passed; an order is
 * cancelled because the purchase itself was called off (the buyer enrolled
 * for free in what it sells, or it never got a payment to go with it), so
 * paying it late grants nothing and the money goes back.
 */
export function decideCapturedPayment(input: {
  orderStatus: OrderStatus;
  payment: { gateway_provider: string; amount: number };
  heldTitles: readonly string[];
  autoRefund: boolean;
}): CapturedPaymentDecision {
  const refundable = input.autoRefund && isGatewayMoney(input.payment);
  if (isOrderAlreadyPaid(input.orderStatus)) {
    return { kind: "extra", why: "order_already_paid", refund: refundable };
  }
  // The owner's rule: a buyer never pays for something they already have.
  // This holds for the first, in-time payment of an order that is still
  // open as well, not only for a late one: if the buyer came to have any
  // course or quiz pass of the order while its checkout was open (staff
  // gave them access, another order of theirs was paid), the whole payment
  // goes back and the order is closed unpaid. Nothing of the order is
  // delivered, so they buy the items they do not have again.
  if (refundable && input.heldTitles.length > 0) {
    return { kind: "extra", why: "already_held", refund: true };
  }
  if (canStillBePaid(input.orderStatus)) return { kind: "fulfil" };
  return input.payment.amount > 0
    ? { kind: "extra", why: "order_closed", refund: refundable }
    : { kind: "not_fulfillable" };
}

/**
 * A title as it is written into a payment's description. That text is also
 * where refunds of the payment are noted and read back
 * (surplus-payment.ts's refundedSoFar), and a refund note ends in
 * "(minor units) reported by the gateway.". Without its round brackets a
 * title cannot be read as one, whatever it says.
 */
function titleForDescription(title: string): string {
  return title.replaceAll("(", "[").replaceAll(")", "]");
}

export function describeExtraCaptureForHeldItems(
  orderNumber: string,
  heldTitles: readonly string[],
): string {
  return (
    `Captured by the gateway for order ${orderNumber} when the buyer already had ${heldTitles.map((title) => `"${titleForDescription(title)}"`).join(", ")}. ` +
    "Nothing was granted for it. Return this money from the gateway dashboard."
  );
}

/** For money captured for an order that was closed without being paid. */
export function describeExtraCaptureForClosedOrder(
  orderNumber: string,
  orderStatus: OrderStatus,
): string {
  const closed =
    orderStatus === "cancelled"
      ? "had been cancelled"
      : orderStatus === "payment_failed"
        ? "had been closed as failed"
        : "had been closed";
  return (
    `Captured by the gateway for order ${orderNumber} after it ${closed}. ` +
    "Nothing was granted for it. Return this money from the gateway dashboard."
  );
}

/** One order line, as the question "does the buyer have this?" needs it. */
export interface SoldItem {
  item_type: string;
  course_id: string | null;
  bundle_id: string | null;
  quiz_pricing_id?: string | null;
  title_snapshot: string;
}

/**
 * The lines of an order the buyer already has something of: a course they
 * have access to, a bundle holding such a course, or a quiz pass they hold.
 * Bundles are read from `bundleCourses`, their contents as they are now.
 * Returns each such line's title, in order.
 */
export function heldItemTitles(
  items: readonly SoldItem[],
  holdings: {
    ownedCourseIds: ReadonlySet<string>;
    bundleCourses: ReadonlyArray<{ bundle_id: string; course_id: string }>;
    heldQuizPricingIds: ReadonlySet<string>;
  },
): string[] {
  const held: string[] = [];
  for (const item of items) {
    if (item.item_type === "course" && item.course_id) {
      if (holdings.ownedCourseIds.has(item.course_id)) {
        held.push(item.title_snapshot);
      }
    } else if (item.item_type === "bundle" && item.bundle_id) {
      const ownsOne = holdings.bundleCourses.some(
        (row) =>
          row.bundle_id === item.bundle_id &&
          holdings.ownedCourseIds.has(row.course_id),
      );
      if (ownsOne) held.push(item.title_snapshot);
    } else if (item.item_type === "quiz" && item.quiz_pricing_id) {
      if (holdings.heldQuizPricingIds.has(item.quiz_pricing_id)) {
        held.push(item.title_snapshot);
      }
    }
  }
  return held;
}

/** The shortest wait between two attempts to send one automatic refund. */
export const AUTO_REFUND_RETRY_MIN_MS = 4 * 60 * 1000;

/**
 * Whether an automatic refund the gateway has not accepted yet is due for
 * (another) attempt. Never tried: now. Otherwise each wait is as long as
 * the refund has been waiting so far, so a gateway that stays down is asked
 * a handful of times over the day a reservation is kept, not on every pass.
 * `lastTouchedAt` equal to `createdAt` means no attempt was made.
 */
export function autoRefundAttemptDue(
  refund: { createdAt: Date | string; lastTouchedAt: Date | string },
  now: Date,
): boolean {
  const created = new Date(refund.createdAt).getTime();
  const touched = new Date(refund.lastTouchedAt).getTime();
  if (touched <= created) return true;
  const wait = Math.max(AUTO_REFUND_RETRY_MIN_MS, touched - created);
  return now.getTime() - touched >= wait;
}

/**
 * What to do when the gateway did not accept an automatic refund:
 *
 *  - `refused`: the gateway said no for good (the payment cannot be
 *    refunded, the amount is wrong). Staff return the money by hand.
 *  - `retry`: the outcome is unknown, or the gateway was only asking for
 *    fewer requests (429). Tried again after the usual wait.
 *  - `retry_needs_operator`: the gateway did not accept our credentials
 *    (401, 403). Nothing is wrong with this refund, so it is tried again,
 *    but it will keep failing until someone fixes the keys.
 *
 * `definitive` is refund.service.ts's isDefinitiveGatewayRejection: the
 * gateway answered, and no refund was made.
 */
export type AutoRefundFailure = "refused" | "retry" | "retry_needs_operator";

export function classifyAutoRefundFailure(input: {
  definitive: boolean;
  statusCode: number | undefined;
}): AutoRefundFailure {
  if (!input.definitive) return "retry";
  if (input.statusCode === 429) return "retry";
  if (input.statusCode === 401 || input.statusCode === 403) {
    return "retry_needs_operator";
  }
  return "refused";
}
