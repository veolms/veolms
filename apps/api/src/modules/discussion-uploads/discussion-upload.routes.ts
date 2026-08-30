import fastifyMultipart from "@fastify/multipart";
import { z } from "zod";
import { discussionUploadResponseSchema } from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { discussionUploadController } from "./discussion-upload.controller.ts";
import { config } from "../../config.ts";

const discussionUploadRoutes: RoutePlugin = async (app) => {
  if (config.NODE_ENV === "production") return;
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000 },
  });

  app.post(
    "/dev/discussion-uploads",
    {
      schema: {
        operationId: "uploadDevelopmentDiscussionAttachment",
        tags: ["Development"],
        summary: "Store a local discussion attachment during development",
        consumes: ["multipart/form-data"],
        response: {
          200: jsonResponse(
            "Discussion attachment stored",
            discussionUploadResponseSchema,
          ),
          400: errorResponse("A file is required"),
          413: errorResponse("The file is too large"),
          415: errorResponse("The file type is not supported"),
        },
      },
    },
    discussionUploadController.upload,
  );

  app.get(
    "/dev/discussion-uploads/:fileName",
    {
      schema: {
        operationId: "getDevelopmentDiscussionAttachment",
        tags: ["Development"],
        summary: "Read a local development discussion attachment",
        params: z.object({ fileName: z.string().min(1).max(80) }),
        response: { 404: errorResponse("Discussion attachment not found") },
      },
    },
    discussionUploadController.read,
  );
};

export default discussionUploadRoutes;
