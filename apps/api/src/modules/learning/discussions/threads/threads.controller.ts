import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningThreadRequest,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import type { ThreadsService } from "./threads.service.ts";
import { discussionActor } from "../shared/discussion.access.ts";

export interface ThreadsController {
  createLessonThread(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string };
      Body: CreateLearningThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listLessonThreads(
    request: FastifyRequest<{
      Params: { courseId: string; lessonId: string };
      Querystring: ListLearningThreadsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listHubThreads(
    request: FastifyRequest<{
      Querystring: ListLearningThreadsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  getThread(
    request: FastifyRequest<{
      Params: { threadId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  updateThread(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: UpdateLearningThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  deleteThread(
    request: FastifyRequest<{
      Params: { threadId: string };
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createThreadsController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: ThreadsService;
}): ThreadsController {
  return {
    async createLessonThread(request, reply) {
      const user = request.user!;
      const { courseId, lessonId } = request.params;
      const body = request.body;

      const thread = await service.createThread(database, {
        userId: user.id,
        roles: user.roles,
        courseId,
        lessonId,
        kind: body.kind,
        title: body.title,
        content: body.content,
        timestampSeconds: body.timestampSeconds,
        visibility: body.visibility,
        attachmentIds: body.attachmentIds,
      });

      reply.status(201).send(thread);
    },

    async listLessonThreads(request, reply) {
      const user = request.user!;
      const { courseId, lessonId } = request.params;
      const query = request.query;

      const result = await service.listThreads(database, {
        ...query,
        courseId,
        lessonId,
        currentUserId: user.id,
        roles: user.roles,
      });

      reply.status(200).send(result);
    },

    async listHubThreads(request, reply) {
      const user = request.user!;
      const query = request.query;

      const result = await service.listThreads(database, {
        ...query,
        currentUserId: user.id,
        roles: user.roles,
      });

      reply.status(200).send(result);
    },

    async getThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;

      const thread = await service.getThread(
        database,
        threadId,
        discussionActor(user),
      );
      reply.status(200).send(thread);
    },

    async updateThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const body = request.body;

      const thread = await service.updateThread(
        database,
        threadId,
        discussionActor(user),
        body,
      );
      reply.status(200).send(thread);
    },

    async deleteThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;

      await service.deleteThread(database, threadId, discussionActor(user));
      reply
        .status(200)
        .send({ message: "Discussion thread deleted successfully." });
    },
  };
}
