import type { FastifyReply, FastifyRequest } from "fastify";
import type { DiscussionUploadService } from "./discussion-upload.service.ts";

export function createDiscussionUploadController(
  service: DiscussionUploadService,
) {
  return {
    async upload(request: FastifyRequest, reply: FastifyReply) {
      try {
        const file = await request.file();
        if (!file) {
          return reply.code(400).send({
            success: false,
            statusCode: 400,
            error: "Bad Request",
            message: "Choose an image or video file.",
          });
        }

        return await service.save(file);
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

    async read(
      request: FastifyRequest<{ Params: { fileName: string } }>,
      reply: FastifyReply,
    ) {
      const file = await service.get(request.params.fileName);
      if (!file) {
        return reply.code(404).send({
          success: false,
          statusCode: 404,
          error: "Not Found",
          message: "Discussion attachment not found.",
        });
      }

      return reply
        .header("Content-Type", file.mimeType)
        .header("Content-Length", file.size)
        .header("X-Content-Type-Options", "nosniff")
        .header("Cache-Control", "private, max-age=31536000, immutable")
        .send(file.stream);
    },
  };
}
