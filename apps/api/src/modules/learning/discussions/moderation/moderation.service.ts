import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AuditLogsListResponse,
  CreateReportRequest,
  LearningAuditLog,
  LearningReport,
  ListAuditLogsQuery,
  ListReportsQuery,
  ModerateReplyRequest,
  ModerateThreadRequest,
  ReportsListResponse,
  SuspendUserRequest,
  UnsuspendUserRequest,
  UserSuspension,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { ModerationRepository } from "./moderation.repository.ts";

export interface ModerationService {
  createReport(
    db: DatabaseExecutor,
    reporterId: string,
    input: CreateReportRequest,
  ): Promise<{ message: string }>;

  listReports(
    db: DatabaseExecutor,
    query: ListReportsQuery,
  ): Promise<ReportsListResponse>;

  moderateThread(
    db: DatabaseExecutor,
    threadId: string,
    moderatorId: string,
    input: ModerateThreadRequest,
    courseId?: string,
    ipAddress?: string,
  ): Promise<void>;

  moderateReply(
    db: DatabaseExecutor,
    replyId: string,
    moderatorId: string,
    input: ModerateReplyRequest,
    courseId?: string,
    ipAddress?: string,
  ): Promise<void>;

  suspendUser(
    db: DatabaseExecutor,
    moderatorId: string,
    input: SuspendUserRequest,
    ipAddress?: string,
  ): Promise<UserSuspension>;

  unsuspendUser(
    db: DatabaseExecutor,
    moderatorId: string,
    input: UnsuspendUserRequest,
    ipAddress?: string,
  ): Promise<{ message: string }>;

  listAuditLogs(
    db: DatabaseExecutor,
    query: ListAuditLogsQuery,
  ): Promise<AuditLogsListResponse>;
}

