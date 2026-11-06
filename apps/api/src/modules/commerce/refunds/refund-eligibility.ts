/**
 * Whether a purchase may be refunded at its buyer's own request, with no
 * staff review: within 30 days of the payment, and with no more of the
 * course watched than 10% of it or 10 hours, whichever is less.
 *
 * "Watched" is what the learner's lesson progress covers (each lesson's
 * video length times how far into it they got), the same estimate the
 * analytics use. A course with no video has nothing to measure, and is
 * judged on the 30 days alone.
 */

export const REFUND_WINDOW_DAYS = 30;
/** The share of the course a refundable purchase may have watched. */
export const REFUND_WATCH_SHARE = 0.1;
/** The most a refundable purchase may have watched, however long the course. */
export const REFUND_WATCH_HOURS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundIneligibleReason =
  "watched_share" | "watched_hours" | "window_passed";

export const REFUND_REASON_MESSAGES: Readonly<
  Record<RefundIneligibleReason, string>
> = {
  watched_share: "You've completed more than 10% of this course.",
  watched_hours: "You've watched more than 10 hours of this course.",
  window_passed: "Refunds are only available within 30 days of purchase.",
};

export interface RefundEligibilityInput {
  paidAt: Date;
  now: Date;
  /** What the learner's progress covers of the purchase's videos. */
  watchedSeconds: number;
  /** The length of every video the purchase opens. */
  courseSeconds: number;
}

export interface RefundEligibility {
  eligible: boolean;
  reasons: RefundIneligibleReason[];
}

/**
 * Whether a purchase gets a refund option at all. A free enrollment has
 * nothing to return, and an order that failed, is still being paid or was
 * already refunded is not a purchase to refund (the same rule as the staff
 * refund).
 */
export function isRefundOffered(order: {
  status: string;
  totalAmount: number;
  paidAt: Date | null;
}): boolean {
  return order.status === "paid" && order.totalAmount > 0 && !!order.paidAt;
}

export function evaluateRefundEligibility({
  paidAt,
  now,
  watchedSeconds,
  courseSeconds,
}: RefundEligibilityInput): RefundEligibility {
  const reasons: RefundIneligibleReason[] = [];

  if (courseSeconds > 0) {
    const shareLimit = courseSeconds * REFUND_WATCH_SHARE;
    const hoursLimit = REFUND_WATCH_HOURS * 3600;
    // The lower limit is the one that applies, and the one the learner is
    // told about. Where both are the same, the share is the simpler to read.
    if (watchedSeconds > Math.min(shareLimit, hoursLimit)) {
      reasons.push(
        shareLimit <= hoursLimit ? "watched_share" : "watched_hours",
      );
    }
  }

  if (now.getTime() - paidAt.getTime() > REFUND_WINDOW_DAYS * DAY_MS) {
    reasons.push("window_passed");
  }

  return { eligible: reasons.length === 0, reasons };
}
