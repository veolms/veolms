import type { FastifyReply, FastifyRequest } from "fastify";
import type { PresignMediaRequest } from "@veolms/contracts";
import { AppError } from "../../lib/errors.ts";
import type { MediaService } from "./media.service.ts";

export function createMediaController({ service }: { service: MediaService }) {
  async function presignMediaUpload(
    request: FastifyRequest<{ Body: PresignMediaRequest }>,
    reply: FastifyReply,
  ) {
    const ownerId = request.user!.id;
    // Idempotency key is required for all requests to prevent duplicate uploads
    const idempotencyKey = request.headers["idempotency-key"] as string;
    
    if (!idempotencyKey) {
      throw new AppError(
        400,
        "MISSING_IDEMPOTENCY_KEY",
        "The 'idempotency-key' header is required for all upload requests.",
      );
    }

    const result = await service.presignMediaUpload(ownerId, request.body, idempotencyKey);
    reply.code(200);
    return result;
  }

  async function confirmMediaUpload(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    const { mediaId } = request.params;
    const ownerId = request.user!.id;
    const result = await service.confirmUpload(mediaId, ownerId, request.log);
    return { status: result.status };
  }

  async function getVideoJobProgress(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    const { mediaId } = request.params;
    const ownerId = request.user!.id;
    return await service.getVideoJobProgress(mediaId, ownerId);
  }

  return {
    presignMediaUpload,
    confirmMediaUpload,
    getVideoJobProgress,
  };
}

export type MediaController = ReturnType<typeof createMediaController>;