export function createModerationService({
  threadsRepo,
  repliesRepo,
  moderationRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
  moderationRepo: ModerationRepository;
}): ModerationService {
  async function resolveAcademyId(db: DatabaseExecutor): Promise<string> {
    const academy = await db.selectFrom("academy").select("id").executeTakeFirst();
    return academy?.id || "00000000-0000-0000-0000-000000000000";
  }

  return {
    async createReport(db, reporterId, input) {
      // 1. Verify target item exists
      if (input.targetType === "thread") {
        const thread = await threadsRepo.findThreadById(db, input.targetId);
        if (!thread) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported discussion thread not found");
        }
      } else if (input.targetType === "reply") {
        const reply = await repliesRepo.findReplyById(db, input.targetId);
        if (!reply) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported reply not found");
        }
      }

      // 2. Prevent spam / duplicate pending reports by the same reporter
      const existing = await moderationRepo.findPendingReport(
        db,
        reporterId,
        input.targetType,
        input.targetId,
      );
      if (existing) {
        throw httpError(
          400,
          "DUPLICATE_REPORT",
          "You already have a pending report for this item. Our moderation team is reviewing it.",
        );
      }

      const id = crypto.randomUUID();
      await moderationRepo.createReport(db, {
        id,
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
        courseId: input.courseId || null,
        reason: input.reason,
        details: input.details,
      });

      return { message: "Report submitted successfully." };
    },

    async listReports(db, query) {
      const rows = await moderationRepo.listReports(db, query);
      const reports: LearningReport[] = rows.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporter: {
          id: r.reporterId,
          displayName: r.reporterName || "Learner",
          username: r.reporterUsername || (r.reporterEmail || "user").split("@")[0],
          avatarUrl: null,
          role: "Student",
        },
        targetType: r.targetType,
        targetId: r.targetId,
        courseId: r.courseId ?? null,
        reason: r.reason,
        details: r.details,
        status: r.status,
        reviewedByUserId: r.reviewedByUserId ?? null,
        actionTaken: r.actionTaken ?? null,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
        updatedAt:
          r.updatedAt instanceof Date
            ? r.updatedAt.toISOString()
            : String(r.updatedAt),
      }));

      return {
        reports,
        nextCursor: null,
        totalCount: reports.length,
      };
    },

    async moderateThread(db, threadId, moderatorId, input, courseId, ipAddress) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (courseId && thread.courseId !== courseId) {
        throw httpError(403, "FORBIDDEN", "Discussion thread does not belong to this course");
      }

      if (input.action === "hide") {
        await threadsRepo.setStatus(db, threadId, "hidden");
      } else if (input.action === "unhide") {
        await threadsRepo.setStatus(db, threadId, "active");
      } else if (input.action === "lock") {
        await threadsRepo.setLocked(db, threadId, true);
      } else if (input.action === "unlock") {
        await threadsRepo.setLocked(db, threadId, false);
      } else if (input.action === "delete") {
        await threadsRepo.deleteThread(db, threadId);
      }

      const academyId = await resolveAcademyId(db);
      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: thread.courseId,
        actorUserId: moderatorId,
        action: `${input.action}_thread`,
        targetType: "thread",
        targetId: threadId,
        details: { reason: input.reason || null },
        ipAddress,
      });
    },

    async moderateReply(db, replyId, moderatorId, input, courseId, ipAddress) {
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
      }

      const thread = await threadsRepo.findThreadById(db, reply.threadId);
      if (courseId && thread && thread.courseId !== courseId) {
        throw httpError(403, "FORBIDDEN", "Reply does not belong to this course");
      }

      if (input.action === "hide") {
        await db
          .updateTable("learning_replies")
          .set({ status: "hidden", updated_at: new Date() })
          .where("id", "=", replyId)
          .execute();
      } else if (input.action === "unhide") {
        await db
          .updateTable("learning_replies")
          .set({ status: "active", updated_at: new Date() })
          .where("id", "=", replyId)
          .execute();
      } else if (input.action === "delete") {
        await repliesRepo.deleteReply(db, replyId);
        await threadsRepo.incrementRepliesCount(db, reply.threadId, -1);
      }

      const academyId = await resolveAcademyId(db);
      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: thread?.courseId || courseId || null,
        actorUserId: moderatorId,
        action: `${input.action}_reply`,
        targetType: "reply",
        targetId: replyId,
        details: { reason: input.reason || null },
        ipAddress,
      });
    },

    async suspendUser(db, moderatorId, input, ipAddress) {
      const academyId = await resolveAcademyId(db);
      const id = crypto.randomUUID();
      const expiresAt =
        input.duration.type === "permanent"
          ? null
          : new Date(Date.now() + input.duration.durationHours * 3600 * 1000);

      await moderationRepo.createSuspension(db, {
        id,
        academyId,
        courseId: input.courseId || null,
        userId: input.userId,
        suspendedByUserId: moderatorId,
        scope: input.scope || "all",
        reason: input.reason,
        expiresAt,
      });

      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: input.courseId || null,
        actorUserId: moderatorId,
        action: "suspend_user",
        targetType: "user",
        targetId: input.userId,
        details: {
          reason: input.reason,
          scope: input.scope || "all",
          courseId: input.courseId || null,
          expiresAt: expiresAt ? expiresAt.toISOString() : null,
        },
        ipAddress,
      });

      return {
        id,
        academyId,
        courseId: input.courseId || null,
        userId: input.userId,
        suspendedByUserId: moderatorId,
        scope: input.scope || "all",
        reason: input.reason,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    },

    async unsuspendUser(db, moderatorId, input, ipAddress) {
      const academyId = await resolveAcademyId(db);
      await moderationRepo.deactivateSuspension(db, input.userId, input.courseId);

      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: input.courseId || null,
        actorUserId: moderatorId,
        action: "unsuspend_user",
        targetType: "user",
        targetId: input.userId,
        details: {
          reason: input.reason || null,
          courseId: input.courseId || null,
        },
        ipAddress,
      });

      return { message: "User participation suspension has been lifted." };
    },

    async listAuditLogs(db, query) {
      const academyId = await resolveAcademyId(db);
      const rows = await moderationRepo.listAuditLogs(db, academyId, query);
      const logs: LearningAuditLog[] = rows.map((r) => ({
        id: r.id,
        academyId: r.academyId,
        courseId: r.courseId ?? null,
        actorUserId: r.actorUserId ?? null,
        actor: r.actorUserId
          ? {
              id: r.actorUserId,
              displayName: r.actorName || "Staff Member",
              username: r.actorUsername || (r.actorEmail || "staff").split("@")[0],
              avatarUrl: null,
              role: "Admin",
            }
          : undefined,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details:
          typeof r.details === "string"
            ? JSON.parse(r.details)
            : (r.details as Record<string, unknown> | null),
        ipAddress: r.ipAddress ?? null,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
      }));

      return {
        logs,
        nextCursor: null,
      };
    },
  };
}
