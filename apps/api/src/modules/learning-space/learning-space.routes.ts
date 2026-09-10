import {
  closeLearningSpaceSessionResponseSchema,
  learningSpaceSessionParamsSchema,
  learningSpaceSessionSchema,
  learningSpaceSessionsResponseSchema,
  upsertLearningSpaceSessionRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import { createLearningSpaceController } from "./learning-space.controller.ts";
import { createLearningSpaceService } from "./learning-space.service.ts";

const learningSpaceRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const service = createLearningSpaceService({ database: options.database });
  const controller = createLearningSpaceController({ service });

  app.get(
    "/learning-space/sessions",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "listLearningSpaceSessions",
        tags: ["Learning Space"],
        summary: "List active Learning Space sessions",
        response: {
          200: jsonResponse(
            "Active Learning Space sessions",
            learningSpaceSessionsResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.list,
  );

  app.put(
    "/learning-space/sessions/:courseKey",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "upsertLearningSpaceSession",
        tags: ["Learning Space"],
        summary: "Create or update an active Learning Space session",
        params: learningSpaceSessionParamsSchema,
        body: upsertLearningSpaceSessionRequestSchema,
        response: {
          200: jsonResponse(
            "Learning Space session saved",
            learningSpaceSessionSchema,
          ),
          400: errorResponse("Invalid session data"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access required"),
          404: errorResponse("Course or lesson not found"),
        },
      },
    },
    controller.upsert,
  );

  app.delete(
    "/learning-space/sessions/:courseKey",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "closeLearningSpaceSession",
        tags: ["Learning Space"],
        summary: "Close an active Learning Space session",
        params: learningSpaceSessionParamsSchema,
        response: {
          200: jsonResponse(
            "Learning Space session closed",
            closeLearningSpaceSessionResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.close,
  );
};

export default learningSpaceRoutes;
