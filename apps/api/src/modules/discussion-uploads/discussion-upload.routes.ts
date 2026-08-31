import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";
import { discussionUploadResponseSchema } from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../learning/discussions/shared/discussion.permissions.ts";
import { createDiscussionUploadController } from "./discussion-upload.controller.ts";
import { createDiscussionUploadService } from "./discussion-upload.service.ts";
import { createDiscussionUploadStore } from "./discussion-upload.storage.ts";

const fileNameSchema = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9]{1,16}$/i);

const discussionUploadRoutes: RoutePlugin = async (app, options) => {
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000 },
  });

  const permissions = createDiscussionPermissions(options);
  const store = createDiscussionUploadStore(options.services.storage);
  const service = createDiscussionUploadService(store);
  const controller = createDiscussionUploadController(service);

  const uploadResponse = {
    200: jsonResponse(
      "Discussion attachment stored",
      discussionUploadResponseSchema,
    ),
    400: errorResponse("A file is required"),
    401: errorResponse("Unauthorized"),
    413: errorResponse("The file is too large"),
    415: errorResponse("The file type is not supported"),
  };

  const readResponse = {
    401: errorResponse("Unauthorized"),
    404: errorResponse("Discussion attachment not found"),
  };

  app.post(
    "/discussion-uploads",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "uploadDiscussionAttachment",
        tags: ["Learning Attachments"],
        summary: "Upload an image or video for discussion markdown",
        consumes: ["multipart/form-data"],
        response: uploadResponse,
      },
    },
    controller.upload,
  );

  app.get(
    "/discussion-uploads/:fileName",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "getDiscussionAttachment",
        tags: ["Learning Attachments"],
        summary: "Read a stored discussion attachment",
        params: z.object({ fileName: fileNameSchema }),
        response: readResponse,
      },
    },
    controller.read,
  );

  // Aliases so existing composer clients and markdown with /dev/ URLs keep working.
  app.post(
    "/dev/discussion-uploads",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "uploadDevelopmentDiscussionAttachment",
        tags: ["Learning Attachments"],
        summary: "Upload a discussion image or video (legacy path)",
        consumes: ["multipart/form-data"],
        response: uploadResponse,
      },
    },
    controller.upload,
  );

  app.get(
    "/dev/discussion-uploads/:fileName",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "getDevelopmentDiscussionAttachment",
        tags: ["Learning Attachments"],
        summary: "Read a stored discussion attachment (legacy path)",
        params: z.object({ fileName: fileNameSchema }),
        response: readResponse,
      },
    },
    controller.read,
  );
};

export default discussionUploadRoutes;
