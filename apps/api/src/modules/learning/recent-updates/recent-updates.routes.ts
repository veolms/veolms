import {
  recentUpdatesQuerySchema,
  recentUpdatesResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthContext } from "../../auth/shared/auth.context.ts";
import { createRecentUpdatesController } from "./recent-updates.controller.ts";
import { createDefaultRecentUpdatesService } from "./recent-updates.service.ts";

const recentUpdatesRoutes: RoutePlugin = async (app, options) => {
  const auth = createAuthContext(options);
  const service = createDefaultRecentUpdatesService({
    database: options.database,
  });
  const controller = createRecentUpdatesController({ service });

  app.get(
    "/learning/recent-updates",
    {
      preHandler: auth.mfaVerified,
      schema: {
        operationId: "listRecentLearningUpdates",
        tags: ["Learning"],
        summary: "List recently updated content for the authenticated learner",
        description:
          "Returns recently updated published lessons from the learner's active enrolled courses. Lesson updatedAt is used as the availability approximation because lesson-level publication timestamps are not stored.",
        querystring: recentUpdatesQuerySchema,
        response: {
          200: jsonResponse(
            "Recently updated learner course content",
            recentUpdatesResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.list,
  );
};

export default recentUpdatesRoutes;
