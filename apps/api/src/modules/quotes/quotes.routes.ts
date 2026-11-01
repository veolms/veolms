import { dailyQuoteResponseSchema } from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createQuotesController } from "./quotes.controller.ts";
import { createQuotesService } from "./quotes.service.ts";

const quotesRoutes: RoutePlugin = async (app, options) => {
  const service = createQuotesService({ database: options.database });
  const controller = createQuotesController({ service });

  app.get(
    "/quotes/daily",
    {
      schema: {
        operationId: "getDailyQuote",
        tags: ["Home"],
        summary: "Get the quote of the day",
        description:
          "Returns one quote, the same for every visitor until the next day (UTC). Public and cacheable: the response is not personal.",
        response: {
          200: jsonResponse("The quote of the day.", dailyQuoteResponseSchema),
          404: errorResponse("There are no quotes to show"),
        },
      },
    },
    controller.getDailyQuote,
  );
};

export default quotesRoutes;
