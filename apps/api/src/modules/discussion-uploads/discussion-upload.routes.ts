import fastifyMultipart from "@fastify/multipart";
import type { FastifyReply } from "fastify";
import { z } from "zod";
import type { DatabaseExecutor } from "@veolms/database";
import { discussionUploadResponseSchema } from "@veolms/contracts";
import type { LearningAttachment } from "@veolms/contracts";
import { errorResponse } from "../../lib/errors.ts";
import { jsonResponse } from "../../lib/responses.ts";
import type { RoutePlugin } from "../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../learning/discussions/shared/discussion.permissions.ts";
import {
  createDiscussionAccess,
  discussionActor,
  type DiscussionActor,
} from "../learning/discussions/shared/discussion.access.ts";
import { createAttachmentsRepository } from "../learning/discussions/attachments/attachments.repository.ts";
import { createAttachmentsService } from "../learning/discussions/attachments/attachments.service.ts";
import { createRepliesRepository } from "../learning/discussions/replies/replies.repository.ts";
import { createThreadsRepository } from "../learning/discussions/threads/threads.repository.ts";
import { createDiscussionUploadStore } from "./discussion-upload.storage.ts";

const fileNameSchema = z.string().regex(/^[0-9a-f-]{36}\.[A-Za-z0-9]{1,16}$/i);

const discussionUploadRoutes: RoutePlugin = async (app, options) => {
  await app.register(fastifyMultipart, {
    limits: { files: 1, fileSize: 50_000_000 },
  });

  const permissions = createDiscussionPermissions(options);
  const store = createDiscussionUploadStore(options.services.storage);
  const attachmentsRepo = createAttachmentsRepository();
  const attachmentsService = createAttachmentsService(attachmentsRepo, store);
  const threadsRepo = createThreadsRepository();
  const repliesRepo = createRepliesRepository();
  const discussionAccess = createDiscussionAccess();

  async function isAuthorizedToReadAttachment(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    attachment: LearningAttachment,
  ): Promise<boolean> {
    if (attachment.ownerId === actor.userId) return true;
    if (!attachment.targetId) return false;

    try {
      if (attachment.targetType === "thread") {
        const thread = await threadsRepo.findThreadById(
          db,
          attachment.targetId,
        );
        if (!thread) return false;
        await discussionAccess.assertCanAccessThread(db, actor, thread);
        return true;
      }

      if (attachment.targetType === "reply") {
        const reply = await repliesRepo.findReplyById(db, attachment.targetId);
        if (!reply) return false;
        const thread = await threadsRepo.findThreadById(db, reply.threadId);
        if (!thread) return false;
        await discussionAccess.assertCanAccessThread(db, actor, thread);
        return true;
      }
    } catch {
      return false;
    }

    return false;
  }

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
    async (request, reply) => {
      const user = request.user!;
      const file = await request.file();
      if (!file) {
        return reply.code(400).send({
          success: false,
          statusCode: 400,
          error: "Bad Request",
          message: "Choose an image or video file.",
        });
      }

      try {
        const buffer = await file.toBuffer();
        const result = await attachmentsService.processUpload(
          options.database,
          user.id,
          {
            filename: file.filename,
            mimetype: file.mimetype,
            data: buffer,
          },
        );

        return reply.code(200).send({
          url: result.url,
          fileName: result.fileName,
          mediaType: result.mediaType === "video" ? "video" : "image",
          mimeType: result.mimeType,
          size: result.size,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "DISCUSSION_UPLOAD_FAILED";
        const statusCode =
          message === "DISCUSSION_UPLOAD_TOO_LARGE" ? 413 : 415;
        return reply.code(statusCode).send({
          success: false,
          statusCode,
          error:
            statusCode === 413 ? "Payload Too Large" : "Unsupported Media Type",
          message:
            statusCode === 413
              ? "The selected file is too large."
              : "Choose a supported image or video file.",
        });
      }
    },
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
    async (request, reply) => {
      const notFound = () =>
        reply.code(404).send({
          success: false,
          statusCode: 404,
          error: "Not Found",
          message: "Discussion attachment not found.",
        });

      const user = request.user!;
      const { fileName } = request.params;
      const attachmentId = fileName.slice(0, fileName.lastIndexOf("."));
      const attachment = await attachmentsRepo.findAttachmentById(
        options.database,
        attachmentId,
      );
      if (!attachment) {
        return notFound();
      }

      const authorized = await isAuthorizedToReadAttachment(
        options.database,
        discussionActor(user),
        attachment,
      );
      if (!authorized) {
        return notFound();
      }

      const file = await store.get(fileName);
      if (!file) {
        return notFound();
      }

      return (reply as FastifyReply)
        .header("Content-Type", file.mimeType)
        .header("Content-Length", file.size)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "no-store")
        .send(file.stream);
    },
  );
};

export default discussionUploadRoutes;
