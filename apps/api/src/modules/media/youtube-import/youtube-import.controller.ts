import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  YoutubeImportAvailabilityResponse,
  YoutubeImportControlResponse,
  YoutubeImportLessonQuery,
  YoutubeImportLessonResponse,
  YoutubeImportPreviewRequest,
  YoutubeImportPreviewResponse,
  YoutubeImportRequest,
  YoutubeImportResponse,
} from "@veolms/contracts";
import type { YoutubeImportService } from "./youtube-import.service.ts";

export function createYoutubeImportController({
  service,
}: {
  service: YoutubeImportService;
}) {
  function currentUser(request: FastifyRequest) {
    return { id: request.user!.id, roles: request.user?.roles };
  }

  async function getAvailability(): Promise<YoutubeImportAvailabilityResponse> {
    return service.getAvailability();
  }

  async function preview(
    request: FastifyRequest<{ Body: YoutubeImportPreviewRequest }>,
  ): Promise<YoutubeImportPreviewResponse> {
    return await service.preview(request.body.url, currentUser(request));
  }

  async function startImport(
    request: FastifyRequest<{ Body: YoutubeImportRequest }>,
    reply: FastifyReply,
  ): Promise<YoutubeImportResponse> {
    const result = await service.startImport(
      request.body,
      currentUser(request),
      request.log,
    );
    reply.code(202);
    return result;
  }

  async function findLessonImport(
    request: FastifyRequest<{ Querystring: YoutubeImportLessonQuery }>,
  ): Promise<YoutubeImportLessonResponse> {
    return await service.findLessonImport(request.query, currentUser(request));
  }

  async function retryImport(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ): Promise<YoutubeImportControlResponse> {
    return await service.retryImport(
      request.params.mediaId,
      currentUser(request),
    );
  }

  async function cancelImport(
    request: FastifyRequest<{ Params: { mediaId: string } }>,
  ): Promise<YoutubeImportControlResponse> {
    return await service.cancelImport(
      request.params.mediaId,
      currentUser(request),
    );
  }

  return {
    getAvailability,
    preview,
    startImport,
    findLessonImport,
    retryImport,
    cancelImport,
  };
}
