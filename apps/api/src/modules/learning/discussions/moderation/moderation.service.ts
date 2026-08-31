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
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
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
    actor: DiscussionActor,
    query: ListReportsQuery,
    scope: "course" | "platform",
  ): Promise<ReportsListResponse>;

  moderateThread(
    db: DatabaseExecutor,
    threadId: string,
    actor: DiscussionActor,
    input: ModerateThreadRequest,
    courseId?: string,
    ipAddress?: string,
  ): Promise<void>;

  moderateReply(
    db: DatabaseExecutor,
    replyId: string,
    actor: DiscussionActor,
    input: ModerateReplyRequest,
    courseId?: string,
    ipAddress?: string,
  ): Promise<void>;

  suspendUser(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: SuspendUserRequest,
    ipAddress?: string,
  ): Promise<UserSuspension>;

  unsuspendUser(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: UnsuspendUserRequest,
    ipAddress?: string,
  ): Promise<{ message: string }>;

  listAuditLogs(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    query: ListAuditLogsQuery,
    scope: "course" | "platform",
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
  const courseAccess = createDiscussionAccess();

  async function resolveAcademyId(db: DatabaseExecutor): Promise<string> {
    const academy = await db
      .selectFrom("academy")
      .select("id")
      .executeTakeFirst();
    return academy?.id || "00000000-0000-0000-0000-000000000000";
  }

  async function assertModerationScope(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId?: string | null,
  ): Promise<void> {
    if (courseId) {
      await courseAccess.assertCanModerateCourse(db, actor, courseId);
      return;
    }
    courseAccess.assertCanModeratePlatform(actor);
  }

  return {
    async createReport(db, reporterId, input) {
      // 1. Verify target item exists
      if (input.targetType === "thread") {
        const thread = await threadsRepo.findThreadById(db, input.targetId);
        if (!thread) {
          throw httpError(
            404,
            "TARGET_NOT_FOUND",
            "Reported discussion thread not found",
          );
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

    async listReports(db, actor, query, scope) {
      await assertModerationScope(
        db,
        actor,
        scope === "course" ? query.courseId : null,
      );
      const rows = await moderationRepo.listReports(db, query);
      const reports: LearningReport[] = rows.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporter: {
          id: r.reporterId,
          displayName: r.reporterName || "Learner",
          username:
            r.reporterUsername || (r.reporterEmail || "user").split("@")[0],
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

    async moderateThread(db, threadId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (courseId && thread.courseId !== courseId) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Discussion thread does not belong to this course",
        );
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
        actorUserId: actor.userId,
        action: `${input.action}_thread`,
        targetType: "thread",
        targetId: threadId,
        details: { reason: input.reason || null },
        ipAddress,
      });
    },

    async moderateReply(db, replyId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
      }

      const thread = await threadsRepo.findThreadById(db, reply.threadId);
      if (courseId && thread && thread.courseId !== courseId) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Reply does not belong to this course",
        );
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
        const deleted = await repliesRepo.deleteReply(db, replyId);
        if (deleted) {
          await threadsRepo.incrementRepliesCount(db, reply.threadId, -1);
          if (reply.isAccepted || thread?.acceptedAnswerId === replyId) {
            await repliesRepo.setAcceptedStatus(db, replyId, false);
            await threadsRepo.setAcceptedAnswer(db, reply.threadId, null);
          }
        }
      }

      const academyId = await resolveAcademyId(db);
      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: thread?.courseId || courseId || null,
        actorUserId: actor.userId,
        action: `${input.action}_reply`,
        targetType: "reply",
        targetId: replyId,
        details: { reason: input.reason || null },
        ipAddress,
      });
    },

    async suspendUser(db, actor, input, ipAddress) {
      await assertModerationScope(db, actor, input.courseId);
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
        suspendedByUserId: actor.userId,
        scope: input.scope || "all",
        reason: input.reason,
        expiresAt,
      });

      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: input.courseId || null,
        actorUserId: actor.userId,
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
        suspendedByUserId: actor.userId,
        scope: input.scope || "all",
        reason: input.reason,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    },

    async unsuspendUser(db, actor, input, ipAddress) {
      await assertModerationScope(db, actor, input.courseId);
      const academyId = await resolveAcademyId(db);
      await moderationRepo.deactivateSuspension(
        db,
        input.userId,
        input.courseId,
      );

      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        courseId: input.courseId || null,
        actorUserId: actor.userId,
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

    async listAuditLogs(db, actor, query, scope) {
      await assertModerationScope(
        db,
        actor,
        scope === "course" ? query.courseId : null,
      );
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
              username:
                r.actorUsername || (r.actorEmail || "staff").split("@")[0],
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
