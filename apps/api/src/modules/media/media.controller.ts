import type { FastifyReply, FastifyRequest } from "fastify";
import type { PresignMediaRequest } from "@veolms/contracts";
import type { MediaService } from "./media.service.ts";

export function createMediaController({ service }: { service: MediaService }) {
  async function presignMediaUpload(
    request: FastifyRequest<{ Body: PresignMediaRequest }>,
    reply: FastifyReply,
  ) {
    const ownerId = request.user!.id;
    const result = await service.presignMediaUpload(ownerId, request.body);
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

  async function getMediaAssetStream(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
    reply: FastifyReply,
  ) {
    const { mediaId } = request.params;
    const requestingUserId = request.user?.id;
    const result = await service.getMediaStream(mediaId, requestingUserId);
    reply.header("Content-Type", result.contentType);
    if (result.contentLength !== undefined) {
      reply.header("Content-Length", result.contentLength);
    }
    // Assets whose public access can be revoked (e.g. unpublished/deleted courses
    // or replaced thumbnails) must not be retained in shared caches.
    reply.header("Cache-Control", "no-store");
    return reply.send(result.stream);
  }

  return {
    presignMediaUpload,
    confirmMediaUpload,
    getVideoJobProgress,
    getMediaAssetStream,
  };
}

export type MediaController = ReturnType<typeof createMediaController>;
