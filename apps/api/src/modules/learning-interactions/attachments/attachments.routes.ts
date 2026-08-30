import { z } from "zod";
import fastifyMultipart from "@fastify/multipart";
import {
  completeAttachmentUploadRequestSchema,
  createLinkPreviewRequestSchema,
  initiateAttachmentUploadRequestSchema,
  initiateAttachmentUploadResponseSchema,
  learningAttachmentSchema,
  learningUploadResponseSchema,
  linkPreviewResponseSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createLearningInteractionsContext } from "../shared/learning-interactions.context.ts";
import { createAttachmentsController } from "./attachments.controller.ts";
import { createAttachmentsRepository } from "./attachments.repository.ts";
import { createAttachmentsService } from "./attachments.service.ts";

const attachmentsRoutes: RoutePlugin = async (app, options) => {
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000 },
  });

  const ctx = createLearningInteractionsContext(options);
  const repo = createAttachmentsRepository();
  const service = createAttachmentsService(repo);
  const controller = createAttachmentsController({
    database: options.database,
    service,
  });

  // 1. POST /attachments/initiate - Prepare upload slot
  app.post(
    "/attachments/initiate",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "initiateAttachmentUpload",
        tags: ["Learning Attachments"],
        summary: "Initiate upload session for media or code file",
        body: initiateAttachmentUploadRequestSchema,
        response: {
          201: jsonResponse("Upload slot initiated", initiateAttachmentUploadResponseSchema),
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
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "uploadAttachmentBinary",
        tags: ["Learning Attachments"],
        summary: "Upload file payload to prepared attachment slot",
        params: z.object({ attachmentId: z.uuid() }),
        consumes: ["multipart/form-data"],
        response: {
          200: jsonResponse("File uploaded", learningAttachmentSchema),
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
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "completeAttachmentUpload",
        tags: ["Learning Attachments"],
        summary: "Complete attachment upload verification",
        body: completeAttachmentUploadRequestSchema,
        response: {
          200: jsonResponse("Attachment completed", learningAttachmentSchema),
          401: errorResponse("Unauthorized"),
          404: errorResponse("Attachment not found"),
        },
      },
    },
    controller.completeUpload,
  );

  // 4. POST /attachments/upload - Direct single-step multipart upload
  app.post(
    "/attachments/upload",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "uploadLearningAttachment",
        tags: ["Learning Attachments"],
        summary: "Direct single-step file upload",
        consumes: ["multipart/form-data"],
        response: {
          201: jsonResponse("Attachment uploaded", learningUploadResponseSchema),
          400: errorResponse("File is required"),
          401: errorResponse("Unauthorized"),
          413: errorResponse("File is too large"),
        },
      },
    },
    controller.uploadAttachment,
  );

  // 5. POST /attachments/link-preview - External link preview
  app.post(
    "/attachments/link-preview",
    {
      preHandler: ctx.authenticate,
      schema: {
        operationId: "getLearningLinkPreview",
        tags: ["Learning Attachments"],
        summary: "Fetch metadata preview for external link",
        body: createLinkPreviewRequestSchema,
        response: {
          200: jsonResponse("Link preview metadata", linkPreviewResponseSchema),
          400: errorResponse("Invalid URL"),
        },
      },
    },
    controller.getLinkPreview,
  );
};

export default attachmentsRoutes;
