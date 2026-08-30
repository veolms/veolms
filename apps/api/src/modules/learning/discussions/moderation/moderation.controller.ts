import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateReportRequest,
  ListAuditLogsQuery,
  ListReportsQuery,
  ModerateReplyRequest,
  ModerateThreadRequest,
  SuspendUserRequest,
  UnsuspendUserRequest,
} from "@veolms/contracts";
import type { ModerationService } from "./moderation.service.ts";

export interface ModerationController {
  createReport(
    request: FastifyRequest<{ Body: CreateReportRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  listCourseReports(
    request: FastifyRequest<{
      Params: { courseId: string };
      Querystring: ListReportsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listPlatformReports(
    request: FastifyRequest<{
      Querystring: ListReportsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderateCourseThread(
    request: FastifyRequest<{
      Params: { courseId: string; threadId: string };
      Body: ModerateThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderatePlatformThread(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: ModerateThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderateCourseReply(
    request: FastifyRequest<{
      Params: { courseId: string; replyId: string };
      Body: ModerateReplyRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderatePlatformReply(
    request: FastifyRequest<{
      Params: { replyId: string };
      Body: ModerateReplyRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  suspendCourseParticipant(
    request: FastifyRequest<{
      Params: { courseId: string; userId: string };
      Body: Omit<SuspendUserRequest, "userId" | "courseId">;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  suspendPlatformUser(
    request: FastifyRequest<{
      Params: { userId: string };
      Body: Omit<SuspendUserRequest, "userId">;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  unsuspendCourseParticipant(
    request: FastifyRequest<{
      Params: { courseId: string; userId: string };
      Body?: Omit<UnsuspendUserRequest, "userId" | "courseId">;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  unsuspendPlatformUser(
    request: FastifyRequest<{
      Params: { userId: string };
      Body?: Omit<UnsuspendUserRequest, "userId">;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listCourseAuditLogs(
    request: FastifyRequest<{
      Params: { courseId: string };
      Querystring: ListAuditLogsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  listPlatformAuditLogs(
    request: FastifyRequest<{
      Querystring: ListAuditLogsQuery;
    }>,
    reply: FastifyReply,
  ): Promise<void>;
}

export function createModerationController({
  database,
  service,
}: {
  database: DatabaseExecutor;
  service: ModerationService;
}): ModerationController {
  return {
    async createReport(request, reply) {
      const user = request.user!;
      const body = request.body;

      const result = await service.createReport(database, user.id, body);
      reply.status(201).send(result);
    },

    async listCourseReports(request, reply) {
      const { courseId } = request.params;
      const query = request.query;

      const result = await service.listReports(database, {
        ...query,
        courseId,
      });
      reply.status(200).send(result);
    },

    async listPlatformReports(request, reply) {
      const query = request.query;

      const result = await service.listReports(database, query);
      reply.status(200).send(result);
    },

    async moderateCourseThread(request, reply) {
      const user = request.user!;
      const { courseId, threadId } = request.params;
      const body = request.body;

      await service.moderateThread(
        database,
        threadId,
        user.id,
        body,
        courseId,
        request.ip,
      );
      reply.status(200).send({ message: `Thread action '${body.action}' applied.` });
    },

    async moderatePlatformThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const body = request.body;

      await service.moderateThread(
        database,
        threadId,
        user.id,
        body,
        undefined,
        request.ip,
      );
      reply.status(200).send({ message: `Thread action '${body.action}' applied.` });
    },

    async moderateCourseReply(request, reply) {
      const user = request.user!;
      const { courseId, replyId } = request.params;
      const body = request.body;

      await service.moderateReply(
        database,
        replyId,
        user.id,
        body,
        courseId,
        request.ip,
      );
      reply.status(200).send({ message: `Reply action '${body.action}' applied.` });
    },

    async moderatePlatformReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;
      const body = request.body;

      await service.moderateReply(
        database,
        replyId,
        user.id,
        body,
        undefined,
        request.ip,
      );
      reply.status(200).send({ message: `Reply action '${body.action}' applied.` });
    },

    async suspendCourseParticipant(request, reply) {
      const user = request.user!;
      const { courseId, userId } = request.params;
      const body = request.body;

      const suspension = await service.suspendUser(
        database,
        user.id,
        {
          ...body,
          userId,
          courseId,
        },
        request.ip,
      );
      reply.status(201).send(suspension);
    },

    async suspendPlatformUser(request, reply) {
      const user = request.user!;
      const { userId } = request.params;
      const body = request.body;

      const suspension = await service.suspendUser(
        database,
        user.id,
        {
          ...body,
          userId,
          courseId: null,
        },
        request.ip,
      );
      reply.status(201).send(suspension);
    },

    async unsuspendCourseParticipant(request, reply) {
      const user = request.user!;
      const { courseId, userId } = request.params;
      const body = request.body;

      const result = await service.unsuspendUser(
        database,
        user.id,
        {
          userId,
          courseId,
          reason: body?.reason,
        },
        request.ip,
      );
      reply.status(200).send(result);
    },

    async unsuspendPlatformUser(request, reply) {
      const user = request.user!;
      const { userId } = request.params;
      const body = request.body;

      const result = await service.unsuspendUser(
        database,
        user.id,
        {
          userId,
          courseId: null,
          reason: body?.reason,
        },
        request.ip,
      );
      reply.status(200).send(result);
    },

    async listCourseAuditLogs(request, reply) {
      const { courseId } = request.params;
      const query = request.query;

      const result = await service.listAuditLogs(database, {
        ...query,
        courseId,
      });
      reply.status(200).send(result);
    },

    async listPlatformAuditLogs(request, reply) {
      const query = request.query;

      const result = await service.listAuditLogs(database, query);
      reply.status(200).send(result);
    },
  };
}
