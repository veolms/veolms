import type {
  NotificationListQuery,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import type { FastifyRequest } from "fastify";

import type { NotificationService } from "./notifications.service.ts";

export function createNotificationController({
  service,
}: {
  service: NotificationService;
}) {
  async function list(
    request: FastifyRequest<{ Querystring: NotificationListQuery }>,
  ) {
    return await service.list(request.user!.id, request.query);
  }

  async function getSummary(request: FastifyRequest) {
    return await service.getSummary(request.user!.id);
  }

  async function markRead(request: FastifyRequest<{ Params: { id: string } }>) {
    return await service.markRead(request.user!.id, request.params.id);
  }

  async function markAllRead(request: FastifyRequest) {
    return await service.markAllRead(request.user!.id);
  }

  async function archive(request: FastifyRequest<{ Params: { id: string } }>) {
    return await service.archive(request.user!.id, request.params.id);
  }

  async function getPreferences(request: FastifyRequest) {
    return await service.getPreferences(request.user!.id);
  }

  async function updatePreferences(
    request: FastifyRequest<{ Body: UpdateNotificationPreferences }>,
  ) {
    return await service.updatePreferences(request.user!.id, request.body);
  }

  return {
    list,
    getSummary,
    markRead,
    markAllRead,
    archive,
    getPreferences,
    updatePreferences,
  };
}

export type NotificationController = ReturnType<
  typeof createNotificationController
>;
