/**
 * The TDS a payout suggests (PRD section 10, "Tax figures on a payout").
 * A suggestion only: the academy and its accountant decide, and the admin
 * can change the figure before marking the payout paid.
 *
 * Commission paid to one person attracts TDS once the year's total passes
 * ₹20,000 (Section 194H; Section 393(1) of the new Act from 1 April 2026):
 * 2% with a PAN, 20% without one.
 */

/** ₹20,000 in paise. */
export const TDS_THRESHOLD_MINOR = 2_000_000;
/** Basis points. */
export const TDS_RATE_WITH_PAN = 200;
export const TDS_RATE_WITHOUT_PAN = 2000;

export interface TdsSuggestion {
  /** Basis points used. */
  rate: number;
  suggested: number;
  /** This payout takes the year's total over the threshold for the first time. */
  crossesThreshold: boolean;
}

export function suggestTds(input: {
  /** Commission already paid to this affiliate in the financial year. */
  yearPaidMinor: number;
  grossMinor: number;
  panOnFile: boolean;
}): TdsSuggestion {
  const rate = input.panOnFile ? TDS_RATE_WITH_PAN : TDS_RATE_WITHOUT_PAN;
  const total = input.yearPaidMinor + input.grossMinor;
  if (input.grossMinor <= 0 || total <= TDS_THRESHOLD_MINOR) {
    return { rate, suggested: 0, crossesThreshold: false };
  }
  return {
    rate,
    suggested: Math.round((input.grossMinor * rate) / 10_000),
    crossesThreshold: input.yearPaidMinor <= TDS_THRESHOLD_MINOR,
  };
}

/**
 * The Indian financial year holding a day: 1 April to 31 March. Returns the
 * first and last day as YYYY-MM-DD.
 */
export function financialYearOf(day: string): { from: string; to: string } {
  const [year, month] = day.split("-").map(Number) as [number, number];
  const start = month >= 4 ? year : year - 1;
  return { from: `${start}-04-01`, to: `${start + 1}-03-31` };
}

/** Today in India, YYYY-MM-DD. */
export function indiaToday(now = new Date()): string {
  return new Date(now.getTime() + 330 * 60 * 1000).toISOString().slice(0, 10);
}

/**
 * A `date` column as YYYY-MM-DD. The driver reads dates as a Date at local
 * midnight, so the local parts are the day that was stored.
 */
export function dayString(value: string | Date | null): string | null {
  if (value === null || typeof value === "string") return value;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
}
