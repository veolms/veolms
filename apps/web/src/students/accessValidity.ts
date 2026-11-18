import { addAccessPeriod } from "@veolms/contracts";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Less than this left, and the card says how many days, in amber. */
export const VALIDITY_SOON_DAYS = 30;

/** "Oct 28, 2028" */
export function formatAccessDate(value: string | Date): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Whole days from `now` until `value`, rounded up; negative once past. */
export function daysUntil(value: string | Date, now = new Date()): number {
  return Math.ceil((new Date(value).getTime() - now.getTime()) / DAY_MS);
}

export interface CalendarSpan {
  years: number;
  months: number;
  days: number;
}

/**
 * The time from `from` to `to` in whole years, months and days, counted
 * the way an extension adds them (Jan 31 + 1 month is the end of February).
 */
export function calendarSpan(from: Date, to: Date): CalendarSpan {
  if (to.getTime() <= from.getTime()) return { years: 0, months: 0, days: 0 };
  let years = 0;
  while (addAccessPeriod(from, years + 1, "years").getTime() <= to.getTime()) {
    years += 1;
  }
  const afterYears = addAccessPeriod(from, years, "years");
  let months = 0;
  while (
    addAccessPeriod(afterYears, months + 1, "months").getTime() <= to.getTime()
  ) {
    months += 1;
  }
  const afterMonths = addAccessPeriod(afterYears, months, "months");
  const days = Math.floor((to.getTime() - afterMonths.getTime()) / DAY_MS);
  return { years, months, days };
}

/** "1y 11m 19d"; `withDays: false` leaves the days out ("1y 11m"). */
export function spanLabel(span: CalendarSpan, withDays = true): string {
  const parts = [
    span.years ? `${span.years}y` : "",
    span.months ? `${span.months}m` : "",
    withDays && span.days ? `${span.days}d` : "",
  ].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return withDays || span.days === 0 ? "0d" : `${span.days}d`;
}

/** "2 years validity", "6 months validity", "45 days validity". */
export function totalValidityLabel(start: Date, end: Date): string {
  const span = calendarSpan(start, end);
  if (span.years && !span.months && span.days < 2) {
    return `${span.years} ${span.years === 1 ? "year" : "years"} validity`;
  }
  const months = span.years * 12 + span.months;
  if (months && span.days < 2) {
    return `${months} ${months === 1 ? "month" : "months"} validity`;
  }
  const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  return `${days} ${days === 1 ? "day" : "days"} validity`;
}
