import type { DatabaseExecutor } from "@veolms/database";
import { sql } from "kysely";

/**
 * `course_pricing.show_discount_badge` arrives with a migration, and the API
 * can be running before that migration has been applied. Queries that name
 * the column ask here first, so course listings keep working (with the badge
 * off) until it exists.
 *
 * Once seen, the column is assumed to stay; while it is missing the check is
 * repeated at most every half minute, so a migration is picked up without a
 * restart.
 */
const MISSING_RECHECK_MS = 30_000;

let columnExists = false;
let checkedAt = 0;
let pendingCheck: Promise<boolean> | undefined;

export async function hasDiscountBadgeColumn(
  database: DatabaseExecutor,
): Promise<boolean> {
  if (columnExists) return true;
  if (Date.now() - checkedAt < MISSING_RECHECK_MS) return false;

  pendingCheck ??= sql<{ present: boolean }>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = 'course_pricing'
        and column_name = 'show_discount_badge'
    ) as present
  `
    .execute(database)
    .then((result) => result.rows[0]?.present === true)
    // A failed check is not evidence either way: treat as missing for now.
    .catch(() => false)
    .then((present) => {
      columnExists = present;
      checkedAt = Date.now();
      pendingCheck = undefined;
      return present;
    });
  return pendingCheck;
}
