import type { FastifyReply, FastifyRequest } from "fastify";

import type { DirectService } from "./direct.service.ts";

export function createDirectController({
  service,
}: {
  service: DirectService;
}) {
  return {
    async start(
      request: FastifyRequest<{ Body: { userId: string } }>,
      reply: FastifyReply,
    ) {
      const result = await service.start(request.user!.id, request.body.userId);
      reply.code(result.created ? 201 : 200);
      return result;
    },

    async accept(request: FastifyRequest<{ Params: { roomId: string } }>) {
      return service.accept(request.user!.id, request.params.roomId);
    },

    async decline(request: FastifyRequest<{ Params: { roomId: string } }>) {
      return service.decline(request.user!.id, request.params.roomId);
    },

    async candidates(
      request: FastifyRequest<{ Querystring: { search?: string } }>,
    ) {
      return service.candidates(request.user!.id, request.query.search);
    },

    async card(request: FastifyRequest<{ Params: { userId: string } }>) {
      return service.card(request.user!.id, request.params.userId);
    },

    async listBlocked(request: FastifyRequest) {
      return service.listBlocked(request.user!.id);
    },

    async block(request: FastifyRequest<{ Params: { userId: string } }>) {
      return service.block(request.user!.id, request.params.userId);
    },

    async unblock(request: FastifyRequest<{ Params: { userId: string } }>) {
      return service.unblock(request.user!.id, request.params.userId);
    },
  };
}
