import type { FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateReportRequest,
  ListAuditLogsQuery,
  ListReportsQuery,
  ModerateReplyRequest,
  ModerateThreadRequest,
  SuspendUserRequest,
} from "@veolms/contracts";
import type { ModerationService } from "./moderation.service.ts";

export interface ModerationController {
  createReport(
    request: FastifyRequest<{ Body: CreateReportRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  listReports(
    request: FastifyRequest<{ Querystring: ListReportsQuery }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderateThread(
    request: FastifyRequest<{
      Params: { threadId: string };
      Body: ModerateThreadRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  moderateReply(
    request: FastifyRequest<{
      Params: { replyId: string };
      Body: ModerateReplyRequest;
    }>,
    reply: FastifyReply,
  ): Promise<void>;

  suspendUser(
    request: FastifyRequest<{ Body: SuspendUserRequest }>,
    reply: FastifyReply,
  ): Promise<void>;

  listAuditLogs(
    request: FastifyRequest<{ Querystring: ListAuditLogsQuery }>,
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

    async listReports(request, reply) {
      const query = request.query;
      const result = await service.listReports(database, query);
      reply.status(200).send(result);
    },

    async moderateThread(request, reply) {
      const user = request.user!;
      const { threadId } = request.params;
      const body = request.body;

      await service.moderateThread(
        database,
        threadId,
        user.id,
        body,
        request.ip,
      );
      reply.status(200).send({ message: `Thread action '${body.action}' applied.` });
    },

    async moderateReply(request, reply) {
      const user = request.user!;
      const { replyId } = request.params;
      const body = request.body;

      await service.moderateReply(
        database,
        replyId,
        user.id,
        body,
        request.ip,
      );
      reply.status(200).send({ message: `Reply action '${body.action}' applied.` });
    },

    async suspendUser(request, reply) {
      const user = request.user!;
      const body = request.body;

      const suspension = await service.suspendUser(
        database,
        user.id,
        body,
        request.ip,
      );
      reply.status(201).send(suspension);
    },

    async listAuditLogs(request, reply) {
      const query = request.query;

      const result = await service.listAuditLogs(
        database,
        query,
      );
      reply.status(200).send(result);
    },
  };
}
