import { AppError } from "../../lib/errors.ts";

/** A (created_at, id) list position, opaque to the client. */
export function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`).toString("base64url");
}

export function decodeCursor(
  cursor: string | undefined,
): { createdAt: Date; id: string } | undefined {
  if (!cursor) return undefined;
  const [iso, id] = Buffer.from(cursor, "base64url")
    .toString("utf8")
    .split("|");
  const createdAt = new Date(iso ?? "");
  if (!id || Number.isNaN(createdAt.getTime())) {
    throw new AppError(
      400,
      "INVALID_CURSOR",
      "That page link is no longer valid.",
    );
  }
  return { createdAt, id };
}

/** A page of `limit` from `limit + 1` rows, and the cursor after it. */
export function pageOf<T extends { created_at: Date; id: string }>(
  rows: T[],
  limit: number,
): { page: T[]; nextCursor: string | null } {
  const page = rows.slice(0, limit);
  const last = page.at(-1);
  return {
    page,
    nextCursor:
      rows.length > limit && last
        ? encodeCursor(last.created_at, last.id)
        : null,
  };
}

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
