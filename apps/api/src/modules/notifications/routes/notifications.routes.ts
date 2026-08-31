import {
  archiveNotificationResponseSchema,
  markAllNotificationsReadResponseSchema,
  notificationIdParamsSchema,
  notificationListQuerySchema,
  notificationListResponseSchema,
  notificationPreferencesResponseSchema,
  notificationSchema,
  notificationSummarySchema,
  updateNotificationPreferencesSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createAuthMiddleware } from "../../../middlewares/auth.middleware.ts";
import { createSessionService } from "../../auth/index.ts";
import { createNotificationController } from "../notifications.controller.ts";
import { createNotificationService } from "../notifications.service.ts";

const notificationRoutes: RoutePlugin = async (app, options) => {
  const sessionService = createSessionService({ database: options.database });
  const middleware = createAuthMiddleware(sessionService);
  const requireAuthenticated = [
    middleware.authenticate,
    middleware.requireAuthenticated,
  ];
  const service = createNotificationService({ database: options.database });
  const controller = createNotificationController({ service });

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
          200: jsonResponse("Notification marked read", notificationSchema),
          401: errorResponse("Authentication required"),
          404: errorResponse("Notification not found"),
        },
      },
    },
    controller.markRead,
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
