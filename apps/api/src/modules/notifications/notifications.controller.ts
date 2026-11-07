import type {
  NotificationListQuery,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createNotificationStreamHandler,
  type NotificationStreamHub,
} from "./notification-stream.ts";
import type { NotificationService } from "./notifications.service.ts";

export function createNotificationController({
  service,
  stream,
}: {
  service: NotificationService;
  stream: {
    hub: NotificationStreamHub;
    enabled: boolean;
    maxStreamsPerUser: number;
  };
}) {
  const streamHandler = createNotificationStreamHandler(stream);

  async function streamChanges(request: FastifyRequest, reply: FastifyReply) {
    await streamHandler(request, reply);
  }

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

  async function markUnread(
    request: FastifyRequest<{ Params: { id: string } }>,
  ) {
    return await service.markUnread(request.user!.id, request.params.id);
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
    streamChanges,
    list,
    getSummary,
    markRead,
    markUnread,
    markAllRead,
    archive,
    getPreferences,
    updatePreferences,
  };
}

export type NotificationController = ReturnType<
  typeof createNotificationController
>;
