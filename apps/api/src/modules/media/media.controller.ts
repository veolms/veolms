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

  async function retryVideoJob(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    return service.retryTranscodeJob(
      request.params.mediaId,
      request.user!.id,
      request.log,
    );
  }

  async function streamVideoJobProgress(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
    reply: FastifyReply,
  ) {
    // Fastify's CORS hook sets these headers on the reply object. Because this
    // endpoint takes ownership of the raw response, copy the resolved values
    // explicitly before writeHead; otherwise EventSource requests from the
    // separately hosted web app can be rejected by the browser as CORS errors.
    const corsHeaders = {
      "Access-Control-Allow-Origin": reply.getHeader(
        "Access-Control-Allow-Origin",
      ),
      "Access-Control-Allow-Credentials": reply.getHeader(
        "Access-Control-Allow-Credentials",
      ),
      Vary: reply.getHeader("Vary"),
    };
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...(typeof corsHeaders["Access-Control-Allow-Origin"] === "string" && {
        "Access-Control-Allow-Origin":
          corsHeaders["Access-Control-Allow-Origin"],
      }),
      ...(typeof corsHeaders["Access-Control-Allow-Credentials"] ===
        "string" && {
        "Access-Control-Allow-Credentials":
          corsHeaders["Access-Control-Allow-Credentials"],
      }),
      ...(typeof corsHeaders.Vary === "string" && {
        Vary: corsHeaders.Vary,
      }),
    });
    let closed = false;
    request.raw.on("close", () => {
      closed = true;
    });
    while (!closed) {
      try {
        const progress = await service.getVideoJobProgress(
          request.params.mediaId,
          request.user!.id,
        );
        response.write(
          `event: progress\ndata: ${JSON.stringify(progress)}\n\n`,
        );
        if (["completed", "failed", "cancelled"].includes(progress.status))
          break;
      } catch (error) {
        response.write(
          `event: error\ndata: ${JSON.stringify({ message: error instanceof Error ? error.message : "Unable to read progress" })}\n\n`,
        );
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    response.end();
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
    retryVideoJob,
    streamVideoJobProgress,
    getMediaAssetStream,
  };
}

export type MediaController = ReturnType<typeof createMediaController>;
