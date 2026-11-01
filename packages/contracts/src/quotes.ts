import { z } from "zod";

/**
 * The longest quote the daily rotation uses, in characters. The learner's
 * home sets the quote in two lines at most beside its picture, in a box 28
 * times the quote's font size wide (see `heroQuoteBoxClasses` in the web
 * app); measured in the faces it is set in, every quote up to this length
 * fits that with room to spare, and the first longer one does not. A longer
 * quote stays in the table and is simply never picked.
 */
export const DAILY_QUOTE_MAX_LENGTH = 110;

export const dailyQuoteResponseSchema = z
  .object({
    id: z.number().int().positive(),
    text: z.string().min(1),
    author: z.string().min(1),
  })
  .describe(
    "The quote of the day: the same one for every visitor until the next day (UTC).",
  );

export type DailyQuoteResponse = z.output<typeof dailyQuoteResponseSchema>;
