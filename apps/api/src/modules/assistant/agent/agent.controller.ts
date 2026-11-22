import type {
  AssistantCreateCardRequest,
  AssistantHeartbeatRequest,
  AssistantInboxAckRequest,
  AssistantSendRequest,
  AssistantUpdateCardRequest,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { AgentService } from "./agent.service.ts";

export function createAgentController({ service }: { service: AgentService }) {
  return {
    async inbox(
      request: FastifyRequest<{
        Querystring: { waitSeconds: number; limit: number };
      }>,
    ) {
      return service.inbox(request.query);
    },

    async ack(request: FastifyRequest<{ Body: AssistantInboxAckRequest }>) {
      return service.ack(request.body);
    },

    async heartbeat(
      request: FastifyRequest<{ Body: AssistantHeartbeatRequest }>,
    ) {
      return service.heartbeat(request.body);
    },

    async createCard(
      request: FastifyRequest<{ Body: AssistantCreateCardRequest }>,
    ) {
      return service.createCard(request.body);
    },

    async updateCard(
      request: FastifyRequest<{
        Params: { cardId: string };
        Body: AssistantUpdateCardRequest;
      }>,
    ) {
      return service.updateCard(request.params.cardId, request.body);
    },

    async send(
      request: FastifyRequest<{
        Params: { roomId: string };
        Body: AssistantSendRequest;
      }>,
      reply: FastifyReply,
    ) {
      const result = await service.send(request.params.roomId, request.body);
      reply.code(result.duplicate ? 200 : 201);
      return result;
    },

    async upload(
      request: FastifyRequest<{
        Params: { roomId: string };
        Querystring: { name: string; mimeType: string };
        Body: unknown;
      }>,
      reply: FastifyReply,
    ) {
      const result = await service.upload(request.params.roomId, {
        name: request.query.name,
        mimeType: request.query.mimeType,
        bytes: Buffer.isBuffer(request.body) ? request.body : Buffer.alloc(0),
      });
      reply.code(201);
      return result;
    },

    async readFile(
      request: FastifyRequest<{ Params: { roomId: string; uploadId: string } }>,
      reply: FastifyReply,
    ) {
      const file = await service.readFile(
        request.params.roomId,
        request.params.uploadId,
      );
      if (file.kind === "redirect") {
        reply.header("Cache-Control", "no-store");
        return reply.redirect(file.url, 302);
      }
      reply.header("Content-Type", file.mimeType);
      reply.header("Content-Length", String(file.size));
      reply.header("Content-Disposition", file.disposition);
      return reply.send(file.stream);
    },
  };
}
