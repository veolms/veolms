import {
  archiveNotificationResponseSchema,
  markAllNotificationsReadResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  emailUnsubscribeParamsSchema,
  emailUnsubscribeResponseSchema,
  notificationPreferencesResponseSchema,
  notificationReadStateSchema,
  notificationSummarySchema,
  updateNotificationPreferencesSchema,
} from "@veolms/contracts";

import { z } from "zod";

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
    database: options.database,
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

  // One-click unsubscribe (RFC 8058). Mail clients POST to the address in
  // the List-Unsubscribe header without showing a page; the footer link
  // opens the GET page, whose button POSTs the same address. No sign-in:
  // the signed token is the proof (see email-unsubscribe.ts).
  if (!app.hasContentTypeParser("application/x-www-form-urlencoded")) {
    app.addContentTypeParser(
      "application/x-www-form-urlencoded",
      { parseAs: "string" },
      (_request, body, done) => {
        done(null, body);
      },
    );
  }

  app.get(
    "/email/unsubscribe/:token",
    {
      schema: {
        operationId: "showEmailUnsubscribePage",
        tags: ["Notification Preferences"],
        summary: "The page behind an email's unsubscribe link",
        description:
          "HTML. Shows which emails the link turns off and a button that " +
          "POSTs to the same address; `?done=1` shows the confirmation.",
        params: emailUnsubscribeParamsSchema,
        querystring: z.object({ done: z.enum(["1"]).optional() }),
      },
    },
    controller.showUnsubscribePage,
  );

  app.post(
    "/email/unsubscribe/:token",
    {
      schema: {
        operationId: "unsubscribeByEmailLink",
        tags: ["Notification Preferences"],
        summary: "Turn off the emails an unsubscribe link names",
        description:
          "One-click unsubscribe: the body, if any, is ignored. A browser " +
          "(Accept: text/html) is sent back to the page's confirmation. " +
          "`?m=` names the marketing email the link came from, for its report.",
        params: emailUnsubscribeParamsSchema,
        querystring: z.object({ m: z.uuid().optional() }),
        response: {
          200: jsonResponse(
            "Emails of that group are turned off for the person the link names",
            emailUnsubscribeResponseSchema,
          ),
          404: errorResponse("The link is invalid or has expired"),
        },
      },
    },
    controller.unsubscribe,
  );
};

export default notificationRoutes;
