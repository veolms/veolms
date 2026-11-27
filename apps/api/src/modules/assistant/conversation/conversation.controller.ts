import type { FastifyReply, FastifyRequest } from "fastify";

import type { ConversationService } from "./conversation.service.ts";

export function createConversationController({
  service,
}: {
  service: ConversationService;
}) {
  return {
    async info(request: FastifyRequest) {
      return service.info(request.user!.id);
    },

    async open(request: FastifyRequest, reply: FastifyReply) {
      const result = await service.open(request.user!.id);
      reply.code(200);
      return result;
    },

    async cards(request: FastifyRequest<{ Querystring: { roomId: string } }>) {
      return service.cards(request.user!.id, request.query.roomId);
    },

    async stop(request: FastifyRequest<{ Params: { cardId: string } }>) {
      return service.stop(request.user!.id, request.params.cardId);
    },
  };
}
