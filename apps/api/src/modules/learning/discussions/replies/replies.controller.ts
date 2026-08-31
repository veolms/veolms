import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AcceptReplyRequest,
  CreateLearningReplyRequest,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import { discussionActor } from "../shared/discussion.access.ts";
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

  acceptReply(
    request: FastifyRequest<{
      Params: { replyId: string };
      Body: AcceptReplyRequest;
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
        roles: user.roles,
        content: body.content,
        parentReplyId: body.parentReplyId,
        replyToReplyId: body.replyToReplyId,
        timestampSeconds: body.timestampSeconds,
        attachmentIds: body.attachmentIds,
      });

      reply.status(201).send(created);
    },

    async listReplies(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const query = request.query;

      const result = await service.listReplies(
        database,
        threadId,
        query,
        discussionActor(user),
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
        discussionActor(user),
        body,
      );
      reply.status(200).send(updated);
    },

    async deleteReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;

      await service.deleteReply(database, replyId, discussionActor(user));
      reply.status(200).send({ message: "Reply deleted successfully." });
    },

    async acceptReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;
      const accepted =
        request.body?.accepted !== undefined ? request.body.accepted : true;

      const result = await service.acceptReply(
        database,
        replyId,
        accepted,
        discussionActor(user),
      );
      reply.status(200).send(result);
    },
  };
}
