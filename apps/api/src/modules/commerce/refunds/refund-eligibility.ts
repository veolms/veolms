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
  | "watched_share"
  | "watched_hours"
  | "quizzes_attempted"
  | "window_passed"
  | "credited_to_upgrade";

export const REFUND_REASON_MESSAGES: Readonly<
  Record<RefundIneligibleReason, string>
> = {
  watched_share: "You've completed more than 10% of this course.",
  watched_hours: "You've watched more than 10 hours of this course.",
  quizzes_attempted: "You've attempted more than 10% of the quizzes.",
  window_passed: "Refunds are only available within 30 days of purchase.",
  credited_to_upgrade:
    "This purchase counts toward your upgrade to the full course, so it can't be refunded on its own.",
};

export interface RefundEligibilityInput {
  /**
   * When the purchase was made: the payment, or for a bank transfer when
   * the learner sent it (staff may confirm it days later).
   */
  paidAt: Date;
  now: Date;
  /** What the learner's progress covers of the purchase's videos. */
  watchedSeconds: number;
  /** The length of every video the purchase opens. */
  courseSeconds: number;
  /**
   * Part of a course whose price was later taken off the whole course's
   * (an upgrade). Refunding it would return money already spent as that
   * discount, with the whole course kept.
   */
  creditedToUpgrade?: boolean;
  /**
   * A quiz pass: of the quizzes it opens, how many the learner has started
   * an attempt on. More than 10% of them is too many to refund.
   */
  quizzesAttempted?: number;
  quizzesTotal?: number;
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
  creditedToUpgrade = false,
  quizzesAttempted = 0,
  quizzesTotal = 0,
}: RefundEligibilityInput): RefundEligibility {
  const reasons: RefundIneligibleReason[] = [];

  // Said alone: watched and dates do not matter for it.
  if (creditedToUpgrade)
    return { eligible: false, reasons: ["credited_to_upgrade"] };

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

  // The same 10%, counted in quizzes: a quiz pass has no video to watch.
  if (
    quizzesTotal > 0 &&
    quizzesAttempted > quizzesTotal * REFUND_WATCH_SHARE
  ) {
    reasons.push("quizzes_attempted");
  }

  if (now.getTime() - paidAt.getTime() > REFUND_WINDOW_DAYS * DAY_MS) {
    reasons.push("window_passed");
  }

  return { eligible: reasons.length === 0, reasons };
}
