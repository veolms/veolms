import { sql, type RawBuilder } from "kysely";

/**
 * The timestamp a keyset cursor should compare against, at the precision
 * the database stores it.
 *
 * A cursor carries the last row's timestamp as a JavaScript date, which
 * stops at milliseconds; the columns hold microseconds. Comparing against
 * the shortened value skipped every row that fell in the gap between the
 * two — routinely the case for rows written in one statement, which share
 * a timestamp to the microsecond. This reads the exact value back from the
 * cursor's own row instead.
 *
 * The stored value is used only when it lies within the cursor's
 * millisecond: a row that has since been deleted, or whose `updated_at`
 * has moved on, falls back to the cursor's value rather than shifting the
 * page boundary.
 *
 * `tables` lists where the row may live (a merged feed has more than one).
 * `rowId` must already be validated as a UUID.
 */
export function exactCursorTimestamp(
  tables: readonly string[],
  column: "created_at" | "updated_at",
  rowId: string,
  cursorValue: Date,
): RawBuilder<Date> {
  const lookups = tables.map(
    (table) => sql`(
      select cursor_row.${sql.ref(column)}
      from ${sql.table(table)} as cursor_row
      where cursor_row.id = ${rowId}::uuid
        and cursor_row.${sql.ref(column)} >= ${cursorValue}::timestamptz
        and cursor_row.${sql.ref(column)}
          < ${cursorValue}::timestamptz + interval '1 millisecond'
    )`,
  );
  return sql<Date>`coalesce(${sql.join(lookups)}, ${cursorValue}::timestamptz)`;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Whether a cursor's id can be handed to a `uuid` comparison. */
export function isCursorUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}
