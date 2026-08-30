import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CompleteAttachmentUploadRequest,
  CreateLinkPreviewRequest,
  InitiateAttachmentUploadRequest,
} from "@veolms/contracts";
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

  uploadAttachment(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void>;

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
      const result = await service.initiateUpload(database, user.id, request.body);
      reply.status(201).send(result);
    },

    async uploadFile(request, reply) {
      const user = request.user!;
      const { attachmentId } = request.params;
      const multipartFile = await request.file();
      if (!multipartFile) {
        reply.status(400).send({ message: "No file provided" });
        return;
      }

      const buffer = await multipartFile.toBuffer();
      const attachment = await service.uploadFile(database, attachmentId, user.id, {
        filename: multipartFile.filename,
        mimetype: multipartFile.mimetype,
        data: buffer,
      });

      reply.status(200).send(attachment);
    },

    async completeUpload(request, reply) {
      const user = request.user!;
      const { attachmentId } = request.body;
      const attachment = await service.completeUpload(database, attachmentId, user.id);
      reply.status(200).send(attachment);
    },

    async uploadAttachment(request, reply) {
      const user = request.user!;
      const multipartFile = await request.file();
      if (!multipartFile) {
        reply.status(400).send({ message: "No file provided" });
        return;
      }

      const buffer = await multipartFile.toBuffer();
      const result = await service.processUpload(database, user.id, {
        filename: multipartFile.filename,
        mimetype: multipartFile.mimetype,
        data: buffer,
      });

      reply.status(201).send(result);
    },

    async getLinkPreview(request, reply) {
      const { url } = request.body;
      const preview = await service.fetchLinkPreview(url);
      reply.status(200).send(preview);
    },
  };
}
