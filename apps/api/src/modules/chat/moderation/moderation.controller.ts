import type { ChatReason, ChatRestrictionType } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import type { ModerationService } from "./moderation.service.ts";

export function createModerationController({
  service,
}: {
  service: ModerationService;
}) {
  return {
    async createRestriction(
      request: FastifyRequest<{
        Body: {
          userId: string;
          roomId?: string | null;
          type: ChatRestrictionType;
          durationMinutes?: number | null;
          reason: ChatReason;
          note?: string;
        };
      }>,
      reply: FastifyReply,
    ) {
      reply.code(201);
      return service.createRestriction(request.user!.id, request.body);
    },

    async revokeRestriction(
      request: FastifyRequest<{ Params: { id: string } }>,
    ) {
      return service.revokeRestriction(request.user!.id, request.params.id);
    },

    async listRestrictions(
      request: FastifyRequest<{
        Querystring: { roomId?: string; platform?: boolean; active?: boolean };
      }>,
    ) {
      return service.listRestrictions(request.user!.id, request.query);
    },

    async report(
      request: FastifyRequest<{
        Params: { roomId: string; seq: number };
        Body: { reason: ChatReason; details?: string; block?: boolean };
      }>,
      reply: FastifyReply,
    ) {
      reply.code(201);
      return service.report(
        request.user!.id,
        request.params.roomId,
        request.params.seq,
        request.body,
      );
    },

    async listReports(
      request: FastifyRequest<{
        Querystring: {
          status?: "open" | "actioned" | "dismissed";
          roomId?: string;
          cursor?: string;
          limit?: number;
        };
      }>,
    ) {
      return service.listReports(request.user!.id, request.query);
    },

    async handleReport(
      request: FastifyRequest<{
        Params: { id: string };
        Body: { status: "actioned" | "dismissed" };
      }>,
    ) {
      return service.handleReport(
        request.user!.id,
        request.params.id,
        request.body.status,
      );
    },

    async reportContext(request: FastifyRequest<{ Params: { id: string } }>) {
      return service.reportContext(request.user!.id, request.params.id);
    },

    async listLog(
      request: FastifyRequest<{
        Querystring: { roomId?: string; cursor?: string; limit?: number };
      }>,
    ) {
      return service.listLog(request.user!.id, request.query);
    },

    async getSettings(request: FastifyRequest) {
      return service.getSettings(request.user!.id);
    },

    async updateSettings(
      request: FastifyRequest<{
        Body: {
          directPolicy?: "off" | "staff_only" | "course_peers";
          courseRetentionMonths?: number;
          maxDirectRequestsPerDay?: number;
          maxHelpersPerRoom?: number;
        };
      }>,
    ) {
      return service.updateSettings(request.user!.id, request.body);
    },
  };
}
