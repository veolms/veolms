import { z } from "zod";
import {
  auditLogsListResponseSchema,
  createReportRequestSchema,
  listAuditLogsQuerySchema,
  listReportsQuerySchema,
  moderateReplyRequestSchema,
  moderateThreadRequestSchema,
  reportsListResponseSchema,
  suspendUserRequestSchema,
  userSuspensionSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../lib/errors.ts";
import { jsonResponse } from "../../../lib/responses.ts";
import type { RoutePlugin } from "../../../lib/route-plugin.ts";
import { createLearningInteractionsContext } from "../shared/learning-interactions.context.ts";
import { createRepliesRepository } from "../replies/replies.repository.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createModerationController } from "./moderation.controller.ts";
import { createModerationRepository } from "./moderation.repository.ts";
import { createModerationService } from "./moderation.service.ts";

const moderationRoutes: RoutePlugin = async (app, options) => {
  const ctx = createLearningInteractionsContext(options);
  const threadsRepo = createThreadsRepository();
  const repliesRepo = createRepliesRepository();
  const moderationRepo = createModerationRepository();
  const service = createModerationService({
    threadsRepo,
    repliesRepo,
    moderationRepo,
  });
  const controller = createModerationController({
    database: options.database,
    service,
  });

  // 1. POST /learning-interactions/reports - Submit a report
  app.post(
    "/learning-interactions/reports",
    {
      preHandler: [ctx.authenticate, ctx.requireAuthenticated],
      schema: {
        operationId: "createLearningReport",
        tags: ["Learning Moderation"],
        summary: "Report an inappropriate comment, question, or reply",
        body: createReportRequestSchema,
        response: {
          201: jsonResponse(
            "Report submitted",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
        },
      },
    },
    controller.createReport,
  );

  // 2. GET /admin/moderation/reports - View report queue (Moderator)
  app.get(
    "/admin/moderation/reports",
    {
      preHandler: ctx.requireModerator,
      schema: {
        operationId: "listModerationReports",
        tags: ["Learning Moderation"],
        summary: "List reported items in the moderation queue (Moderator)",
        querystring: listReportsQuerySchema,
        response: {
          200: jsonResponse(
            "List of moderation reports",
            reportsListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Moderator required"),
        },
      },
    },
    controller.listReports,
  );

  // 3. POST /admin/moderation/threads/:threadId - Hide, lock, or delete thread
  app.post(
    "/admin/moderation/threads/:threadId",
    {
      preHandler: ctx.requireModerator,
      schema: {
        operationId: "moderateLearningThread",
        tags: ["Learning Moderation"],
        summary: "Moderate a discussion thread (Hide, Lock, Delete)",
        params: z.object({ threadId: z.uuid() }),
        body: moderateThreadRequestSchema,
        response: {
          200: jsonResponse(
            "Moderation action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.moderateThread,
  );

  // 4. POST /admin/moderation/replies/:replyId - Hide or delete reply
  app.post(
    "/admin/moderation/replies/:replyId",
    {
      preHandler: ctx.requireModerator,
      schema: {
        operationId: "moderateLearningReply",
        tags: ["Learning Moderation"],
        summary: "Moderate a reply (Hide, Delete)",
        params: z.object({ replyId: z.uuid() }),
        body: moderateReplyRequestSchema,
        response: {
          200: jsonResponse(
            "Moderation action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Reply not found"),
        },
      },
    },
    controller.moderateReply,
  );

  // 5. POST /admin/moderation/users/suspend - Suspend user participation
  app.post(
    "/admin/moderation/users/suspend",
    {
      preHandler: ctx.requireModerator,
      schema: {
        operationId: "suspendUserParticipation",
        tags: ["Learning Moderation"],
        summary: "Suspend a user's participation in discussions (Mute/Ban)",
        body: suspendUserRequestSchema,
        response: {
          201: jsonResponse("User suspended", userSuspensionSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Moderator required"),
        },
      },
    },
    controller.suspendUser,
  );

  // 6. GET /admin/moderation/audit-logs - Audit trail
  app.get(
    "/admin/moderation/audit-logs",
    {
      preHandler: ctx.requireModerator,
      schema: {
        operationId: "listModerationAuditLogs",
        tags: ["Learning Moderation"],
        summary: "List moderation actions audit trail",
        querystring: listAuditLogsQuerySchema,
        response: {
          200: jsonResponse("Audit logs list", auditLogsListResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listAuditLogs,
  );
};

export default moderationRoutes;
