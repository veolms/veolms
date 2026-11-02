import type {
  CourseAccessEnrollment,
  CourseAccessPace,
} from "@veolms/contracts";
import { formatMoney } from "@veolms/contracts/commerce/money";
import { formatTimeAgo } from "../../lib/timeAgo";

const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function plural(count: number, word: string) {
  return `${count} ${word}${count === 1 ? "" : "s"}`;
}

// Day first, as the rest of the app writes dates, in the learner's own
// time zone: "14 Aug 2026".
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
});
const MONTH_FORMAT = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
});

/** "14 Aug 2026"; empty for a value that is not a date. */
export function formatEnrolmentDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? DATE_FORMAT.format(date) : "";
}

/** Whole calendar months from `from` to `to`, a month not yet full left out. */
function monthsBetween(from: Date, to: Date): number {
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  return to.getDate() < from.getDate() ? months - 1 : months;
}

export type EnrolmentAccessTone = "lifetime" | "active" | "ending" | "ended";

export interface EnrolmentAccess {
  tone: EnrolmentAccessTone;
  /** "14 Aug 2029", or "Lifetime" for access that does not end. */
  value: string;
  /** What is left, for the parentheses: "2 yrs 9 mo left", "24 days left". */
  remaining: string;
}

/**
 * How long the learner's access lasts, by the course page's rule: a year or
 * more left reads "2 yrs 9 mo left", two months to a year "8 months left",
 * less than that "24 days left", and under 30 days the access is ending.
 */
export function describeEnrolmentAccess(
  accessExpiresAt: string | null | undefined,
  now: Date = new Date(),
): EnrolmentAccess {
  const ends = toDate(accessExpiresAt);
  if (!ends) {
    return { tone: "lifetime", value: "Lifetime", remaining: "never expires" };
  }
  const value = DATE_FORMAT.format(ends);
  const daysLeft = Math.ceil((ends.getTime() - now.getTime()) / DAY_MS);
  if (daysLeft <= 0) return { tone: "ended", value, remaining: "ended" };
  if (daysLeft < 30) {
    return {
      tone: "ending",
      value,
      remaining: `${plural(daysLeft, "day")} left`,
    };
  }
  if (daysLeft < 60) {
    return {
      tone: "active",
      value,
      remaining: `${plural(daysLeft, "day")} left`,
    };
  }
  const months = Math.max(1, monthsBetween(now, ends));
  if (months < 12) {
    return {
      tone: "active",
      value,
      remaining: `${plural(months, "month")} left`,
    };
  }
  const years = Math.floor(months / 12);
  const extra = months % 12;
  const yearsText = `${years} ${years === 1 ? "yr" : "yrs"}`;
  return {
    tone: "active",
    value,
    remaining: `${yearsText}${extra ? ` ${extra} mo` : ""} left`,
  };
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  card: "card",
  netbanking: "net banking",
  wallet: "wallet",
  emi: "EMI",
  paylater: "pay later",
};

/** How the order was paid, in a buyer's words: "UPI", "card". */
export function paymentMethodLabel(method: string | null): string | null {
  if (!method) return null;
  return PAYMENT_METHOD_LABELS[method.toLowerCase()] ?? method;
}

/**
 * The pace row: "About 2 lessons a week", and when the learner would finish
 * at it, set against when their access ends.
 */
export function describePace(
  pace: CourseAccessPace | null | undefined,
  accessExpiresAt: string | null | undefined,
): { value: string; note: string | null } {
  if (!pace) return { value: "Not enough activity yet", note: null };
  if (pace.lessonsPerWeek === 0) {
    return { value: "No lessons finished lately", note: null };
  }
  const perWeek = Math.round(pace.lessonsPerWeek);
  const value =
    perWeek < 1
      ? "Under a lesson a week"
      : `About ${plural(perWeek, "lesson")} a week`;
  const finish = toDate(pace.projectedFinishAt);
  if (!finish) return { value, note: null };
  const ends = toDate(accessExpiresAt);
  const against = !ends
    ? ""
    : finish.getTime() <= ends.getTime()
      ? ", before access ends"
      : ", after access ends";
  return {
    value,
    note: `On track to finish around ${MONTH_FORMAT.format(finish)}${against}`,
  };
}

/**
 * Everything "Your enrollment" says, as text. The panel is drawn from it,
 * and so is its early copy, the one the document's head draws from this
 * tab's session storage before the page's scripts have run (see
 * `enrolmentWordsCopy`), so the two read the same.
 */
export interface EnrolmentWords {
  /** "20 Oct 2026". */
  enrolledOn: string;
  /** "(1 week ago)". */
  enrolledAgo: string;
  /**
   * "Order #ORD-1 · ₹8,999 via UPI", or "Given free of charge"; for a
   * course that came with another, "… · with <that course>" or "Included
   * with <that course>".
   */
  order: string;
  /** Whether "Invoice" follows the order. */
  hasInvoice: boolean;
  access: EnrolmentAccess;
  /** "Access", "Access until" or, while it is ending, "Access ends soon". */
  accessLabel: string;
  /** Under the access row: only access that does not end has one. */
  accessNote: string | null;
  pace: { value: string; note: string | null };
}

export function describeEnrolmentWords(
  enrollment: CourseAccessEnrollment,
  accessExpiresAt: string | null,
  now: Date = new Date(),
): EnrolmentWords {
  const access = describeEnrolmentAccess(accessExpiresAt, now);
  const order = enrollment.order;
  const method = paymentMethodLabel(order?.paymentMethod ?? null);
  const orderText = order
    ? `Order #${order.orderNumber.replace(/^#/u, "")}${
        order.totalAmount > 0
          ? ` · ${formatMoney(order.totalAmount, { currency: order.currency })}${
              method ? ` via ${method}` : ""
            }`
          : ""
      }`
    : null;
  const includedWith = enrollment.includedWith;
  return {
    enrolledOn: formatEnrolmentDate(enrollment.enrolledAt),
    enrolledAgo: `(${formatTimeAgo(enrollment.enrolledAt, now.getTime())})`,
    order: includedWith
      ? orderText
        ? `${orderText} · with ${includedWith}`
        : `Included with ${includedWith}`
      : (orderText ?? "Given free of charge"),
    hasInvoice: Boolean(order?.hasInvoice),
    access,
    accessLabel:
      access.tone === "ending"
        ? "Access ends soon"
        : access.tone === "lifetime"
          ? "Access"
          : "Access until",
    accessNote:
      access.tone === "lifetime"
        ? "No end date · learn at whatever pace suits you"
        : null,
    pace: describePace(enrollment.pace, accessExpiresAt),
  };
}
