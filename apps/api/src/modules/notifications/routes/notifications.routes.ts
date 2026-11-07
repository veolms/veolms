import {
  archiveNotificationResponseSchema,
  markAllNotificationsReadResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationPreferencesResponseSchema,
  notificationReadStateSchema,
  notificationSummarySchema,
  updateNotificationPreferencesSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import { config } from "../../../config.ts";
import { createNotificationStreamHub } from "../notification-stream.ts";
import { createNotificationController } from "../notifications.controller.ts";
import { createNotificationService } from "../notifications.service.ts";

const notificationRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
    middleware.requireMfaVerified,
  ];
  const service = createNotificationService({ database: options.database });
  // One LISTEN connection for this process's open streams, opened when the
  // first stream is (an app built for tests opens none). DATABASE_URL is
  // the writer on every server: LISTEN does not work on a replica.
  const hub = createNotificationStreamHub({
    connectionString: config.DATABASE_URL,
    logger: app.log,
  });
  app.addHook("onClose", async () => {
    await hub.stop();
  });
  const controller = createNotificationController({
    service,
    stream: {
      hub,
      enabled: config.NOTIFICATION_STREAM_ENABLED,
      maxStreamsPerUser: config.NOTIFICATION_STREAM_MAX_PER_USER,
    },
  });

  app.get(
    "/notifications/stream",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "streamMyNotificationChanges",
        tags: ["Notifications"],
        summary: "Server-Sent Events: told when your notifications change",
        description:
          "A text/event-stream that never carries notifications, only " +
          "`event: ready` once open and `event: changed` when the signed-in " +
          "user's notifications change (refetch the summary and list), with " +
          "a `: ping` comment every 25 seconds. Ends after about 15 minutes; " +
          "EventSource reconnects by itself.",
        response: {
          401: errorResponse("Authentication required"),
          429: errorResponse("Too many open notification streams"),
          503: errorResponse("Live notification updates are turned off"),
        },
      },
    },
    controller.streamChanges,
  );

  app.get(
    "/notifications",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "listMyNotifications",
        tags: ["Notifications"],
        summary: "List notifications for the authenticated user",
        querystring: notificationListQuerySchema,
        response: {
          200: jsonResponse(
            "Cursor-paginated notification feed",
            notificationListResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.list,
  );

  app.get(
    "/notifications/summary",
    {
      // A poll: the badge asks again in a minute (load-shedding.ts).
      config: { shedUnderLoad: true },
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getMyNotificationSummary",
        tags: ["Notifications"],
        summary: "Get notification counts for the authenticated user",
        response: {
          200: jsonResponse("Notification summary", notificationSummarySchema),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.getSummary,
  );

  app.patch(
    "/notifications/:id/read",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "markMyNotificationRead",
        tags: ["Notifications"],
        summary: "Mark one notification as read",
        params: notificationIdParamsSchema,
        response: {
          200: jsonResponse(
            "Notification marked read",
            notificationReadStateSchema,
          ),
          401: errorResponse("Authentication required"),
          404: errorResponse("Notification not found"),
        },
      },
    },
    controller.markRead,
  );

  app.patch(
    "/notifications/:id/unread",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "markMyNotificationUnread",
        tags: ["Notifications"],
        summary: "Mark one notification as unread",
        params: notificationIdParamsSchema,
        response: {
          200: jsonResponse(
            "Notification marked unread",
            notificationReadStateSchema,
          ),
          401: errorResponse("Authentication required"),
          404: errorResponse("Notification not found"),
        },
      },
    },
    controller.markUnread,
  );

  app.post(
    "/notifications/read-all",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "markAllMyNotificationsRead",
        tags: ["Notifications"],
        summary: "Mark every notification as read",
        response: {
          200: jsonResponse(
            "Notifications marked read",
            markAllNotificationsReadResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.markAllRead,
  );

  app.patch(
    "/notifications/:id/archive",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "archiveMyNotification",
        tags: ["Notifications"],
        summary: "Archive one notification",
        params: notificationIdParamsSchema,
        response: {
          200: jsonResponse(
            "Notification archived",
            archiveNotificationResponseSchema,
          ),
          401: errorResponse("Authentication required"),
          404: errorResponse("Notification not found"),
        },
      },
    },
    controller.archive,
  );

  app.get(
    "/notification-preferences",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "getMyNotificationPreferences",
        tags: ["Notification Preferences"],
        summary: "Get notification preference overrides",
        response: {
          200: jsonResponse(
            "Notification preference overrides",
            notificationPreferencesResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.getPreferences,
  );

  app.put(
    "/notification-preferences",
    {
      preHandler: requireAuthenticated,
      schema: {
        operationId: "updateMyNotificationPreferences",
        tags: ["Notification Preferences"],
        summary: "Update notification preferences by type and channel",
        body: updateNotificationPreferencesSchema,
        response: {
          200: jsonResponse(
            "Notification preferences updated",
            notificationPreferencesResponseSchema,
          ),
          401: errorResponse("Authentication required"),
        },
      },
    },
    controller.updatePreferences,
  );
};

export default notificationRoutes;
