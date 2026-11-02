import { useQuery } from "@tanstack/react-query";
import {
  dailyQuoteResponseSchema,
  type DailyQuoteResponse,
} from "@veolms/contracts/quotes";
import type { ApiError } from "../../lib/api-error";
import { quotesService } from "./quotes.service";

export const quotesKeys = {
  all: ["quotes"] as const,
  daily: () => [...quotesKeys.all, "daily"] as const,
};

const SAVED_QUOTE_KEY = "veolms-daily-quote";

/** The quote changes with the UTC day, so that is the day it is kept for. */
const utcDay = (time: number) => new Date(time).toISOString().slice(0, 10);

/** How long until the UTC day of `time` ends, when the next quote is out. */
const untilNextUtcDay = (time: number) => {
  const next = new Date(time);
  next.setUTCHours(24, 0, 0, 0);
  return Math.max(0, next.getTime() - Date.now());
};

interface SavedQuote {
  quote: DailyQuoteResponse;
  savedAt: number;
}

/**
 * The quote this browser was last given, if it was given today. A page that
 * is opened again the same day shows it at once, in the lines it will keep,
 * instead of a placeholder that can only guess at them.
 */
function readSavedQuote(): SavedQuote | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const saved: unknown = JSON.parse(
      window.localStorage.getItem(SAVED_QUOTE_KEY) ?? "null",
    );
    if (!saved || typeof saved !== "object") return undefined;
    const { quote, savedAt } = saved as Record<string, unknown>;
    const parsed = dailyQuoteResponseSchema.safeParse(quote);
    if (!parsed.success || typeof savedAt !== "number") return undefined;
    if (utcDay(savedAt) !== utcDay(Date.now())) return undefined;
    return { quote: parsed.data, savedAt };
  } catch {
    return undefined;
  }
}

function saveQuote(quote: DailyQuoteResponse) {
  try {
    window.localStorage.setItem(
      SAVED_QUOTE_KEY,
      JSON.stringify({ quote, savedAt: Date.now() } satisfies SavedQuote),
    );
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
}

/**
 * The quote of the day. It is asked for in the browser, never while a page
 * is prerendered, so a built page does not carry the quote of its build day.
 * It changes once a day, so it is not asked for again until the day is
 * over, and the one given today is kept for the next time the page is
 * opened.
 */
export function useDailyQuote() {
  return useQuery<DailyQuoteResponse, ApiError>({
    queryKey: quotesKeys.daily(),
    queryFn: async () => {
      const quote = await quotesService.getDaily();
      saveQuote(quote);
      return quote;
    },
    initialData: () => readSavedQuote()?.quote,
    initialDataUpdatedAt: () => readSavedQuote()?.savedAt,
    enabled: typeof window !== "undefined",
    retry: false,
    staleTime: (query) => untilNextUtcDay(query.state.dataUpdatedAt),
    refetchOnWindowFocus: false,
  });
}
