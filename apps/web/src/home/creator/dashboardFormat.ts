import { formatMoney } from "@veolms/contracts/commerce/money";

export function getDashboardGreeting(hour = new Date().getHours()) {
  if (hour >= 5 && hour < 12) return "Good morning";
  if (hour >= 12 && hour < 17) return "Good afternoon";
  if (hour >= 17 && hour < 21) return "Good evening";
  return "Good night";
}

/** Dashboard revenue figures arrive in minor units (paise). */
export function formatDashboardCurrency(value: number, currency: string) {
  return formatMoney(value, { currency, decimals: "never" });
}

/** A point of the revenue chart series, which is held in major units. */
export function formatDashboardChartCurrency(value: number, currency: string) {
  return formatMoney(value, { currency, unit: "major", decimals: "never" });
}

export function formatDashboardNumber(value: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(
    value,
  );
}

export function formatDashboardPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 0,
  }).format(value)}%`;
}

export function formatEnrollmentComparisonPercent(value: number) {
  return `${new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 1,
  }).format(value)}%`;
}
