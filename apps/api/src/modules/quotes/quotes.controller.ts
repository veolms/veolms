import type { FastifyReply, FastifyRequest } from "fastify";
import type { QuotesService } from "./quotes.service.ts";

/** The quote is the same for everyone, so browsers and the CDN may keep it. */
const DAILY_QUOTE_MAX_AGE_SECONDS = 60 * 60;

export function createQuotesController({
  service,
}: {
  service: QuotesService;
}) {
  async function getDailyQuote(_request: FastifyRequest, reply: FastifyReply) {
    const { quote, secondsUntilNext } = await service.getDailyQuote();
    // Never kept past the moment the next day's quote takes over.
    const maxAge = Math.min(DAILY_QUOTE_MAX_AGE_SECONDS, secondsUntilNext);
    reply.header("Cache-Control", `public, max-age=${maxAge}`);
    return quote;
  }

  return { getDailyQuote };
}

export type QuotesController = ReturnType<typeof createQuotesController>;
