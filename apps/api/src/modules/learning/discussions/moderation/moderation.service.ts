import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AuditLogsListResponse,
  CourseAuditLog,
  CourseAuditLogsListResponse,
  CourseLearningReport,
  CourseReportsListResponse,
  CreateReportRequest,
  LearningAuditLogDetails,
  ListAuditLogsQuery,
  ListReportsQuery,
  ModerateNoteRequest,
  ModerateReplyRequest,
  ModerateThreadRequest,
  ReportsListResponse,
  SuspendUserRequest,
  UnsuspendUserRequest,
  UpdateReportRequest,
  UserSuspension,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { createAccessService } from "../../../access/index.ts";
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
import {
  createNotesRepository,
  type NotesRepository,
} from "../notes/notes.repository.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type {
  AuditLogRowWithActor,
  ModerationRepository,
  ReportRow,
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

/**
 * Audit details are stored as free-form JSON. Only the keys the moderation
 * actions write are returned, and only when they hold text, so nothing else
 * that ends up in that column reaches a client.
 */
function presentAuditLogDetails(
  value: unknown,
): LearningAuditLogDetails | null {
  const source =
    typeof value === "string"
      ? parseAuditLogDetails(value)
      : value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : null;
  if (!source) return null;

  const details: LearningAuditLogDetails = {};
  for (const key of [
    "reason",
    "actionTaken",
    "courseId",
    "expiresAt",
  ] as const) {
    const entry = source[key];
    if (typeof entry === "string" || entry === null) details[key] = entry;
  }
  for (const key of ["reportId", "status", "scope"] as const) {
    const entry = source[key];
    if (typeof entry === "string") details[key] = entry;
  }
  return details;
}

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : String(value);
}

function presentReport(row: ReportRow): CourseLearningReport {
  return {
    id: row.id,
    targetType: row.targetType,
    targetId: row.targetId,
    courseId: row.courseId ?? null,
    reason: row.reason,
    details: row.details,
    status: row.status,
    reviewedByUserId: row.reviewedByUserId ?? null,
    actionTaken: row.actionTaken ?? null,
    createdAt: toIsoString(row.createdAt),
    updatedAt: toIsoString(row.updatedAt),
  };
}

function presentAuditLog(row: AuditLogRowWithActor): CourseAuditLog {
  return {
    id: row.id,
    courseId: row.courseId ?? null,
    actorUserId: row.actorUserId ?? null,
    actor: row.actorUserId
      ? {
          id: row.actorUserId,
          displayName: row.actorName || "Staff Member",
          username: row.actorUsername || "staff",
          avatarUrl: null,
          role: mapAuthorRole(row.authorRole),
        }
      : undefined,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    details: presentAuditLogDetails(row.details),
    createdAt: toIsoString(row.createdAt),
  };
}

function nextPageCursor(
  page: readonly { id: string; createdAt: Date | string }[],
  hasMore: boolean,
): string | null {
  const last = page.at(-1);
  return hasMore && last
    ? encodeDiscussionCursor({ id: last.id, createdAt: toDate(last.createdAt) })
    : null;
}

export interface ModerationService {
  createReport(
    db: DatabaseExecutor,
    reporter: DiscussionActor | string,
    input: CreateReportRequest,
  ): Promise<{ message: string }>;

  listReports(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    query: ListReportsQuery,
    scope: "course" | "platform",
  ): Promise<CourseReportsListResponse | ReportsListResponse>;

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

  moderateNote(
    db: DatabaseExecutor,
    noteId: string,
    actor: DiscussionActor,
    input: ModerateNoteRequest,
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
  ): Promise<CourseAuditLogsListResponse | AuditLogsListResponse>;
}

