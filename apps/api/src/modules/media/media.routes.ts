import { z } from "zod";
import {
  presignMediaRequestSchema,
  presignMediaResponseSchema,
  mediaDeliveryResponseSchema,
  mediaUploadCompleteResponseSchema,
  videoJobProgressResponseSchema,
  videoPlaybackBootstrapSchema,
  videoPlaybackTokenSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";

import { createMediaController } from "./media.controller.ts";
import { createMediaService } from "./media.service.ts";

const mediaRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const authMiddleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    authMiddleware.authenticate,
    authMiddleware.requireAuthenticated,
    authMiddleware.requireMfaVerified,
  ];

  const service = createMediaService({
    database: options.database,
    services: options.services,
  });
  const controller = createMediaController({ service });

  app.get(
    "/courses/:idOrSlug/lessons/:lessonNumber/playback-bootstrap",
    {
      schema: {
        operationId: "getVideoPlaybackBootstrap",
        tags: ["Media"],
        summary: "Resolve an authorized lesson video playback bootstrap",
        description:
          "Returns the minimum HLS startup data after applying the existing session and course-access rules. Protected stream URLs are never embedded in static HTML.",
        params: z.object({
          idOrSlug: z.string().min(1).max(160),
          lessonNumber: z.coerce.number().int().positive(),
        }),
        response: {
          200: jsonResponse(
            "Authorized video playback bootstrap",
            videoPlaybackBootstrapSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access denied"),
          404: errorResponse("Lesson or media not found"),
          409: errorResponse("Video is not ready for playback"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getPlaybackBootstrap,
  );

  app.get(
    "/courses/:idOrSlug/lessons/:lessonNumber/playback-token",
    {
      schema: {
        operationId: "getVideoPlaybackToken",
        tags: ["Media"],
        summary: "Refresh an authorized lesson video segment token",
        description:
          "Returns only a new short-lived token for protected HLS segments. The same course access and media readiness rules as playback bootstrap are applied.",
        params: z.object({
          idOrSlug: z.string().min(1).max(160),
          lessonNumber: z.coerce.number().int().positive(),
        }),
        response: {
          200: jsonResponse(
            "Protected video playback token",
            videoPlaybackTokenSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access denied"),
          404: errorResponse("Lesson or media not found"),
          409: errorResponse("Video is not ready or does not require a token"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getPlaybackToken,
  );

  app.post(
    "/media/presign",
    {
      schema: {
        operationId: "presignMediaUpload",
        tags: ["Media"],
        summary: "Obtain pre-signed upload URL for files",
        body: presignMediaRequestSchema,
        response: {
          200: jsonResponse(
            "Pre-signed upload response",
            presignMediaResponseSchema,
          ),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.presignMediaUpload,
  );

  app.post(
    "/media/:mediaId/upload-complete",
    {
      schema: {
        operationId: "confirmMediaUpload",
        tags: ["Media"],
        summary: "Confirm that a media asset upload is complete",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Upload confirmed",
            mediaUploadCompleteResponseSchema,
          ),
          400: errorResponse("File not found or size mismatch"),
          404: errorResponse("Media not found"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.confirmMediaUpload,
  );

  app.get(
    "/media/:mediaId/progress",
    {
      schema: {
        operationId: "getVideoJobProgress",
        tags: ["Media"],
        summary: "Poll transcoding progress for a media asset",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Polling progress response",
            videoJobProgressResponseSchema,
          ),
          404: errorResponse("Media or job not found"),
        },
      },
      preHandler: requireAuthenticated,
    },
    controller.getVideoJobProgress,
  );

  app.post(
    "/media/:mediaId/transcode/retry",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.retryVideoJob,
  );

  app.post(
    "/media/:mediaId/transcode/cancel",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.cancelVideoJob,
  );

  app.get(
    "/media/:mediaId/progress/stream",
    {
      preHandler: requireAuthenticated,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.streamVideoJobProgress,
  );

  app.get(
    "/media/:mediaId/delivery",
    {
      schema: {
        operationId: "getMediaDelivery",
        tags: ["Media"],
        summary: "Stream an authorized HLS playlist or segment",
        params: z.object({
          mediaId: z.string().uuid(),
          "*": z.string().min(1),
        }),
        response: {
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access denied"),
          404: errorResponse("HLS resource not found"),
          409: errorResponse("Video is not ready for playback"),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.streamHlsResource,
  );

  app.get(
    "/media/:mediaId/variants/:width",
    {
      schema: { params: z.object({ mediaId: z.uuid(), width: z.coerce.number().int().positive() }) },
      preHandler: [authMiddleware.authenticate],
    },
    controller.getImageVariantStream,
  );

  app.get(
    "/media/:mediaId",
    {
      schema: {
        operationId: "getMediaAssetStream",
        tags: ["Media"],
        summary: "Stream media file content by media ID",
        params: z.object({ mediaId: z.string().uuid() }),
        response: {
          200: jsonResponse(
            "Direct media delivery URL",
            mediaDeliveryResponseSchema,
          ),
          404: errorResponse("Media not found or access denied"),
          503: errorResponse("CDN delivery is not configured"),
        },
      },
      preHandler: [authMiddleware.authenticate],
    },
    controller.getMediaDelivery,
  );
};

export default mediaRoutes;
