import { firstMovesResponseSchema } from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../authorization/index.ts";
import { createFirstMovesService } from "./first-moves.service.ts";

/** The admin home's "first five moves": what a new academy has done yet. */
const firstMovesRoutes: RoutePlugin = async (app, options) => {
  const { requires } = createPermissionPreHandlers(options.database);
  const service = createFirstMovesService({ database: options.database });

  app.get(
    "/academy/first-moves",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "getAcademyFirstMoves",
        tags: ["Academy"],
        summary: "Which of a new academy's first five moves are done",
        description:
          "Logo or colour, payment account, first course, a paid order, the link shared. Read from the academy's own data.",
        response: {
          200: jsonResponse("The first moves.", firstMovesResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    async () => await service.getFirstMoves(),
  );

  app.post(
    "/academy/first-moves/share",
    {
      preHandler: requires("platform.settings.read"),
      schema: {
        operationId: "markAcademyLinkShared",
        tags: ["Academy"],
        summary: "Record that the academy's link was shared",
        response: {
          200: jsonResponse("The first moves.", firstMovesResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    async () => await service.markLinkShared(),
  );
};

export default firstMovesRoutes;
