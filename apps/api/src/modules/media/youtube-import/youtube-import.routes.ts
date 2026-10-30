import { z } from "zod";
import {
  youtubeImportAvailabilityResponseSchema,
  youtubeImportControlResponseSchema,
  youtubeImportLessonQuerySchema,
  youtubeImportLessonResponseSchema,
  youtubeImportPreviewRequestSchema,
  youtubeImportPreviewResponseSchema,
  youtubeImportRequestSchema,
  youtubeImportResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
} from "../../authorization/index.ts";

import { createYoutubeImportController } from "./youtube-import.controller.ts";
import { createYoutubeImportService } from "./youtube-import.service.ts";
import { getYoutubeImportTools } from "./youtube-import.tools.ts";

const youtubeImportRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const authMiddleware = createAuthMiddleware(sessionService);
  const authorizationGuard = createAuthorizationGuard(
    createAuthorizationService(options.database),
  );
  // Admin-only by default (the permission is granted to admin alone); the
  // service also checks the person may manage the lesson's course.
  const requireImporter = [
    authMiddleware.authenticate,
    authMiddleware.requireAuthenticated,
    authMiddleware.requireMfaVerified,
    authorizationGuard.authorizeAny(["lesson.video.import_youtube"]),
  ];

  const service = createYoutubeImportService({
    database: options.database,
    services: options.services,
    tools: getYoutubeImportTools(options.services.config, app.log),
  });
  const controller = createYoutubeImportController({ service });

  app.get(
    "/media/youtube-import/availability",
    {
      schema: {
        operationId: "getYoutubeImportAvailability",
        tags: ["Media"],
        summary: "Whether lesson videos can be imported from YouTube",
        response: {
          200: jsonResponse(
            "Availability",
            youtubeImportAvailabilityResponseSchema,
          ),
        },
      },
      preHandler: requireImporter,
    },
    controller.getAvailability,
  );

  app.post(
    "/media/youtube-import/preview",
    {
      // Each call runs yt-dlp against YouTube: keep one account from
      // hammering it (and getting the server's IP rate-limited).
      config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
      schema: {
        operationId: "previewYoutubeImport",
        tags: ["Media"],
        summary: "Read a YouTube video's details before importing it",
        body: youtubeImportPreviewRequestSchema,
        response: {
          200: jsonResponse(
            "Video details",
            youtubeImportPreviewResponseSchema,
          ),
          400: errorResponse("Not a link to one YouTube video"),
          403: errorResponse("YouTube import is turned off"),
          422: errorResponse("The video cannot be imported"),
          502: errorResponse("YouTube could not be reached"),
        },
      },
      preHandler: requireImporter,
    },
    controller.preview,
  );

  app.post(
    "/media/youtube-import",
    {
      config: { rateLimit: { max: 10, timeWindow: "1 minute" } },
      schema: {
        operationId: "startYoutubeImport",
        tags: ["Media"],
        summary: "Import a YouTube video into a lesson",
        body: youtubeImportRequestSchema,
        response: {
          202: jsonResponse("Import queued", youtubeImportResponseSchema),
          400: errorResponse("Invalid link or lesson type"),
          403: errorResponse("Not allowed, or YouTube import is turned off"),
          404: errorResponse("Course or lesson not found"),
          409: errorResponse("An import into this lesson is already running"),
        },
      },
      preHandler: requireImporter,
    },
    controller.startImport,
  );

  app.get(
    "/media/youtube-import/lesson",
    {
      schema: {
        operationId: "getLessonYoutubeImport",
        tags: ["Media"],
        summary: "The lesson's running or retryable YouTube import, if any",
        querystring: youtubeImportLessonQuerySchema,
        response: {
          200: jsonResponse(
            "The lesson's import",
            youtubeImportLessonResponseSchema,
          ),
          404: errorResponse("Course or lesson not found"),
        },
      },
      preHandler: requireImporter,
    },
    controller.findLessonImport,
  );

  app.post(
    "/media/:mediaId/youtube-import/retry",
    {
      schema: {
        operationId: "retryYoutubeImport",
        tags: ["Media"],
        summary: "Retry a failed or cancelled YouTube import",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Import queued",
            youtubeImportControlResponseSchema,
          ),
          404: errorResponse("Import not found"),
          409: errorResponse("The import has not failed"),
        },
      },
      preHandler: requireImporter,
    },
    controller.retryImport,
  );

  app.post(
    "/media/:mediaId/youtube-import/cancel",
    {
      schema: {
        operationId: "cancelYoutubeImport",
        tags: ["Media"],
        summary: "Cancel a YouTube import",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Import status",
            youtubeImportControlResponseSchema,
          ),
          404: errorResponse("Import not found"),
        },
      },
      preHandler: requireImporter,
    },
    controller.cancelImport,
  );
};

export default youtubeImportRoutes;
