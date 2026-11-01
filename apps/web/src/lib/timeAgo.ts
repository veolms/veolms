/**
 * How long ago something was written, the way discussions show it:
 * "Just now", "3 minutes ago", "2 hours ago", "1 day ago", "2 weeks ago",
 * then months and years to one decimal ("1.5 months ago", "1.9 years ago").
 * The exact moment goes in a tooltip (see `formatExactTime` and TimeAgo).
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
// Average lengths, so "1.5 months" is the same span in any month.
const MONTH = 30.4375 * DAY;
const YEAR = 365.25 * DAY;

function toDate(value: string | number | Date): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function count(amount: number, unit: string): string {
  return `${amount} ${amount === 1 ? unit : `${unit}s`} ago`;
}

/** A number to one decimal, without a trailing ".0". */
function oneDecimal(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatTimeAgo(
  value: string | number | Date,
  now: number = Date.now(),
): string {
  const date = toDate(value);
  if (!date) return "";
  const elapsed = Math.max(0, now - date.getTime());

  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return count(Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return count(Math.floor(elapsed / HOUR), "hour");
  if (elapsed < 7 * DAY) return count(Math.floor(elapsed / DAY), "day");
  if (elapsed < MONTH) return count(Math.floor(elapsed / (7 * DAY)), "week");

  const months = oneDecimal(elapsed / MONTH);
  if (months < 12) return count(months, "month");
  return count(oneDecimal(elapsed / YEAR), "year");
}

// Day first, as the rest of the app writes dates: "19 Oct 2026, 4:25 pm".
const EXACT_TIME_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** The exact moment, in the reader's own time zone. */
export function formatExactTime(value: string | number | Date): string {
  const date = toDate(value);
  return date ? EXACT_TIME_FORMAT.format(date) : "";
}
