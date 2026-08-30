import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AcceptAnswerRequest,
  CreateLearningReplyRequest,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import type { RepliesService } from "./replies.service.ts";

export interface RepliesController {
  createReply(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: CreateLearningReplyRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listReplies(
    request: FastifyRequest<{
      Params: { threadId: string };
      Querystring: ListLearningRepliesQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  updateReply(
    request: FastifyRequest<{
      Params: { replyId: string };
      Body: UpdateLearningReplyRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  deleteReply(
    request: FastifyRequest<{
      Params: { replyId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  acceptAnswer(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: AcceptAnswerRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createRepliesController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: RepliesService;
}): RepliesController {
  return {
    async createReply(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const body = request.body;

      const created = await service.createReply(database, {
        threadId,
        userId: user.id,
        content: body.content,
        plainText: body.plainText,
        parentReplyId: body.parentReplyId,
        timestampSeconds: body.timestampSeconds,
      });

      reply.status(201).send(created);
    },

    async listReplies(request, reply) {
      const user = request.user;
      const { threadId } = request.params;
      const query = request.query;

      const result = await service.listReplies(
        database,
        threadId,
        query,
        user?.id,
      );
      reply.status(200).send(result);
    },

    async updateReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;
      const body = request.body;

      const updated = await service.updateReply(
        database,
        replyId,
        user.id,
        body,
      );
      reply.status(200).send(updated);
    },

    async deleteReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;
      const isModerator =
        user.roles.includes("admin") ||
        user.roles.includes("instructor") ||
        user.roles.includes("creator");

      await service.deleteReply(database, replyId, user.id, isModerator);
      reply.status(200).send({ message: "Reply deleted successfully." });
    },

    async acceptAnswer(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const { replyId } = request.body;
      const isModerator =
        user.roles.includes("admin") ||
        user.roles.includes("instructor") ||
        user.roles.includes("creator");

      const result = await service.acceptAnswer(
        database,
        threadId,
        replyId,
        user.id,
        isModerator,
      );
      reply.status(200).send(result);
    },
  };
}