export function createModerationService({
  threadsRepo,
  repliesRepo,
  notesRepo = createNotesRepository(),
  moderationRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
  notesRepo?: NotesRepository;
  moderationRepo: ModerationRepository;
}): ModerationService {
  const courseAccess = createDiscussionAccess();
  const access = createAccessService();
  const outbox = createDiscussionOutbox();

  /**
   * A course moderator suspends that course's participants, nobody else.
   * The suspension notice carries the moderator's own words to the target by
   * in-app message and email, so without this any course owner could send
   * arbitrary text to any account, or lock an administrator out of a course.
   */
  async function assertCourseSuspensionTarget(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    userId: string,
    courseId: string,
  ): Promise<void> {
    if (userId === actor.userId) {
      throw httpError(403, "FORBIDDEN", "You cannot suspend yourself.");
    }

    const target = await moderationRepo.findSuspensionTarget(db, userId);
    // Any grant counts, active or not: someone whose access has lapsed can
    // still have posts in the course that need acting on.
    const grants = target ? await access.listUserGrants(db, userId) : [];
    if (!target || !grants.some((grant) => grant.courseId === courseId)) {
      throw httpError(
        403,
        "FORBIDDEN",
        "Only participants of this course can be suspended from it.",
      );
    }

    if (mapAuthorRole(target.authorRole) === "Admin") {
      throw httpError(
        403,
        "FORBIDDEN",
        "Administrators cannot be suspended from a course.",
      );
    }
  }

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

  /**
   * A report is accepted only for content the reporter can open. Without
   * this, any signed-in user could probe which thread and reply ids exist
   * and fill the report queue of a course they are not part of. Reported as
   * "not found" either way, so the check reveals nothing.
   */
  async function assertReporterCanSee(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    thread: Parameters<typeof courseAccess.assertCanAccessThread>[2],
    label: string,
  ): Promise<void> {
    try {
      await courseAccess.assertCanAccessThread(db, actor, thread);
    } catch {
      throw httpError(404, "TARGET_NOT_FOUND", `Reported ${label} not found`);
    }
  }

  return {
    async createReport(db, reporter, input) {
      const actor: DiscussionActor =
        typeof reporter === "string"
          ? { userId: reporter, roles: [] }
          : reporter;
      const reporterId = actor.userId;

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
        await assertReporterCanSee(db, actor, thread, "discussion thread");
        courseId = thread.courseId;
      } else if (input.targetType === "reply") {
        const reply = await repliesRepo.findReplyById(db, input.targetId);
        if (!reply) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported reply not found");
        }
        const thread = await threadsRepo.findThreadById(db, reply.threadId);
        if (!thread) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported reply not found");
        }
        await assertReporterCanSee(db, actor, thread, "reply");
        courseId = thread.courseId;
      } else if (input.targetType === "note") {
        const note = await notesRepo.findNoteAccessTarget(db, input.targetId);
        if (!note) {
          throw httpError(404, "TARGET_NOT_FOUND", "Reported note not found");
        }
        await courseAccess.assertCanAccessNote(
          db,
          actor,
          note,
          httpError(404, "TARGET_NOT_FOUND", "Reported note not found"),
        );
        courseId = note.courseId;
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
      const options = { ...query, pageCursor };

      if (scope === "platform") {
        const [rows, totalCount] = await Promise.all([
          moderationRepo.listReportsWithReporter(db, options),
          moderationRepo.countReports(db, query),
        ]);
        const { page, hasMore } = takePage(rows, query.limit);
        return {
          reports: page.map((row) => ({
            ...presentReport(row),
            reporterId: row.reporterId,
            reporter: {
              id: row.reporterId,
              displayName: row.reporterName || "Learner",
              username: row.reporterUsername || "user",
              avatarUrl: null,
              role: mapAuthorRole(row.authorRole),
            },
          })),
          nextCursor: nextPageCursor(page, hasMore),
          totalCount,
        };
      }

      // Course scope never reads the reporter: the course owner moderates
      // their own course and is often the person who was reported.
      const [rows, totalCount] = await Promise.all([
        moderationRepo.listReports(db, options),
        moderationRepo.countReports(db, query),
      ]);
      const { page, hasMore } = takePage(rows, query.limit);
      return {
        reports: page.map(presentReport),
        nextCursor: nextPageCursor(page, hasMore),
        totalCount,
      };
    },

    async updateReportStatus(db, reportId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      return withWriteTransaction(db, async (trx) => {
        const report = await trx
          .selectFrom("learning_reports")
          .select(["course_id", "target_type", "target_id", "reporter_id"])
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
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
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
          await threadsRepo.setLocked(trx, threadId, true, actor.userId);
        } else if (input.action === "unlock") {
          await threadsRepo.setLocked(trx, threadId, false, actor.userId);
        } else if (input.action === "delete") {
          await threadsRepo.deleteThread(trx, threadId);
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
          input.action === "hide" ||
          input.action === "lock" ||
          input.action === "delete"
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
          (input.action === "hide" ||
            input.action === "delete" ||
            input.action === "lock")
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

    async moderateNote(db, noteId, actor, input, courseId, ipAddress) {
      await assertModerationScope(db, actor, courseId);
      return withWriteTransaction(db, async (trx) => {
        const note = await notesRepo.findNoteAccessTarget(trx, noteId);
        // A private note is nobody's business but its author's: moderators
        // act on shared notes only, and cannot tell a private one exists.
        if (!note || note.visibility === "private") {
          throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
        }
        if (courseId && note.courseId !== courseId) {
          throw httpError(
            403,
            "FORBIDDEN",
            "Learning note does not belong to this course",
          );
        }

        await notesRepo.holdPrivate(trx, noteId);
        // Nobody else can open it now, so nobody stays mentioned in it.
        await trx
          .deleteFrom("learning_mentions")
          .where("source_type", "=", "note")
          .where("source_id", "=", noteId)
          .execute();

        const pendingReports = await trx
          .selectFrom("learning_reports")
          .select(["id", "reporter_id"])
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .where("status", "=", "pending")
          .execute();
        await trx
          .updateTable("learning_reports")
          .set({
            status: "actioned",
            reviewed_by_user_id: actor.userId,
            action_taken: input.action,
            updated_at: new Date(),
          })
          .where("target_type", "=", "note")
          .where("target_id", "=", noteId)
          .where("status", "=", "pending")
          .execute();

        const academyId = await resolveAcademyId(trx);
        await moderationRepo.createAuditLog(trx, {
          id: crypto.randomUUID(),
          academyId,
          courseId: note.courseId,
          actorUserId: actor.userId,
          action: `${input.action}_note`,
          targetType: "note",
          targetId: noteId,
          details: { reason: input.reason || null },
          ipAddress,
        });

        if (note.userId !== actor.userId) {
          await outbox.publish(trx, {
            type: "moderation.content_moderated",
            version: 1,
            dedupeKey: `moderation.content_moderated:note:${noteId}:${input.action}`,
            occurredAt: new Date(),
            payload: {
              recipientUserId: note.userId,
              contentType: "note",
              action: input.action,
              reason: input.reason || null,
            },
          });
        }

        for (const report of pendingReports) {
          if (report.reporter_id !== actor.userId) {
            await outbox.publish(trx, {
              type: "moderation.report_resolved",
              version: 1,
              dedupeKey: `moderation.report_resolved:${report.id}:actioned`,
              occurredAt: new Date(),
              payload: {
                recipientUserId: report.reporter_id,
                targetType: "note",
                status: "actioned",
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
        // Fails closed: a reply whose thread cannot be read is not shown to
        // belong to this course, so a course moderator may not act on it.
        if (courseId && (!thread || thread.courseId !== courseId)) {
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
      if (input.courseId) {
        await assertCourseSuspensionTarget(
          db,
          actor,
          input.userId,
          input.courseId,
        );
      }
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
      // Only the platform (administrator) trail carries network addresses.
      // A course owner reads entries written by administrators too, and has
      // no business with where those administrators connected from.
      const includeIpAddress = scope === "platform";
      const rows = await moderationRepo.listAuditLogs(db, academyId, {
        ...query,
        pageCursor,
        includeIpAddress,
      });
      const { page, hasMore } = takePage(rows, query.limit);
      const nextCursor = nextPageCursor(page, hasMore);

      if (includeIpAddress) {
        return {
          logs: page.map((row) => ({
            ...presentAuditLog(row),
            ipAddress: row.ipAddress ?? null,
          })),
          nextCursor,
        };
      }
      return { logs: page.map(presentAuditLog), nextCursor };
    },
  };
}
