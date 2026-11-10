import type { AccessExtensionUnit } from "./enrollment.ts";

/**
 * Adds days, months or years to a moment, keeping its time of day. A month
 * that has no such day ends on its last one: Jan 31 + 1 month is Feb 28
 * (or 29), not Mar 3.
 */
export function addAccessPeriod(
  from: Date,
  amount: number,
  unit: AccessExtensionUnit,
): Date {
  const next = new Date(from.getTime());
  if (unit === "days") {
    next.setUTCDate(next.getUTCDate() + amount);
    return next;
  }
  const months = unit === "years" ? amount * 12 : amount;
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0),
  ).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

/**
 * What an extension is added to: the current end date, or now when access
 * has already run out (an extension of lapsed access starts today).
 */
export function extensionBase(currentEnd: Date | null, now: Date): Date {
  return currentEnd && currentEnd.getTime() > now.getTime() ? currentEnd : now;
}
