import { z } from "zod";
import fastifyMultipart from "@fastify/multipart";
import {
  completeAttachmentUploadRequestSchema,
  initiateAttachmentUploadRequestSchema,
  initiateAttachmentUploadResponseSchema,
  learningUploadResponseSchema,
  uploadedAttachmentSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createDiscussionUploadStore } from "../../../discussion-uploads/index.ts";
import { DISCUSSION_UPLOAD_RATE_LIMIT } from "../shared/discussion.constants.ts";
import { createDiscussionPermissions } from "../shared/discussion.permissions.ts";
import { createAttachmentsController } from "./attachments.controller.ts";
import { createAttachmentsRepository } from "./attachments.repository.ts";
import { createAttachmentsService } from "./attachments.service.ts";

const attachmentsRoutes: RoutePlugin = async (app, options) => {
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000 },
  });

  const permissions = createDiscussionPermissions(options);
  const repo = createAttachmentsRepository();
  const uploadStore = createDiscussionUploadStore(options.services.storage);
  const service = createAttachmentsService(
    repo,
    uploadStore,
    options.services.storage,
  );
  const controller = createAttachmentsController({
    database: options.database,
    service,
  });

  // 1. POST /attachments/initiate - Prepare upload slot
  app.post(
    "/attachments/initiate",
    {
      config: { rateLimit: DISCUSSION_UPLOAD_RATE_LIMIT },
      // A list of its own: the limiter is appended to the list it is given,
      // and the shared one is used by every route in this file.
      preHandler: [...permissions.requireAuthenticated],
      schema: {
        operationId: "initiateAttachmentUpload",
        tags: ["Learning Attachments"],
        summary: "Initiate upload session for media or code file",
        body: initiateAttachmentUploadRequestSchema,
        response: {
          201: jsonResponse(
            "Upload slot initiated",
            initiateAttachmentUploadResponseSchema,
          ),
          400: errorResponse("Invalid input"),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.initiateUpload,
  );

  // 2. POST /attachments/:attachmentId/upload - Upload file binary
  app.post(
    "/attachments/:attachmentId/upload",
    {
      config: { rateLimit: DISCUSSION_UPLOAD_RATE_LIMIT },
      // A list of its own: the limiter is appended to the list it is given,
      // and the shared one is used by every route in this file.
      preHandler: [...permissions.requireAuthenticated],
      schema: {
        operationId: "uploadAttachmentBinary",
        tags: ["Learning Attachments"],
        summary: "Upload file payload to prepared attachment slot",
        params: z.object({ attachmentId: z.uuid() }),
        consumes: ["multipart/form-data"],
        response: {
          200: jsonResponse("File uploaded", uploadedAttachmentSchema),
          400: errorResponse("File is required"),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Attachment slot not found"),
        },
      },
    },
    controller.uploadFile,
  );

  // 3. POST /attachments/complete - Finalize and verify upload
  app.post(
    "/attachments/complete",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "completeAttachmentUpload",
        tags: ["Learning Attachments"],
        summary: "Complete attachment upload verification",
        body: completeAttachmentUploadRequestSchema,
        response: {
          200: jsonResponse("Attachment completed", uploadedAttachmentSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Attachment not found"),
          503: errorResponse(
            "The file store could not be reached; the request can be repeated.",
          ),
        },
      },
    },
    controller.completeUpload,
  );

  // 4. POST /attachments/upload - Direct single-step multipart upload
  app.post(
    "/attachments/upload",
    {
      config: { rateLimit: DISCUSSION_UPLOAD_RATE_LIMIT },
      // A list of its own: the limiter is appended to the list it is given,
      // and the shared one is used by every route in this file.
      preHandler: [...permissions.requireAuthenticated],
      schema: {
        operationId: "uploadLearningAttachment",
        tags: ["Learning Attachments"],
        summary: "Direct single-step file upload",
        consumes: ["multipart/form-data"],
        response: {
          201: jsonResponse(
            "Attachment uploaded",
            learningUploadResponseSchema,
          ),
          400: errorResponse("File is required"),
          401: errorResponse("Unauthorized"),
          413: errorResponse("File is too large"),
        },
      },
    },
    controller.uploadAttachment,
  );
};

export default attachmentsRoutes;
