import { DAILY_QUOTE_MAX_LENGTH } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import { sql, type Kysely } from "kysely";

export interface QuoteRow {
  id: number;
  text: string;
  author: string;
}

/** The PostgreSQL "undefined_table" code: the quotes migration has not run yet. */
const UNDEFINED_TABLE = "42P01";

export function isMissingQuotesTable(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === UNDEFINED_TABLE
  );
}

/**
 * A quote too long for the home page to set in two lines is left out of
 * the rotation, whether or not it is marked active.
 */
const shortEnoughToShow = sql<boolean>`char_length(text) <= ${DAILY_QUOTE_MAX_LENGTH}`;

/** How many quotes are in the rotation. */
export async function countActiveQuotes(
  database: Kysely<Database>,
): Promise<number> {
  const row = await database
    .selectFrom("quotes")
    .select((expression) => expression.fn.countAll<string>().as("count"))
    .where("is_active", "=", true)
    .where(shortEnoughToShow)
    .executeTakeFirstOrThrow();

  return Number(row.count);
}

/** The quote at `position` in the rotation, counted from zero in id order. */
export async function findActiveQuoteAt(
  database: Kysely<Database>,
  position: number,
): Promise<QuoteRow | null> {
  const row = await database
    .selectFrom("quotes")
    .select(["id", "text", "author"])
    .where("is_active", "=", true)
    .where(shortEnoughToShow)
    .orderBy("id")
    .offset(position)
    .limit(1)
    .executeTakeFirst();

  return row ?? null;
}
