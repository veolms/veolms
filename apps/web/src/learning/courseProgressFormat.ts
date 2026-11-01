/**
 * A course's progress as it is shown everywhere: with two decimals, so a
 * few minutes of a long course read as something (0.42%), and a finished
 * course as a plain 100%.
 */
export function formatCourseProgress(percent: number): string {
  const value = Math.min(
    100,
    Math.max(0, Number.isFinite(percent) ? percent : 0),
  );
  return value >= 100 ? "100%" : `${value.toFixed(2)}%`;
}

/** A course's progress held to two decimals, for sums worked out here. */
export function roundCourseProgress(percent: number): number {
  if (!Number.isFinite(percent)) return 0;
  return Math.min(100, Math.max(0, Math.round(percent * 100) / 100));
}
