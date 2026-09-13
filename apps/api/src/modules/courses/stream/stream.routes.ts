import {
  streamLectureParamsSchema,
  streamCourseLectureParamsSchema,
  streamResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import { createStreamController } from "./stream.controller.ts";
import { createStreamService } from "./stream.service.ts";

const streamRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const authMiddleware = createAuthMiddleware(sessionService);

  const requireAuthenticated = [
    authMiddleware.authenticate,
    authMiddleware.requireAuthenticated,
  ];

  const service = createStreamService({
    database: options.database,
    services: options.services,
  });
  const controller = createStreamController({ service });

  app.get(
    "/stream/lectures/:lectureId",
    {
      schema: {
        operationId: "getLectureStreamUrl",
        tags: ["Streaming"],
        summary: "Get playback stream URL for an enrolled lecture",
        description:
          "Validates course enrollment before returning the streaming URL for video playback.",
        params: streamLectureParamsSchema,
        response: {
          200: jsonResponse(
            "Streaming playback URL and metadata",
            streamResponseSchema,
          ),
          400: errorResponse("Lecture does not have streamable video content"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden - not enrolled in course"),
          404: errorResponse("Lecture or course not found"),
          409: errorResponse(
            "Video is currently processing and not ready for streaming",
          ),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.getLectureStreamUrl,
  );

  app.get(
    "/stream/:courseId/:lectureId",
    {
      schema: {
        operationId: "getCourseLectureStreamUrl",
        tags: ["Streaming"],
        summary: "Get playback stream URL for an enrolled course lecture",
        description:
          "Validates course enrollment and lecture membership before returning the streaming URL for video playback.",
        params: streamCourseLectureParamsSchema,
        response: {
          200: jsonResponse(
            "Streaming playback URL and metadata",
            streamResponseSchema,
          ),
          400: errorResponse("Lecture does not have streamable video content"),
          401: errorResponse("Authentication required"),
          403: errorResponse("Forbidden - not enrolled in course"),
          404: errorResponse("Lecture or course not found"),
          409: errorResponse(
            "Video is currently processing and not ready for streaming",
          ),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.getCourseLectureStreamUrl,
  );
};

export default streamRoutes;
