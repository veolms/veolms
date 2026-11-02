import { z } from "zod";
import {
  multipartUploadAbortResponseSchema,
  multipartUploadCompleteRequestSchema,
  multipartUploadPartUrlsRequestSchema,
  multipartUploadPartUrlsResponseSchema,
  multipartUploadStartRequestSchema,
  multipartUploadStartResponseSchema,
  multipartUploadStatusResponseSchema,
  presignMediaRequestSchema,
  presignMediaResponseSchema,
  lessonResourceDownloadResponseSchema,
  mediaDeliveryResponseSchema,
  mediaImageVariantManifestSchema,
  mediaUploadCompleteResponseSchema,
  videoJobProgressResponseSchema,
  mediaSourceResponseSchema,
  videoPlaybackBootstrapQuerySchema,
  videoPlaybackBootstrapSchema,
  videoPlaybackTokenSchema,
  videoTranscodeCancelResponseSchema,
  videoTranscodeRetryResponseSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../lib/errors.ts";
import { createLessonPositionReader } from "../learning-progress/index.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../middlewares/auth.middleware.ts";
import { createSessionService } from "../auth/index.ts";
import {
  createAuthorizationGuard,
  createAuthorizationService,
} from "../authorization/index.ts";

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

  // Content-authoring media routes (presign, upload confirmation, transcode
  // control, processing progress, variant manifest) were previously open to
  // ANY authenticated account: a student could mint presigned PUT URLs into
  // platform object storage and dispatch paid transcode jobs against their
  // uploads. Gate them behind the course-authoring permissions; holders of
  // any one of these at platform scope (admin, instructor, course_manager,
  // content editors) pass, students have none.
  const authorizationGuard = createAuthorizationGuard(
    createAuthorizationService(options.database),
  );
  const requireMediaAuthor = [
    ...requireAuthenticated,
    authorizationGuard.authorizeAny([
      "course.create",
      "course.curriculum.update",
      "lesson.video.update",
      "course.thumbnail.update",
      "lesson.thumbnail.update",
    ]),
  ];

  const service = createMediaService({
    database: options.database,
    services: options.services,
    lessonPositions: createLessonPositionReader({ database: options.database }),
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
        querystring: videoPlaybackBootstrapQuerySchema,
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

  app.get(
    "/courses/:idOrSlug/lessons/:lessonNumber/resources/:resourceId/download",
    {
      schema: {
        operationId: "getLessonResourceDownload",
        tags: ["Media"],
        summary: "Resolve an authorized download link for a lesson resource",
        description:
          "Returns a short-lived link that downloads one resource of the lesson. The caller must be signed in and have the course: its owner, an administrator, a learner with access, or any signed-in learner when the course is free and unrestricted. Being able to watch a preview lesson is not enough. The lesson does not need a video.",
        params: z.object({
          idOrSlug: z.string().min(1).max(160),
          lessonNumber: z.coerce.number().int().positive(),
          resourceId: z.uuid(),
        }),
        response: {
          200: jsonResponse(
            "Authorized lesson resource download link",
            lessonResourceDownloadResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          403: errorResponse("Course access denied"),
          404: errorResponse("Lesson or resource not found"),
        },
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getLessonResourceDownload,
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
      preHandler: requireMediaAuthor,
    },
    controller.presignMediaUpload,
  );

  app.post(
    "/media/multipart/start",
    {
      schema: {
        operationId: "startMultipartMediaUpload",
        tags: ["Media"],
        summary: "Start a resumable video upload",
        body: multipartUploadStartRequestSchema,
        response: {
          200: jsonResponse(
            "Resumable upload started",
            multipartUploadStartResponseSchema,
          ),
          400: errorResponse("Invalid upload request"),
          503: errorResponse("Storage is unavailable"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.startMultipartUpload,
  );

  app.get(
    "/media/:mediaId/multipart",
    {
      schema: {
        operationId: "getMultipartMediaUploadStatus",
        tags: ["Media"],
        summary: "List the parts storage already holds for a resumable upload",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Resumable upload status",
            multipartUploadStatusResponseSchema,
          ),
          404: errorResponse("Media not found"),
          409: errorResponse("Upload is not resumable or has expired"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.getMultipartUploadStatus,
  );

  app.post(
    "/media/:mediaId/multipart/parts",
    {
      schema: {
        operationId: "presignMultipartMediaUploadParts",
        tags: ["Media"],
        summary: "Get pre-signed URLs for the remaining upload parts",
        params: z.object({ mediaId: z.uuid() }),
        body: multipartUploadPartUrlsRequestSchema,
        response: {
          200: jsonResponse(
            "Pre-signed upload parts",
            multipartUploadPartUrlsResponseSchema,
          ),
          400: errorResponse("Invalid part number"),
          404: errorResponse("Media not found"),
          409: errorResponse("Upload is not resumable or has expired"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.presignMultipartUploadParts,
  );

  app.post(
    "/media/:mediaId/multipart/complete",
    {
      schema: {
        operationId: "completeMultipartMediaUpload",
        tags: ["Media"],
        summary: "Join the uploaded parts and start processing",
        params: z.object({ mediaId: z.uuid() }),
        body: multipartUploadCompleteRequestSchema,
        response: {
          200: jsonResponse(
            "Upload confirmed",
            mediaUploadCompleteResponseSchema,
          ),
          400: errorResponse("Uploaded parts are incomplete"),
          404: errorResponse("Media not found"),
          409: errorResponse("Upload is not resumable or has expired"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.completeMultipartUpload,
  );

  app.post(
    "/media/:mediaId/multipart/abort",
    {
      schema: {
        operationId: "abortMultipartMediaUpload",
        tags: ["Media"],
        summary: "Discard an interrupted resumable upload",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Upload aborted",
            multipartUploadAbortResponseSchema,
          ),
          404: errorResponse("Media not found"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.abortMultipartUpload,
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
      preHandler: requireMediaAuthor,
    },
    controller.confirmMediaUpload,
  );

  app.get(
    "/media/:mediaId/source",
    {
      schema: {
        operationId: "getMediaSource",
        tags: ["Media"],
        summary:
          "Where a video came from (the YouTube video it was imported from)",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse("The video's source", mediaSourceResponseSchema),
          404: errorResponse("Media not found"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.getMediaSource,
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
      preHandler: requireMediaAuthor,
    },
    controller.getVideoJobProgress,
  );

  app.post(
    "/media/:mediaId/transcode/retry",
    {
      preHandler: requireMediaAuthor,
      schema: {
        operationId: "retryVideoTranscode",
        tags: ["Media"],
        summary: "Queue a failed video for transcoding again",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Transcoding retry accepted",
            videoTranscodeRetryResponseSchema,
          ),
          404: errorResponse("Video not found"),
          409: errorResponse("Video is not in a retryable state"),
        },
      },
    },
    controller.retryVideoJob,
  );

  app.post(
    "/media/:mediaId/transcode/cancel",
    {
      preHandler: requireMediaAuthor,
      schema: {
        operationId: "cancelVideoTranscode",
        tags: ["Media"],
        summary: "Cancel a video that is being transcoded",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Transcoding cancelled",
            videoTranscodeCancelResponseSchema,
          ),
          404: errorResponse("Video not found"),
          409: errorResponse("Video is not being transcoded"),
        },
      },
    },
    controller.cancelVideoJob,
  );

  app.get(
    "/media/:mediaId/progress/stream",
    {
      preHandler: requireMediaAuthor,
      schema: { params: z.object({ mediaId: z.uuid() }) },
    },
    controller.streamVideoJobProgress,
  );

  app.get(
    "/media/:mediaId/delivery/*",
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
    "/media/:mediaId/image-variants",
    {
      schema: {
        operationId: "getMediaImageVariantManifest",
        tags: ["Media"],
        summary: "Get available responsive image dimensions",
        params: z.object({ mediaId: z.uuid() }),
        response: {
          200: jsonResponse(
            "Available responsive image dimensions",
            mediaImageVariantManifestSchema,
          ),
          404: errorResponse("Image asset not found"),
        },
      },
      preHandler: requireMediaAuthor,
    },
    controller.getImageVariantManifest,
  );

  app.get(
    "/media/:mediaId/variants/:width",
    {
      schema: {
        params: z.object({
          mediaId: z.uuid(),
          width: z.coerce.number().int().positive(),
        }),
      },
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getImageVariantStream,
  );

  app.get(
    "/media/:mediaId",
    {
      schema: {
        operationId: "getMediaAssetStream",
        tags: ["Media"],
        summary: "Resolve the delivery URL of a media asset",
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
      preHandler: [
        authMiddleware.authenticate,
        authMiddleware.requireMfaVerifiedIfAuthenticated,
      ],
    },
    controller.getMediaDelivery,
  );
};

export default mediaRoutes;
