import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type { CreateLinkPreviewRequest } from "@veolms/contracts";
import type { AttachmentsService } from "./attachments.service.ts";

export interface AttachmentsController {
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
    async uploadAttachment(request, reply) {
      const multipartFile = await request.file();
      if (!multipartFile) {
        reply.status(400).send({ message: "No file provided" });
        return;
      }

      const buffer = await multipartFile.toBuffer();
      const result = await service.processUpload(database, {
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
