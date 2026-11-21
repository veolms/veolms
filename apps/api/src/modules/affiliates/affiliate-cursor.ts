import { AppError } from "../../lib/errors.ts";

/** A report period from IST dates; the last 30 days by default. */
export function periodOf(query: { from?: string; to?: string }): {
  from: Date;
  to: Date;
} {
  const to = query.to ? new Date(`${query.to}T23:59:59.999+05:30`) : new Date();
  const from = query.from
    ? new Date(`${query.from}T00:00:00+05:30`)
    : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  if (from > to) {
    throw new AppError(
      400,
      "INVALID_PERIOD",
      "The period ends before it starts.",
    );
  }
  return { from, to };
}

/** Optional IST day bounds, each on its own: from the start of `from`, to the end of `to`. */
export function dayBounds(query: { from?: string; to?: string }): {
  from?: Date;
  to?: Date;
} {
  return {
    from: query.from ? new Date(`${query.from}T00:00:00+05:30`) : undefined,
    to: query.to
      ? new Date(new Date(`${query.to}T00:00:00+05:30`).getTime() + 86_400_000)
      : undefined,
  };
}

/** Offset and limit for a 1-based page, and the page count for a total. */
export function pageWindow(page: number, pageSize: number) {
  return { offset: (page - 1) * pageSize, limit: pageSize };
}

export function pageCountOf(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / pageSize));
}
