import fastifyMultipart from "@fastify/multipart";
import {
  createLinkPreviewRequestSchema,
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

  // 1. POST /learning-attachments/upload
  app.post(
    "/learning-attachments/upload",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "uploadLearningAttachment",
        tags: ["Learning Attachments"],
        summary: "Upload image, screenshot, code file, or document attachment",
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

  // 2. POST /learning-attachments/link-preview
  app.post(
    "/learning-attachments/link-preview",
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
