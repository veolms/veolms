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
  UpdateReportRequest,
  UserSuspension,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { DiscussionErrors } from "../shared/discussion.errors.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import {
  createDiscussionOutbox,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  mapAuthorRole,
  resolveAcademyId,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type {
  AuditLogRowWithActor,
  ModerationRepository,
  ReportRowWithReporter,
} from "./moderation.repository.ts";

function parseAuditLogDetails(value: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
    return null;
  } catch {
    return null;
  }
}

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

  updateReportStatus(
    db: DatabaseExecutor,
    reportId: string,
    actor: DiscussionActor,
    input: UpdateReportRequest,
    courseId?: string,
    ipAddress?: string,
  ): Promise<{ message: string }>;

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
  const outbox = createDiscussionOutbox();

  async function assertModerationScope(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    courseId?: string | null,
  ): Promise<void> {
    if (courseId) {
      await courseAccess.assertCanModerateCourse(db, actor, courseId);
    } else {
      courseAccess.assertCanModeratePlatform(actor);
    }
  }

  return {
    async createReport(db, reporterId, input) {
      // 1. Verify target item exists and derive its actual course
      let courseId: string | null = null;
      if (input.targetType === "thread") {
        const thread = await threadsRepo.findThreadById(db, input.targetId);
        if (!thread) {
          throw httpError(
            404,
            "TARGET_NOT_FOUND",
            "Reported discussion thread not found",
          );
        }
        courseId = thread.courseId;
      } else if (input.targetType === "reply") {
        const reply = await repliesRepo.findReplyById(db, input.targetId);
        if (!reply) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported reply not found");
        }
        const thread = await threadsRepo.findThreadById(db, reply.threadId);
        courseId = thread?.courseId ?? null;
      }

      // 2. Prevent spam / duplicate pending reports by the same reporter
      const existing = await moderationRepo.findPendingReport(
        db,
        reporterId,
        input.targetType,
        input.targetId,
      );
      if (existing) {
        throw DiscussionErrors.duplicateReport();
      }

      const id = crypto.randomUUID();
      try {
        await moderationRepo.createReport(db, {
          id,
          reporterId,
          targetType: input.targetType,
          targetId: input.targetId,
          courseId,
          reason: input.reason,
          details: input.details,
        });
      } catch (error) {
        if (
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          (error as { code?: unknown }).code === "23505"
        ) {
          throw DiscussionErrors.duplicateReport();
        }
        throw error;
      }

      return { message: "Report submitted successfully." };
    },

    async listReports(db, actor, query, scope) {
      await assertModerationScope(
        db,
        actor,
        scope === "course" ? query.courseId : null,
      );
      const pageCursor = decodeDiscussionCursor(query.cursor);
      const [rows, totalCount] = await Promise.all([
        moderationRepo.listReports(db, { ...query, pageCursor }),
        moderationRepo.countReports(db, query),
      ]);
      const { page, hasMore } = takePage(rows, query.limit);
      const reports: LearningReport[] = page.map((r) => ({
        id: r.id,
        reporterId: r.reporterId,
        reporter: {
          id: r.reporterId,
          displayName: r.reporterName || "Learner",
          username:
            (r.reporterUsername || r.reporterEmail || "user").split("@")[0] ||
            "user",
          avatarUrl: null,
          role: mapAuthorRole(r.authorRole),
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

      const last = page.at(-1);
      return {
        reports,
        nextCursor:
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.id,
                createdAt: toDate(last.createdAt),
              })
            : null,
        totalCount,
      };
    },

    async updateReportStatus(db, reportId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      return withWriteTransaction(db, async (trx) => {
        const report = await trx
          .selectFrom("learning_reports")
          .selectAll()
          .where("id", "=", reportId)
          .executeTakeFirst();
        if (!report) {
          throw httpError(404, "REPORT_NOT_FOUND", "Report not found");
        }

        if (courseId && report.course_id !== courseId) {
          throw httpError(
            403,
            "FORBIDDEN",
            "Report does not belong to this course",
          );
        }

        await moderationRepo.updateReportStatus(
          trx,
          reportId,
          input.status,
          actor.userId,
          input.actionTaken,
        );

        const academyId = await resolveAcademyId(trx);
        await moderationRepo.createAuditLog(trx, {
          id: crypto.randomUUID(),
          academyId,
          courseId: report.course_id || courseId || null,
          actorUserId: actor.userId,
          action: `${input.status}_report`,
          targetType: report.target_type,
          targetId: report.target_id,
          details: {
            reportId,
            status: input.status,
            actionTaken: input.actionTaken || null,
          },
          ipAddress,
        });

        if (report.reporter_id !== actor.userId) {
          await outbox.publish(trx, {
            type: "moderation.report_resolved",
            version: 1,
            dedupeKey: `moderation.report_resolved:${reportId}:${input.status}`,
            occurredAt: new Date(),
            payload: {
              recipientUserId: report.reporter_id,
              targetType: report.target_type,
              status: input.status,
              actionTaken: input.actionTaken || null,
            },
          });
        }

        return { message: `Report status updated to '${input.status}'.` };
      });
    },

    async moderateThread(db, threadId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      return withWriteTransaction(db, async (trx) => {
        const thread = await threadsRepo.findThreadById(trx, threadId);
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
          await threadsRepo.setStatus(trx, threadId, "hidden");
        } else if (input.action === "unhide") {
          await threadsRepo.setStatus(trx, threadId, "active");
        } else if (input.action === "lock") {
          await threadsRepo.setLocked(trx, threadId, true);
        } else if (input.action === "unlock") {
          await threadsRepo.setLocked(trx, threadId, false);
        } else if (input.action === "delete") {
          await threadsRepo.deleteThread(trx, threadId);
          await trx
            .updateTable("learning_attachments")
            .set({ status: "deleted" })
            .where("target_type", "=", "thread")
            .where("target_id", "=", threadId)
            .execute();
        }

        // Fetch pending reports before updating so we know who to notify
        const pendingReports = await trx
          .selectFrom("learning_reports")
          .select(["id", "reporter_id"])
          .where("target_type", "=", "thread")
          .where("target_id", "=", threadId)
          .where("status", "=", "pending")
          .execute();

        // Transition pending reports on this thread to actioned or reviewed
        const targetReportStatus =
          input.action === "hide" || input.action === "lock" || input.action === "delete"
            ? "actioned"
            : "reviewed";
        await trx
          .updateTable("learning_reports")
          .set({
            status: targetReportStatus,
            reviewed_by_user_id: actor.userId,
            action_taken: input.action,
            updated_at: new Date(),
          })
          .where("target_type", "=", "thread")
          .where("target_id", "=", threadId)
          .where("status", "=", "pending")
          .execute();

        const academyId = await resolveAcademyId(trx);
        await moderationRepo.createAuditLog(trx, {
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

        // Notify thread author of moderation action
        if (
          thread.userId !== actor.userId &&
          (input.action === "hide" || input.action === "delete" || input.action === "lock")
        ) {
          await outbox.publish(trx, {
            type: "moderation.content_moderated",
            version: 1,
            dedupeKey: `moderation.content_moderated:thread:${threadId}:${input.action}`,
            occurredAt: new Date(),
            payload: {
              recipientUserId: thread.userId,
              contentType: "thread",
              action: input.action,
              reason: input.reason || null,
            },
          });
        }

        // Notify reporters
        for (const rep of pendingReports) {
          if (rep.reporter_id !== actor.userId) {
            await outbox.publish(trx, {
              type: "moderation.report_resolved",
              version: 1,
              dedupeKey: `moderation.report_resolved:${rep.id}:${targetReportStatus}`,
              occurredAt: new Date(),
              payload: {
                recipientUserId: rep.reporter_id,
                targetType: "thread",
                status: targetReportStatus,
                actionTaken: input.action,
              },
            });
          }
        }
      });
    },

    async moderateReply(db, replyId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      return withWriteTransaction(db, async (trx) => {
        const reply = await repliesRepo.findReplyById(trx, replyId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }

        const thread = await threadsRepo.findThreadById(trx, reply.threadId);
        if (courseId && thread && thread.courseId !== courseId) {
          throw httpError(
            403,
            "FORBIDDEN",
            "Reply does not belong to this course",
          );
        }

        if (input.action === "hide") {
          await repliesRepo.setStatus(trx, replyId, "hidden");
        } else if (input.action === "unhide") {
          await repliesRepo.setStatus(trx, replyId, "active");
        } else if (input.action === "delete") {
          const deleted = await repliesRepo.deleteReply(trx, replyId);
          if (deleted) {
            await trx
              .updateTable("learning_attachments")
              .set({ status: "deleted" })
              .where("target_type", "=", "reply")
              .where("target_id", "=", replyId)
              .execute();
            await threadsRepo.incrementRepliesCount(trx, reply.threadId, -1);
            if (reply.isAccepted || thread?.acceptedAnswerId === replyId) {
              await repliesRepo.setAcceptedStatus(trx, replyId, false);
              await threadsRepo.setAcceptedAnswer(trx, reply.threadId, null);
            }
          }
        }

        // Fetch pending reports before updating
        const pendingReports = await trx
          .selectFrom("learning_reports")
          .select(["id", "reporter_id"])
          .where("target_type", "=", "reply")
          .where("target_id", "=", replyId)
          .where("status", "=", "pending")
          .execute();

        // Transition pending reports on this reply to actioned or reviewed
        const targetReportStatus =
          input.action === "hide" || input.action === "delete"
            ? "actioned"
            : "reviewed";
        await trx
          .updateTable("learning_reports")
          .set({
            status: targetReportStatus,
            reviewed_by_user_id: actor.userId,
            action_taken: input.action,
            updated_at: new Date(),
          })
          .where("target_type", "=", "reply")
          .where("target_id", "=", replyId)
          .where("status", "=", "pending")
          .execute();

        const academyId = await resolveAcademyId(trx);
        await moderationRepo.createAuditLog(trx, {
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

        // Notify reply author of moderation action
        if (
          reply.userId !== actor.userId &&
          (input.action === "hide" || input.action === "delete")
        ) {
          await outbox.publish(trx, {
            type: "moderation.content_moderated",
            version: 1,
            dedupeKey: `moderation.content_moderated:reply:${replyId}:${input.action}`,
            occurredAt: new Date(),
            payload: {
              recipientUserId: reply.userId,
              contentType: "reply",
              action: input.action,
              reason: input.reason || null,
            },
          });
        }

        // Notify reporters
        for (const rep of pendingReports) {
          if (rep.reporter_id !== actor.userId) {
            await outbox.publish(trx, {
              type: "moderation.report_resolved",
              version: 1,
              dedupeKey: `moderation.report_resolved:${rep.id}:${targetReportStatus}`,
              occurredAt: new Date(),
              payload: {
                recipientUserId: rep.reporter_id,
                targetType: "reply",
                status: targetReportStatus,
                actionTaken: input.action,
              },
            });
          }
        }
      });
    },

    async suspendUser(db, actor, input, ipAddress) {
      await assertModerationScope(db, actor, input.courseId);
      return withWriteTransaction(db, async (trx) => {
        const academyId = await resolveAcademyId(trx);
        const id = crypto.randomUUID();
        const expiresAt =
          input.duration.type === "permanent"
            ? null
            : new Date(Date.now() + input.duration.durationHours * 3600 * 1000);

        await moderationRepo.createSuspension(trx, {
          id,
          academyId,
          courseId: input.courseId || null,
          userId: input.userId,
          suspendedByUserId: actor.userId,
          scope: input.scope || "all",
          reason: input.reason,
          expiresAt,
        });

        await moderationRepo.createAuditLog(trx, {
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

        // Notify suspended user
        await outbox.publish(trx, {
          type: "moderation.user_suspended",
          version: 1,
          dedupeKey: `moderation.user_suspended:${input.userId}:${id}`,
          occurredAt: new Date(),
          payload: {
            recipientUserId: input.userId,
            scope: input.scope || "all",
            reason: input.reason,
            expiresAt: expiresAt ? expiresAt.toISOString() : null,
          },
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
      });
    },

    async unsuspendUser(db, actor, input, ipAddress) {
      await assertModerationScope(db, actor, input.courseId);
      return withWriteTransaction(db, async (trx) => {
        const affectedRows = await moderationRepo.deactivateSuspension(
          trx,
          input.userId,
          input.courseId,
        );

        if (affectedRows === 0) {
          return {
            message: "User has no active participation suspension.",
          };
        }

        const academyId = await resolveAcademyId(trx);
        await moderationRepo.createAuditLog(trx, {
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

        // Notify unsuspended user
        await outbox.publish(trx, {
          type: "moderation.user_unsuspended",
          version: 1,
          dedupeKey: `moderation.user_unsuspended:${input.userId}:${input.courseId || "platform"}`,
          occurredAt: new Date(),
          payload: {
            recipientUserId: input.userId,
            reason: input.reason || null,
          },
        });

        return { message: "User participation suspension has been lifted." };
      });
    },

    async listAuditLogs(db, actor, query, scope) {
      await assertModerationScope(
        db,
        actor,
        scope === "course" ? query.courseId : null,
      );
      const academyId = await resolveAcademyId(db);
      const pageCursor = decodeDiscussionCursor(query.cursor);
      const rows = await moderationRepo.listAuditLogs(db, academyId, {
        ...query,
        pageCursor,
      });
      const { page, hasMore } = takePage(rows, query.limit);
      const logs: LearningAuditLog[] = page.map((r) => ({
        id: r.id,
        academyId: r.academyId,
        courseId: r.courseId ?? null,
        actorUserId: r.actorUserId ?? null,
        actor: r.actorUserId
          ? {
              id: r.actorUserId,
              displayName: r.actorName || "Staff Member",
              username:
                (r.actorUsername || r.actorEmail || "staff").split("@")[0] ||
                "staff",
              avatarUrl: null,
              role: mapAuthorRole(r.authorRole),
            }
          : undefined,
        action: r.action,
        targetType: r.targetType,
        targetId: r.targetId,
        details:
          typeof r.details === "string"
            ? parseAuditLogDetails(r.details)
            : (r.details as Record<string, unknown> | null),
        ipAddress: r.ipAddress ?? null,
        createdAt:
          r.createdAt instanceof Date
            ? r.createdAt.toISOString()
            : String(r.createdAt),
      }));

      const last = page.at(-1);
      return {
        logs,
        nextCursor:
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.id,
                createdAt: toDate(last.createdAt),
              })
            : null,
      };
    },
  };
}
