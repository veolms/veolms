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
  UserSuspension,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
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
    ipAddress?: string,
  ): Promise<void>;

  moderateReply(
    db: DatabaseExecutor,
    replyId: string,
    moderatorId: string,
    input: ModerateReplyRequest,
    ipAddress?: string,
  ): Promise<void>;

  suspendUser(
    db: DatabaseExecutor,
    moderatorId: string,
    input: SuspendUserRequest,
    ipAddress?: string,
  ): Promise<UserSuspension>;

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
      const id = crypto.randomUUID();
      await moderationRepo.createReport(db, {
        id,
        reporterId,
        targetType: input.targetType,
        targetId: input.targetId,
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
          username: (r.reporterEmail || "user").split("@")[0],
          avatarUrl: null,
          role: "Student",
        },
        targetType: r.targetType,
        targetId: r.targetId,
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

    async moderateThread(db, threadId, moderatorId, input, ipAddress) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
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
        await threadsRepo.softDeleteThread(db, threadId);
      }

      const academyId = await resolveAcademyId(db);
      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        actorUserId: moderatorId,
        action: `thread_${input.action}`,
        targetType: "thread",
        targetId: threadId,
        details: { reason: input.reason },
        ipAddress,
      });
    },

    async moderateReply(db, replyId, moderatorId, input, ipAddress) {
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
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
        await repliesRepo.softDeleteReply(db, replyId);
        await threadsRepo.incrementRepliesCount(db, reply.threadId, -1);
      }

      const academyId = await resolveAcademyId(db);
      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        actorUserId: moderatorId,
        action: `reply_${input.action}`,
        targetType: "reply",
        targetId: replyId,
        details: { reason: input.reason },
        ipAddress,
      });
    },

    async suspendUser(db, moderatorId, input, ipAddress) {
      const academyId = await resolveAcademyId(db);
      const id = crypto.randomUUID();
      const expiresAt = input.permanent
        ? null
        : input.durationHours
          ? new Date(Date.now() + input.durationHours * 3600 * 1000)
          : new Date(Date.now() + 24 * 3600 * 1000); // default 24h

      await moderationRepo.createSuspension(db, {
        id,
        academyId,
        userId: input.userId,
        suspendedByUserId: moderatorId,
        reason: input.reason,
        expiresAt,
      });

      await moderationRepo.createAuditLog(db, {
        id: crypto.randomUUID(),
        academyId,
        actorUserId: moderatorId,
        action: "user_suspend",
        targetType: "user",
        targetId: input.userId,
        details: { reason: input.reason, expiresAt },
        ipAddress,
      });

      return {
        id,
        academyId,
        userId: input.userId,
        suspendedByUserId: moderatorId,
        reason: input.reason,
        expiresAt: expiresAt ? expiresAt.toISOString() : null,
        isActive: true,
        createdAt: new Date().toISOString(),
      };
    },

    async listAuditLogs(db, query) {
      const academyId = await resolveAcademyId(db);
      const rows = await moderationRepo.listAuditLogs(db, academyId, query);
      const logs: LearningAuditLog[] = rows.map((r) => ({
        id: r.id,
        academyId: r.academyId,
        actorUserId: r.actorUserId,
        actor: {
          id: r.actorUserId,
          displayName: r.actorName || "Staff Member",
          username: (r.actorEmail || "staff").split("@")[0],
          avatarUrl: null,
          role: "Admin",
        },
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
