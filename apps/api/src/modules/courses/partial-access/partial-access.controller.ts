import type { FastifyReply, FastifyRequest } from "fastify";
import type {
  CreatePartialAccessRequest,
  UpdatePartialAccessRequest,
} from "@veolms/contracts";
import type { PartialAccessService } from "./partial-access.service.ts";

export function createPartialAccessController({
  service,
}: {
  service: PartialAccessService;
}) {
  async function listPartialAccess(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return await service.listPartialAccess(request.params.id, request.user!);
  }

  async function createPartialAccess(
    request: FastifyRequest<{
      Params: { id: string };
      Body: CreatePartialAccessRequest;
    }>,
  ) {
    return await service.createPartialAccess(
      request.params.id,
      request.body,
      request.user!,
    );
  }

  async function updatePartialAccess(
    request: FastifyRequest<{
      Params: { id: string; partialCourseId: string };
      Body: UpdatePartialAccessRequest;
    }>,
  ) {
    return await service.updatePartialAccess(
      request.params.id,
      request.params.partialCourseId,
      request.body,
      request.user!,
    );
  }

  async function deletePartialAccess(
    request: FastifyRequest<{
      Params: { id: string; partialCourseId: string };
    }>,
  ) {
    return await service.deletePartialAccess(
      request.params.id,
      request.params.partialCourseId,
      request.user!,
    );
  }

  async function getOffer(
    request: FastifyRequest<{
      Params: { idOrSlug: string; offerSlug: string };
    }>,
    reply: FastifyReply,
  ) {
    // The price and whether it is on sale are read live, never from a cache.
    reply.header("cache-control", "no-store");
    return await service.getOffer(
      request.params.idOrSlug,
      request.params.offerSlug,
    );
  }

  async function listOptions(request: FastifyRequest) {
    return await service.listOptions(request.user!);
  }

  return {
    getOffer,
    listOptions,
    listPartialAccess,
    createPartialAccess,
    updatePartialAccess,
    deletePartialAccess,
  };
}
