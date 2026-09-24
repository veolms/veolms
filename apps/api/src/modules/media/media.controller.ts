import type { FastifyReply, FastifyRequest } from "fastify";
import type { PresignMediaRequest } from "@veolms/contracts";
import type { MediaService } from "./media.service.ts";
import type { MediaConvertWebhookPayload } from "./webhooks/mediaconvert-webhook.schema.ts";

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
    const result = await service.confirmUpload(
      mediaId,
      ownerId,
      request.log,
      request.user?.roles,
    );
    return {
      status: result.status,
      ...(result.deliveryUrl ? { deliveryUrl: result.deliveryUrl } : {}),
      ...(result.deliveryUrlExpiresAt
        ? { deliveryUrlExpiresAt: result.deliveryUrlExpiresAt }
        : {}),
    };
  }

  async function getVideoJobProgress(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    const { mediaId } = request.params;
    const ownerId = request.user!.id;
    return await service.getVideoJobProgress(
      mediaId,
      ownerId,
      request.user?.roles,
    );
  }

  async function getPlaybackBootstrap(
    request: FastifyRequest<{
      Params: { idOrSlug: string; lessonNumber: number };
    }>,
  ) {
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    return await service.getPlaybackBootstrap(
      request.params.idOrSlug,
      request.params.lessonNumber,
      user,
    );
  }

  async function getPlaybackToken(
    request: FastifyRequest<{
      Params: { idOrSlug: string; lessonNumber: number };
    }>,
    reply: FastifyReply,
  ) {
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    reply.header("Cache-Control", "private, no-store");
    return await service.getPlaybackToken(
      request.params.idOrSlug,
      request.params.lessonNumber,
      user,
    );
  }

  async function getMediaDelivery(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    return service.getMediaDelivery(
      request.params.mediaId,
      request.user?.id,
      request.user?.roles,
    );
  }

  async function retryVideoJob(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    return service.retryTranscodeJob(
      request.params.mediaId,
      request.user!.id,
      request.log,
      request.user?.roles,
    );
  }

  async function cancelVideoJob(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ) {
    return service.cancelTranscodeJob(
      request.params.mediaId,
      request.user!.id,
      request.log,
      request.user?.roles,
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
          request.user?.roles,
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
    async function streamHlsResource(
    request: FastifyRequest<{
      Params: { mediaId: string; "*": string };
    }>,
    reply: FastifyReply,
  ) {
    const user = request.user
      ? { id: request.user.id, roles: request.user.roles }
      : undefined;
    const result = await service.getHlsStream(
      request.params.mediaId,
      request.params["*"],
      user,
    );
    reply.header("Content-Type", result.contentType);
    if (result.contentLength !== undefined) {
      reply.header("Content-Length", result.contentLength);
    }
    reply.header(
      "Cache-Control",
      result.isPublic
        ? "public, max-age=60, s-maxage=60, stale-while-revalidate=300"
        : result.isManifest
          ? "private, no-store"
          : "private, max-age=86400",
    );
    reply.header("X-Content-Type-Options", "nosniff");
    return reply.send(result.stream);
  }

  async function getMediaAssetStream(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
    reply: FastifyReply,
  ) {
    const { mediaId } = request.params;
    const requestingUserId = request.user?.id;
    const result = await service.getMediaStream(
      mediaId,
      requestingUserId,
      request.user?.roles,
    );
    reply.header("Content-Type", result.contentType);
    if (result.contentLength !== undefined) {
      reply.header("Content-Length", result.contentLength);
    }
    // Assets whose public access can be revoked (e.g. unpublished/deleted courses
    // or replaced thumbnails) must not be retained in shared caches.
    reply.header("Cache-Control", "no-store");
    return reply.send(result.stream);
  }

  async function getImageVariantStream(request: FastifyRequest<{ Params: { mediaId: string; width: number } }>, reply: FastifyReply) {
    const result = await service.getImageVariantStream(request.params.mediaId, Number(request.params.width), request.user?.id, request.user?.roles);
    reply.header("Content-Type", result.contentType).header("Cache-Control", "public, max-age=31536000, immutable");
    if (result.contentLength !== undefined) reply.header("Content-Length", result.contentLength);
    return reply.send(result.stream);
  }

  async function handleMediaConvertWebhook(
    request: FastifyRequest<{ Body: MediaConvertWebhookPayload }>,
    reply: FastifyReply,
  ) {
    const result = await service.handleMediaConvertWebhook({
      headers: request.headers as Record<string, string | undefined>,
      rawBody: request.rawBody,
      body: request.body,
      logger: request.log,
    });
    return reply.status(200).send(result);
  }

  return {
    presignMediaUpload,
    confirmMediaUpload,
    getVideoJobProgress,
    getPlaybackBootstrap,
    getPlaybackToken,
    getMediaDelivery,
    retryVideoJob,
    cancelVideoJob,
    streamVideoJobProgress,
    getMediaAssetStream,
    getImageVariantStream,
    streamHlsResource,
    handleMediaConvertWebhook,
  };
}

export type MediaController = ReturnType<typeof createMediaController>;
