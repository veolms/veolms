import {
  chatCreateRestrictionRequestSchema,
  chatHandleReportRequestSchema,
  chatIdParamsSchema,
  chatMessageListResponseSchema,
  chatMessageParamsSchema,
  chatModerationLogQuerySchema,
  chatModerationLogResponseSchema,
  chatOkResponseSchema,
  chatReportListQuerySchema,
  chatReportListResponseSchema,
  chatReportRequestSchema,
  chatRestrictionListQuerySchema,
  chatRestrictionListResponseSchema,
  chatRestrictionResponseSchema,
  chatSettingsResponseSchema,
  chatUpdateSettingsRequestSchema,
} from "@veolms/contracts";

import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createPermissionPreHandlers } from "../../authorization/index.ts";
import {
  chatTags as tags,
  perUser,
  requireChatEnabled,
} from "../shared/chat.http.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";
import { createModerationController } from "./moderation.controller.ts";
import { createModerationService } from "./moderation.service.ts";

const moderationRoutes: RoutePlugin = async (app, options) => {
  const { signedIn } = createPermissionPreHandlers(options.database);
  const runtime = getChatRuntime(app, options.database);
  const controller = createModerationController({
    service: createModerationService(runtime),
  });
  const preHandler = [...signedIn, requireChatEnabled];
  const common = {
    401: errorResponse("Authentication required"),
    403: errorResponse("Not allowed"),
    404: errorResponse("Not found"),
  };

  app.post(
    "/chat/restrictions",
    {
      config: { rateLimit: perUser(60, "1 hour") },
      preHandler: [...preHandler],
      schema: {
        operationId: "createChatRestriction",
        tags,
        summary:
          "Mute, remove (ban) or turn off private chats, in one group or all chats",
        description:
          "Group admins act in their groups on people below them; helpers may only mute learners for up to 24 hours. Across all chats: chat managers, or instructors over learners in their courses (chat managers are notified).",
        body: chatCreateRestrictionRequestSchema,
        response: {
          201: jsonResponse("The restriction", chatRestrictionResponseSchema),
          ...common,
        },
      },
    },
    controller.createRestriction,
  );

  app.delete(
    "/chat/restrictions/:id",
    {
      preHandler,
      schema: {
        operationId: "liftChatRestriction",
        tags,
        summary: "Lift a restriction",
        params: chatIdParamsSchema,
        response: {
          200: jsonResponse(
            "The lifted restriction",
            chatRestrictionResponseSchema,
          ),
          ...common,
        },
      },
    },
    controller.revokeRestriction,
  );

  app.get(
    "/chat/restrictions",
    {
      preHandler,
      schema: {
        operationId: "listChatRestrictions",
        tags,
        summary:
          "Restrictions in a group (its admins) or everywhere (chat managers)",
        querystring: chatRestrictionListQuerySchema,
        response: {
          200: jsonResponse("Restrictions", chatRestrictionListResponseSchema),
          ...common,
        },
      },
    },
    controller.listRestrictions,
  );

  app.post(
    "/chat/rooms/:roomId/messages/:seq/report",
    {
      config: { rateLimit: perUser(20, "1 day") },
      preHandler: [...preHandler],
      schema: {
        operationId: "reportChatMessage",
        tags,
        summary: "Report a message (and optionally block its sender)",
        params: chatMessageParamsSchema,
        body: chatReportRequestSchema,
        response: {
          201: jsonResponse("Reported", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.report,
  );

  app.get(
    "/chat/reports",
    {
      preHandler,
      schema: {
        operationId: "listChatReports",
        tags,
        summary:
          "Reports in the groups you moderate (private chats: chat managers)",
        querystring: chatReportListQuerySchema,
        response: {
          200: jsonResponse("Reports", chatReportListResponseSchema),
          ...common,
        },
      },
    },
    controller.listReports,
  );

  app.patch(
    "/chat/reports/:id",
    {
      preHandler,
      schema: {
        operationId: "handleChatReport",
        tags,
        summary:
          "Mark a report actioned or dismissed (every report of that message)",
        params: chatIdParamsSchema,
        body: chatHandleReportRequestSchema,
        response: {
          200: jsonResponse("Updated", chatOkResponseSchema),
          ...common,
        },
      },
    },
    controller.handleReport,
  );

  app.get(
    "/chat/reports/:id/context",
    {
      preHandler,
      schema: {
        operationId: "getChatReportContext",
        tags,
        summary:
          "The messages around a reported one (chat managers; every view is logged)",
        params: chatIdParamsSchema,
        response: {
          200: jsonResponse("Messages", chatMessageListResponseSchema),
          ...common,
        },
      },
    },
    controller.reportContext,
  );

  app.get(
    "/chat/moderation-log",
    {
      preHandler,
      schema: {
        operationId: "listChatModerationLog",
        tags,
        summary:
          "Moderation actions (a group's admins: that group; chat managers: all)",
        querystring: chatModerationLogQuerySchema,
        response: {
          200: jsonResponse("Log entries", chatModerationLogResponseSchema),
          ...common,
        },
      },
    },
    controller.listLog,
  );

  app.get(
    "/chat/settings",
    {
      preHandler,
      schema: {
        operationId: "getChatPlatformSettings",
        tags,
        summary: "Platform chat settings (chat managers)",
        response: {
          200: jsonResponse("Settings", chatSettingsResponseSchema),
          ...common,
        },
      },
    },
    controller.getSettings,
  );

  app.patch(
    "/chat/settings",
    {
      preHandler,
      schema: {
        operationId: "updateChatPlatformSettings",
        tags,
        summary: "Change platform chat settings (chat managers)",
        body: chatUpdateSettingsRequestSchema,
        response: {
          200: jsonResponse("Settings", chatSettingsResponseSchema),
          ...common,
        },
      },
    },
    controller.updateSettings,
  );
};

export default moderationRoutes;
