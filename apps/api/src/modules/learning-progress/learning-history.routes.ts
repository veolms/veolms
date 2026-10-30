import {
  learningCommunityResponseSchema,
  learningHistoryQuerySchema,
  learningHistoryResponseSchema,
  progressSharingResponseSchema,
  updateProgressSharingRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createLearningHistoryController } from "./learning-history.controller.ts";
import { createLearningHistoryService } from "./learning-history.service.ts";

const learningHistoryRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const service = createLearningHistoryService({
    database: options.database,
    services: options.services,
  });
  const controller = createLearningHistoryController({ service });

  app.get(
    "/learning/history",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getLearningHistory",
        tags: ["Learning Progress"],
        summary: "Get a learner's days of learning in a range",
        description:
          "Returns the days in the range that have something recorded: the time learned, the goal of that day, " +
          "and the courses the time went to. Without `username` it is the viewer's own history. Another learner's " +
          "is given to an admin, and to any member while that learner shares their progress.",
        querystring: learningHistoryQuerySchema,
        response: {
          200: jsonResponse(
            "The learner's days of learning in the range.",
            learningHistoryResponseSchema,
          ),
          400: errorResponse("Invalid date range"),
          401: errorResponse("Authentication required"),
          403: errorResponse("The learner has not shared their progress"),
          404: errorResponse("Learner not found"),
        },
      },
    },
    controller.getHistory,
  );

  app.get(
    "/learning/community",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "listLearningCommunity",
        tags: ["Learning Progress"],
        summary: "List the members who share their progress",
        response: {
          200: jsonResponse(
            "Members who share their progress, with their last seven days.",
            learningCommunityResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.listCommunity,
  );

  app.put(
    "/learning/progress-sharing",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "updateProgressSharing",
        tags: ["Learning Progress"],
        summary: "Share the learner's progress with other members, or stop",
        body: updateProgressSharingRequestSchema,
        response: {
          200: jsonResponse(
            "Whether the learner now shares their progress.",
            progressSharingResponseSchema,
          ),
          400: errorResponse("Invalid request"),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.updateSharing,
  );
};

export default learningHistoryRoutes;
