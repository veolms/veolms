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
  unsuspendUserRequestSchema,
  updateReportRequestSchema,
  userSuspensionSchema,
} from "@veolms/contracts";
import { errorResponse } from "../../../../lib/errors.ts";
import { jsonResponse } from "../../../../lib/responses.ts";
import type { RoutePlugin } from "../../../../lib/route-plugin.ts";
import { createDiscussionPermissions } from "../shared/discussion.permissions.ts";
import { createRepliesRepository } from "../replies/replies.repository.ts";
import { createThreadsRepository } from "../threads/threads.repository.ts";
import { createModerationController } from "./moderation.controller.ts";
import { createModerationRepository } from "./moderation.repository.ts";
import { createModerationService } from "./moderation.service.ts";

const moderationRoutes: RoutePlugin = async (app, options) => {
  const permissions = createDiscussionPermissions(options);
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

  // ==========================================
  // 1. LEARNER REPORTING
  // ==========================================
  app.post(
    "/reports",
    {
      preHandler: permissions.requireAuthenticated,
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

  // ==========================================
  // 2. COURSE OWNER / ADMIN MODERATION
  // ==========================================

  // GET /courses/:courseId/moderation/reports
  app.get(
    "/courses/:courseId/moderation/reports",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "listCourseModerationReports",
        tags: ["Course Moderation"],
        summary: "List reports for a specific course",
        params: z.object({ courseId: z.uuid() }),
        querystring: listReportsQuerySchema,
        response: {
          200: jsonResponse(
            "Course moderation reports",
            reportsListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Course owner or admin required"),
        },
      },
    },
    controller.listCourseReports,
  );

  // POST /courses/:courseId/moderation/reports/:reportId/status
  app.post(
    "/courses/:courseId/moderation/reports/:reportId/status",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "updateCourseReportStatus",
        tags: ["Course Moderation"],
        summary:
          "Update status of a report within a course (reviewed, dismissed, actioned)",
        params: z.object({
          courseId: z.uuid(),
          reportId: z.uuid(),
        }),
        body: updateReportRequestSchema,
        response: {
          200: jsonResponse(
            "Report status updated",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Course owner or admin required"),
          404: errorResponse("Report not found"),
        },
      },
    },
    controller.updateCourseReportStatus,
  );

  // POST /courses/:courseId/moderation/threads/:threadId
  app.post(
    "/courses/:courseId/moderation/threads/:threadId",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "moderateCourseThread",
        tags: ["Course Moderation"],
        summary:
          "Moderate a discussion thread within a course (Hide, Lock, Delete)",
        params: z.object({
          courseId: z.uuid(),
          threadId: z.uuid(),
        }),
        body: moderateThreadRequestSchema,
        response: {
          200: jsonResponse(
            "Action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.moderateCourseThread,
  );

  // POST /courses/:courseId/moderation/replies/:replyId
  app.post(
    "/courses/:courseId/moderation/replies/:replyId",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "moderateCourseReply",
        tags: ["Course Moderation"],
        summary: "Moderate a reply within a course (Hide, Delete)",
        params: z.object({
          courseId: z.uuid(),
          replyId: z.uuid(),
        }),
        body: moderateReplyRequestSchema,
        response: {
          200: jsonResponse(
            "Action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
          404: errorResponse("Reply not found"),
        },
      },
    },
    controller.moderateCourseReply,
  );

  // POST /courses/:courseId/moderation/users/:userId/suspend
  app.post(
    "/courses/:courseId/moderation/users/:userId/suspend",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "suspendCourseParticipant",
        tags: ["Course Moderation"],
        summary: "Suspend user participation from this course's discussions",
        params: z.object({
          courseId: z.uuid(),
          userId: z.uuid(),
        }),
        body: suspendUserRequestSchema.omit({ userId: true, courseId: true }),
        response: {
          201: jsonResponse("User suspended from course", userSuspensionSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Course owner or admin required"),
        },
      },
    },
    controller.suspendCourseParticipant,
  );

  // POST /courses/:courseId/moderation/users/:userId/unsuspend
  app.post(
    "/courses/:courseId/moderation/users/:userId/unsuspend",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "unsuspendCourseParticipant",
        tags: ["Course Moderation"],
        summary: "Unsuspend user participation in this course's discussions",
        params: z.object({
          courseId: z.uuid(),
          userId: z.uuid(),
        }),
        body: unsuspendUserRequestSchema
          .omit({ userId: true, courseId: true })
          .optional(),
        response: {
          200: jsonResponse(
            "Suspension lifted",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Course owner or admin required"),
        },
      },
    },
    controller.unsuspendCourseParticipant,
  );

  // GET /courses/:courseId/moderation/audit-logs
  app.get(
    "/courses/:courseId/moderation/audit-logs",
    {
      preHandler: permissions.requireAuthenticated,
      schema: {
        operationId: "listCourseModerationAuditLogs",
        tags: ["Course Moderation"],
        summary: "List moderation audit trail for this course",
        params: z.object({ courseId: z.uuid() }),
        querystring: listAuditLogsQuerySchema,
        response: {
          200: jsonResponse("Course audit logs", auditLogsListResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden"),
        },
      },
    },
    controller.listCourseAuditLogs,
  );

  // ==========================================
  // 3. PLATFORM-WIDE ADMIN MODERATION
  // ==========================================

  // GET /moderation/reports
  app.get(
    "/moderation/reports",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "listPlatformModerationReports",
        tags: ["Platform Moderation"],
        summary: "List global reported items across all courses",
        querystring: listReportsQuerySchema,
        response: {
          200: jsonResponse(
            "Global moderation reports",
            reportsListResponseSchema,
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listPlatformReports,
  );

  // POST /moderation/reports/:reportId/status
  app.post(
    "/moderation/reports/:reportId/status",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "updatePlatformReportStatus",
        tags: ["Platform Moderation"],
        summary:
          "Update status of a report globally (reviewed, dismissed, actioned)",
        params: z.object({ reportId: z.uuid() }),
        body: updateReportRequestSchema,
        response: {
          200: jsonResponse(
            "Report status updated",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Report not found"),
        },
      },
    },
    controller.updatePlatformReportStatus,
  );

  // POST /moderation/threads/:threadId
  app.post(
    "/moderation/threads/:threadId",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "moderatePlatformThread",
        tags: ["Platform Moderation"],
        summary: "Moderate a discussion thread globally (Hide, Lock, Delete)",
        params: z.object({ threadId: z.uuid() }),
        body: moderateThreadRequestSchema,
        response: {
          200: jsonResponse(
            "Moderation action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Thread not found"),
        },
      },
    },
    controller.moderatePlatformThread,
  );

  // POST /moderation/replies/:replyId
  app.post(
    "/moderation/replies/:replyId",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "moderatePlatformReply",
        tags: ["Platform Moderation"],
        summary: "Moderate a reply globally (Hide, Delete)",
        params: z.object({ replyId: z.uuid() }),
        body: moderateReplyRequestSchema,
        response: {
          200: jsonResponse(
            "Moderation action applied",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
          404: errorResponse("Reply not found"),
        },
      },
    },
    controller.moderatePlatformReply,
  );

  // POST /moderation/users/:userId/suspend
  app.post(
    "/moderation/users/:userId/suspend",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "suspendPlatformUser",
        tags: ["Platform Moderation"],
        summary: "Suspend a user globally from all platform discussions",
        params: z.object({ userId: z.uuid() }),
        body: suspendUserRequestSchema.omit({ userId: true }),
        response: {
          201: jsonResponse("User suspended globally", userSuspensionSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.suspendPlatformUser,
  );

  // POST /moderation/users/:userId/unsuspend
  app.post(
    "/moderation/users/:userId/unsuspend",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "unsuspendPlatformUser",
        tags: ["Platform Moderation"],
        summary: "Lift global discussion suspension for a user",
        params: z.object({ userId: z.uuid() }),
        body: unsuspendUserRequestSchema.omit({ userId: true }).optional(),
        response: {
          200: jsonResponse(
            "Global suspension lifted",
            z.object({ message: z.string() }),
          ),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.unsuspendPlatformUser,
  );

  // GET /moderation/audit-logs
  app.get(
    "/moderation/audit-logs",
    {
      preHandler: permissions.requireAdmin,
      schema: {
        operationId: "listPlatformAuditLogs",
        tags: ["Platform Moderation"],
        summary: "List platform-wide moderation actions audit trail",
        querystring: listAuditLogsQuerySchema,
        response: {
          200: jsonResponse("Audit logs list", auditLogsListResponseSchema),
          401: errorResponse("Unauthorized"),
          403: errorResponse("Forbidden - Admin required"),
        },
      },
    },
    controller.listPlatformAuditLogs,
  );
};

export default moderationRoutes;
