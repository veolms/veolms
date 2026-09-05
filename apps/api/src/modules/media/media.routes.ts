import { z } from "zod";
import {
  presignMediaRequestSchema,
  presignMediaResponseSchema,
  mediaAssetStatusSchema,
  videoJobProgressResponseSchema,
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
            z.object({ status: mediaAssetStatusSchema }),
          ),
          400: errorResponse("File not found or size mismatch"),
          404: errorResponse("Media not found"),
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
};

export default mediaRoutes;
