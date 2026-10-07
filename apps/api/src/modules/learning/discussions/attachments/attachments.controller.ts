import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CompleteAttachmentUploadRequest,
  CreateLinkPreviewRequest,
  InitiateAttachmentUploadRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { discussionActor } from "../shared/discussion.access.ts";
import { readDiscussionAttachmentUploadContext } from "./attachment-upload-context.ts";
import type { AttachmentsService } from "./attachments.service.ts";

export interface AttachmentsController {
  initiateUpload(
    request: FastifyRequest<{ Body: InitiateAttachmentUploadRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  uploadFile(
    request: FastifyRequest<{ Params: { attachmentId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  completeUpload(
    request: FastifyRequest<{ Body: CompleteAttachmentUploadRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  uploadAttachment(request: FastifyRequest, reply: FastifyReply): Promise<void>;

  getLinkPreview(
    request: FastifyRequest<{ Body: CreateLinkPreviewRequest }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createAttachmentsController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: AttachmentsService;
}): AttachmentsController {
  return {
    async initiateUpload(request, reply) {
      const user = request.user!;
      const result = await service.initiateUpload(
        database,
        discussionActor(user),
        request.body,
      );
      await reply.status(201).send(result);
    },

    async uploadFile(request, reply) {
      const user = request.user!;
      const { attachmentId } = request.params;
      const multipartFile = await request.file();
      if (!multipartFile) {
        throw httpError(400, "FILE_REQUIRED", "No file provided");
      }

      try {
        const attachment = await service.uploadFile(
          database,
          attachmentId,
          user.id,
          {
            filename: multipartFile.filename,
            mimetype: multipartFile.mimetype,
            // Streamed to storage — the buffered path held up to 50MB of
            // heap per concurrent upload.
            stream: multipartFile.file,
            isTruncated: () => multipartFile.file.truncated,
            ...readMultipartDimensions(multipartFile.fields),
          },
        );
        await reply.status(200).send(attachment);
      } catch (error) {
        // If the service rejected before consuming the stream (auth/mime/
        // 404 paths), drain it so busboy can finish parsing the request.
        multipartFile.file.resume();
        throw error;
      }
    },

    async completeUpload(request, reply) {
      const user = request.user!;
      const { attachmentId } = request.body;
      const attachment = await service.completeUpload(
        database,
        attachmentId,
        user.id,
      );
      await reply.status(200).send(attachment);
    },

    async uploadAttachment(request, reply) {
      const user = request.user!;
      const multipartFile = await request.file();
      if (!multipartFile) {
        throw httpError(400, "FILE_REQUIRED", "No file provided");
      }

      const context = readDiscussionAttachmentUploadContext(
        multipartFile.fields,
      );
      try {
        const result = await service.processUpload(
          database,
          discussionActor(user),
          context,
          {
            filename: multipartFile.filename,
            mimetype: multipartFile.mimetype,
            stream: multipartFile.file,
            isTruncated: () => multipartFile.file.truncated,
            ...readMultipartDimensions(multipartFile.fields),
          },
        );
        await reply.status(201).send(result);
      } catch (error) {
        multipartFile.file.resume();
        throw error;
      }
    },

    async getLinkPreview(request, reply) {
      const { url } = request.body;
      const preview = await service.fetchLinkPreview(url);
      await reply.status(200).send(preview);
    },
  };
}

function readMultipartDimensions(fields: unknown): {
  width?: number;
  height?: number;
} {
  if (!fields || typeof fields !== "object") return {};
  const record = fields as Record<string, unknown>;
  return {
    width: readMultipartNumber(record.width),
    height: readMultipartNumber(record.height),
  };
}

function readMultipartNumber(field: unknown): number | undefined {
  if (!field || typeof field !== "object") return undefined;
  const value = (field as { value?: unknown }).value;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return undefined;
}
