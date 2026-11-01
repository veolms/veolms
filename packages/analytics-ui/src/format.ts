import { formatMoney, toMajorUnits } from "@veolms/contracts/commerce/money";

/** Formats a revenue figure. Analytics revenue is in minor units (paise). */
export function formatCurrencyAmount(amount: number, currency = "INR"): string {
  return formatMoney(amount, { currency, decimals: "never" });
}

/**
 * Charts scale and label plain numbers, so a revenue series is converted to
 * major units once, where it enters the chart, and its tooltip is formatted
 * with {@link formatChartCurrency}.
 */
export function toRevenueChartData(
  points: ReadonlyArray<{ date: string; value: number }>,
  currency = "INR",
) {
  return toChartData(
    points.map((point) => ({
      ...point,
      value: toMajorUnits(point.value, currency),
    })),
  );
}

export function formatChartCurrency(value: number, currency = "INR"): string {
  return formatMoney(value, { currency, unit: "major", decimals: "never" });
}

export function formatWholeNumber(value: number): string {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

/** 1.2K, 3.4M: for axis ticks and tight tiles. */
export function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatHours(value: number): string {
  return `${formatWholeNumber(value)} hrs`;
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

/** One decimal where it matters (2.4%), none for whole numbers (68%). */
export function formatPrecisePercent(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)}%`;
}

/** 1h 42m, 42m, 0m. */
export function formatDuration(seconds: number): string {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

/**
 * The label for one day of an analytics trend. The API buckets a trend by
 * UTC calendar day ("2026-10-12"), so the label is that UTC day: formatted
 * in the viewer's own time zone, a day read as the one before it anywhere
 * west of UTC. The dashboard revenue chart labels its days the same way.
 */
export function formatTrendDate(date: string): string {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(date));
}

export interface ChartDatum {
  label: string;
  value: number;
}

export function toChartData(
  points: ReadonlyArray<{ date: string; value: number }>,
): ChartDatum[] {
  return points.map((point) => ({
    label: formatTrendDate(point.date),
    value: point.value,
  }));
}
