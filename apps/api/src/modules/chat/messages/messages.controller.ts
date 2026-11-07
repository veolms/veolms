import type { ChatSendMessageRequest } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { MessagesService } from "./messages.service.ts";

type RoomParams = { Params: { roomId: string } };
type MessageParams = { Params: { roomId: string; seq: number } };

export function createMessagesController({
  service,
}: {
  service: MessagesService;
}) {
  return {
    async list(
      request: FastifyRequest<
        RoomParams & {
          Querystring: {
            before?: number;
            after?: number;
            around?: number;
            limit?: number;
          };
        }
      >,
    ) {
      return service.list(
        request.user!.id,
        request.params.roomId,
        request.query,
      );
    },

    async changes(
      request: FastifyRequest<RoomParams & { Querystring: { since: number } }>,
    ) {
      return service.changes(
        request.user!.id,
        request.params.roomId,
        request.query.since,
      );
    },

    async send(
      request: FastifyRequest<RoomParams & { Body: ChatSendMessageRequest }>,
      reply: FastifyReply,
    ) {
      const result = await service.send(
        request.user!.id,
        request.params.roomId,
        request.body,
      );
      reply.code(result.duplicate ? 200 : 201);
      return result;
    },

    async edit(
      request: FastifyRequest<MessageParams & { Body: { body: string } }>,
    ) {
      return service.edit(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        request.body.body,
      );
    },

    async remove(
      request: FastifyRequest<
        MessageParams & { Querystring: { for: "everyone" | "me" } }
      >,
    ) {
      return service.remove(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        request.query.for,
      );
    },

    async restore(request: FastifyRequest<MessageParams>) {
      return service.restore(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
      );
    },

    async pin(request: FastifyRequest<MessageParams>) {
      return service.pin(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        true,
      );
    },

    async unpin(request: FastifyRequest<MessageParams>) {
      return service.pin(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        false,
      );
    },

    async react(
      request: FastifyRequest<
        MessageParams & { Body: { emoji: string | null } }
      >,
    ) {
      return service.react(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        request.body.emoji,
      );
    },

    async star(request: FastifyRequest<MessageParams>) {
      return service.star(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        true,
      );
    },

    async unstar(request: FastifyRequest<MessageParams>) {
      return service.star(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        false,
      );
    },

    async listStars(request: FastifyRequest) {
      return service.listStars(request.user!.id);
    },

    async receipts(
      request: FastifyRequest<{
        Body: {
          receipts: Array<{
            roomId: string;
            readSeq?: number;
            deliveredSeq?: number;
          }>;
        };
      }>,
    ) {
      return service.receipts(request.user!.id, request.body.receipts);
    },

    async typing(request: FastifyRequest<RoomParams>) {
      return service.typing(request.user!.id, request.params.roomId);
    },
  };
}
