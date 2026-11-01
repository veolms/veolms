/**
 * Calendar days as the history gives them: `YYYY-MM-DD` strings in the
 * learner's own calendar. They are never turned into moments in time (a
 * `Date` here is only a way to count days, always in UTC), so the viewer's
 * time zone cannot move a day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtc(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return Date.UTC(year!, month! - 1, day!);
}

function fromUtc(time: number) {
  return new Date(time).toISOString().slice(0, 10);
}

/** The device's own today, used until the learner's is known. */
export function deviceToday(now = new Date()) {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDays(date: string, days: number) {
  return fromUtc(toUtc(date) + days * DAY_MS);
}

/** The `YYYY-MM` a day falls in. */
export function monthOf(date: string) {
  return date.slice(0, 7);
}

export function addMonths(month: string, months: number) {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year!, index! - 1 + months, 1))
    .toISOString()
    .slice(0, 7);
}

export function firstDayOf(month: string) {
  return `${month}-01`;
}

export function lastDayOf(month: string) {
  return addDays(firstDayOf(addMonths(month, 1)), -1);
}

/** Every day from one to another, both included. */
export function daysBetween(from: string, to: string) {
  const days: string[] = [];
  for (let time = toUtc(from); time <= toUtc(to); time += DAY_MS) {
    days.push(fromUtc(time));
  }
  return days;
}

/**
 * A month as the rows of a calendar that starts its weeks on Monday. The
 * places before the 1st and after the last day are null.
 */
export function monthWeeks(month: string): Array<Array<string | null>> {
  const first = firstDayOf(month);
  // getUTCDay: Sunday is 0. Monday-first: Monday is 0.
  const lead = (new Date(toUtc(first)).getUTCDay() + 6) % 7;
  const cells: Array<string | null> = [
    ...Array.from({ length: lead }, () => null),
    ...daysBetween(first, lastDayOf(month)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: Array<Array<string | null>> = [];
  for (let index = 0; index < cells.length; index += 7) {
    weeks.push(cells.slice(index, index + 7));
  }
  return weeks;
}

const monthName = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const dayName = new Intl.DateTimeFormat("en", {
  weekday: "short",
  timeZone: "UTC",
});
// Day before month, as the date on the learner's home is written.
const fullDay = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

/** "October 2026". */
export function formatMonth(month: string) {
  return monthName.format(toUtc(firstDayOf(month)));
}

/** "Tue". */
export function formatWeekday(date: string) {
  return dayName.format(toUtc(date));
}

/** "Tuesday 13 October". */
export function formatDay(date: string) {
  return fullDay.format(toUtc(date));
}

export function dayOfMonth(date: string) {
  return Number(date.slice(8, 10));
}
