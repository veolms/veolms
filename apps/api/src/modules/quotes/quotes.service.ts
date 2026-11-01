import type { DailyQuoteResponse } from "@veolms/contracts";
import type { Database } from "@veolms/database";
import type { Kysely } from "kysely";
import { httpError } from "../../lib/errors.ts";
import {
  countActiveQuotes,
  findActiveQuoteAt,
  isMissingQuotesTable,
} from "./quotes.repository.ts";

const DAY_MS = 24 * 60 * 60 * 1000;
/**
 * Consecutive days are this many places apart in the list, so quotes that
 * were added together (several by one author, say) do not follow each other.
 */
const ROTATION_STEP = 7919;

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * Where in a rotation of `count` quotes the given day falls. The step shares
 * no factor with the count, so every quote is shown once before any repeats.
 */
function rotationPosition(day: number, count: number): number {
  let step = ROTATION_STEP % count || 1;
  while (greatestCommonDivisor(step, count) !== 1) step += 1;
  return (day * step) % count;
}

export interface DailyQuote {
  quote: DailyQuoteResponse;
  /** Seconds until the next day's quote takes over. */
  secondsUntilNext: number;
}

export function createQuotesService({
  database,
}: {
  database: Kysely<Database>;
}) {
  // Every learner's home page asks for the same quote, so it is read once a
  // day rather than once a visit.
  let cached: { day: number; quote: DailyQuoteResponse } | undefined;

  async function getDailyQuote(now = Date.now()): Promise<DailyQuote> {
    const day = Math.floor(now / DAY_MS);
    const secondsUntilNext = Math.ceil(((day + 1) * DAY_MS - now) / 1000);
    if (cached?.day === day) return { quote: cached.quote, secondsUntilNext };

    let quote: DailyQuoteResponse | null = null;
    try {
      const count = await countActiveQuotes(database);
      if (count > 0) {
        quote = await findActiveQuoteAt(database, rotationPosition(day, count));
      }
    } catch (error) {
      if (!isMissingQuotesTable(error)) throw error;
    }
    if (!quote) {
      throw httpError(404, "QUOTE_NOT_FOUND", "There is no quote to show.");
    }

    cached = { day, quote };
    return { quote, secondsUntilNext };
  }

  return { getDailyQuote };
}

export type QuotesService = ReturnType<typeof createQuotesService>;
