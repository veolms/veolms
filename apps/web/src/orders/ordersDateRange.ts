/**
 * The Orders screen's date ranges: three chips (1D, 7D, 30D), the calendar's
 * quick ranges, and a custom range of whole days. Every range is in the
 * viewer's own time zone and ends no later than today.
 */

export const DATE_CHIPS = ["1d", "7d", "30d"] as const;
export const QUICK_RANGES = [
  "this_month",
  "last_month",
  "3m",
  "6m",
  "1y",
] as const;

export type DateChip = (typeof DATE_CHIPS)[number];
export type QuickRange = (typeof QUICK_RANGES)[number];
export type DateRangeKey = DateChip | QuickRange | "custom";

export const DEFAULT_DATE_RANGE: DateRangeKey = "1d";

const RANGE_LABELS: Record<Exclude<DateRangeKey, "custom">, string> = {
  "1d": "1D",
  "7d": "7D",
  "30d": "30D",
  this_month: "This month",
  last_month: "Last month",
  "3m": "Last 3 months",
  "6m": "Last 6 months",
  "1y": "Last 1 year",
};

export function dateRangeLabel(key: Exclude<DateRangeKey, "custom">): string {
  return RANGE_LABELS[key];
}

export function isDateRangeKey(value: string): value is DateRangeKey {
  return value === "custom" || value in RANGE_LABELS;
}

export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function endOfDay(date: Date): Date {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    23,
    59,
    59,
    999,
  );
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, date.getDate());
}

/** `2026-11-09` for a calendar day, as the URL carries it. */
export function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The calendar day `2026-11-09` names, or null for anything else. */
export function fromDayKey(value: string | null | undefined): Date | null {
  const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  );
  // Rejects 2026-02-31 and the like, which Date rolls over.
  return toDayKey(date) === value ? date : null;
}

export interface ResolvedDateRange {
  from: Date;
  to: Date;
}

/**
 * The first and last moment `key` covers on `now`. A custom range needs
 * both days; one missing (or after today) falls back to today.
 */
export function resolveDateRange(
  key: DateRangeKey,
  now: Date,
  custom?: { from: Date | null; to: Date | null },
): ResolvedDateRange {
  const today = startOfDay(now);
  const to = endOfDay(today);
  switch (key) {
    case "1d":
      return { from: today, to };
    case "7d":
      return { from: addDays(today, -6), to };
    case "30d":
      return { from: addDays(today, -29), to };
    case "this_month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to };
    case "last_month":
      return {
        from: new Date(today.getFullYear(), today.getMonth() - 1, 1),
        to: endOfDay(new Date(today.getFullYear(), today.getMonth(), 0)),
      };
    case "3m":
      return { from: addDays(addMonths(today, -3), 1), to };
    case "6m":
      return { from: addDays(addMonths(today, -6), 1), to };
    case "1y":
      return { from: addDays(addMonths(today, -12), 1), to };
    case "custom": {
      const first = custom?.from;
      const last = custom?.to;
      if (!first || !last) return { from: today, to };
      const [start, end] = first <= last ? [first, last] : [last, first];
      if (start > to) return { from: today, to };
      return {
        from: startOfDay(start),
        to: end > today ? to : endOfDay(end),
      };
    }
  }
}

const SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
});
const LONG = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** "Nov 2 – Nov 9, 2026", or "Nov 9, 2026" for a single day. */
export function formatDayRange(from: Date, to: Date): string {
  if (toDayKey(from) === toDayKey(to)) return LONG.format(from);
  const sameYear = from.getFullYear() === to.getFullYear();
  return `${(sameYear ? SHORT : LONG).format(from)} – ${LONG.format(to)}`;
}
