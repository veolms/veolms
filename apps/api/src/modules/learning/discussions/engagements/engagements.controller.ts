import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  LockThreadRequest,
  SearchMentionsQuery,
  ToggleLikeRequest,
} from "@veolms/contracts";
import type { EngagementsService } from "./engagements.service.ts";
import { discussionActor } from "../shared/discussion.access.ts";

export interface EngagementsController {
  toggleLike(
    request: FastifyRequest<{ Body: ToggleLikeRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  toggleBookmark(
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  toggleFollow(
    request: FastifyRequest<{ Params: { threadId: string } }>,
    reply: FastifyReply,
  ): Promise<void>;

  lockThread(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: LockThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  searchMentions(
    request: FastifyRequest<{ Querystring: SearchMentionsQuery }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createEngagementsController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: EngagementsService;
}): EngagementsController {
  return {
    async toggleLike(request, reply) {
      const user = request.user!;
      const { targetType, targetId } = request.body;

      const result = await service.toggleLike(
        database,
        discussionActor(user),
        targetType,
        targetId,
      );
      reply.status(200).send(result);
    },

    async toggleBookmark(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;

      const result = await service.toggleBookmark(
        database,
        discussionActor(user),
        threadId,
      );
      reply.status(200).send(result);
    },

    async toggleFollow(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;

      const result = await service.toggleFollow(
        database,
        discussionActor(user),
        threadId,
      );
      reply.status(200).send(result);
    },

    async lockThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const { isLocked } = request.body;

      const result = await service.lockThread(
        database,
        threadId,
        isLocked,
        discussionActor(user),
      );
      reply.status(200).send(result);
    },

    async searchMentions(request, reply) {
      const user = request.user!;
      const users = await service.searchMentions(
        database,
        discussionActor(user),
        request.query,
      );
      reply.status(200).send({ users });
    },
  };
}
