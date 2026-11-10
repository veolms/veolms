import type {
  EmailUnsubscribeParams,
  NotificationListQuery,
  UpdateNotificationPreferences,
} from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import {
  createNotificationStreamHandler,
  type NotificationStreamHub,
} from "./notification-stream.ts";
import { config } from "../../config.ts";
import { AppError } from "../../lib/errors.ts";
import {
  readUnsubscribeToken,
  renderUnsubscribePage,
  unsubscribeGroupLabel,
} from "./email-unsubscribe.ts";
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

  function settingsUrl(): string {
    return new URL("/settings/notifications", config.WEB_URL).toString();
  }

  async function showUnsubscribePage(
    request: FastifyRequest<{
      Params: EmailUnsubscribeParams;
      Querystring: { done?: string | undefined };
    }>,
    reply: FastifyReply,
  ) {
    const claims = readUnsubscribeToken(request.params.token);
    void reply
      .type("text/html; charset=utf-8")
      .header("Cache-Control", "no-store")
      .header("X-Robots-Tag", "noindex");
    return renderUnsubscribePage({
      academyName: config.ACADEMY_NAME,
      state: claims ? (request.query.done === "1" ? "done" : "ask") : "invalid",
      ...(claims ? { groupLabel: unsubscribeGroupLabel(claims.group) } : {}),
      settingsUrl: settingsUrl(),
    });
  }

  async function unsubscribe(
    request: FastifyRequest<{ Params: EmailUnsubscribeParams }>,
    reply: FastifyReply,
  ) {
    const result = await service.unsubscribeByToken(request.params.token);
    if ((request.headers.accept ?? "").includes("text/html")) {
      // The page's own button: back to the page, which now confirms (or,
      // for a bad link, says so).
      const path = request.url.split("?")[0] ?? request.url;
      return reply.redirect(`${path}?done=1`, 303);
    }
    if (!result) {
      throw new AppError(
        404,
        "UNSUBSCRIBE_LINK_INVALID",
        "This unsubscribe link is invalid or has expired.",
      );
    }
    return { unsubscribed: true as const, group: result.group };
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
    showUnsubscribePage,
    unsubscribe,
  };
}

export type NotificationController = ReturnType<
  typeof createNotificationController
>;
