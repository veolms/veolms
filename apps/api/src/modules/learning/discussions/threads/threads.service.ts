import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningThreadRequest,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { extractPlainText } from "../shared/discussion.utils.ts";
import type { ThreadsRepository } from "./threads.repository.ts";

export interface ThreadsService {
  createThread(
    db: DatabaseExecutor,
    input: {
      userId: string;
      courseId: string;
      lessonId?: string | null;
      assignmentId?: string | null;
      kind: CreateLearningThreadRequest["kind"];
      title?: string;
      content: string;
      timestampSeconds?: number | null;
      visibility?: CreateLearningThreadRequest["visibility"];
      attachmentIds?: string[];
    },
  ): Promise<LearningThread>;

  getThread(
    db: DatabaseExecutor,
    threadId: string,
    currentUserId?: string,
  ): Promise<LearningThread>;

  listThreads(
    db: DatabaseExecutor,
    query: ListLearningThreadsQuery & {
      currentUserId?: string;
    },
  ): Promise<LearningThreadsListResponse>;

  updateThread(
    db: DatabaseExecutor,
    threadId: string,
    userId: string,
    updates: UpdateLearningThreadRequest,
  ): Promise<LearningThread>;

  deleteThread(
    db: DatabaseExecutor,
    threadId: string,
    userId: string,
    isModerator?: boolean,
  ): Promise<void>;
}

export function createThreadsService(
  threadsRepo: ThreadsRepository,
): ThreadsService {
  async function resolveAcademyId(db: DatabaseExecutor): Promise<string> {
    const academy = await db.selectFrom("academy").select("id").executeTakeFirst();
    return academy?.id || "00000000-0000-0000-0000-000000000000";
  }

  function mapThreadRow(row: any, currentUserId?: string, attachments: any[] = []): LearningThread {
    const isOwn = currentUserId ? row.userId === currentUserId : false;

    return {
      id: row.id,
      academyId: row.academyId,
      courseId: row.courseId,
      lessonId: row.lessonId ?? null,
      assignmentId: row.assignmentId ?? null,
      userId: row.userId,
      author: {
        id: row.userId,
        displayName: row.authorName || "Anonymous Learner",
        username: (row.authorEmail || "user").split("@")[0],
        avatarUrl: `/assets/${row.userId.charCodeAt(0) % 2 === 0 ? "sofia" : "ethan"}-avatar-160.webp`,
        role: "Student",
      },
      kind: row.kind,
      title: row.title ?? null,
      content: row.content,
      plainText: row.plainText,
      timestampSeconds: row.timestampSeconds ?? null,
      visibility: row.visibility,
      status: row.status,
      isLocked: Boolean(row.isLocked),
      acceptedAnswerId: row.acceptedAnswerId ?? null,
      likesCount: Number(row.likesCount || 0),
      repliesCount: Number(row.repliesCount || 0),
      attachments: attachments.map((a) => ({
        id: a.id,
        kind: a.kind,
        fileName: a.file_name,
        fileUrl: a.file_url,
        mimeType: a.mime_type,
        fileSize: Number(a.file_size || 0),
        metadata: a.metadata ? JSON.parse(a.metadata) : null,
      })),
      isLiked: false,
      isBookmarked: false,
      isFollowing: false,
      isOwn,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
      updatedAt:
        row.updatedAt instanceof Date
          ? row.updatedAt.toISOString()
          : String(row.updatedAt),
    };
  }

  return {
    async createThread(db, input) {
      const academyId = await resolveAcademyId(db);

      // Validate course exists
      const course = await db
        .selectFrom("courses")
        .selectAll()
        .where("id", "=", input.courseId)
        .executeTakeFirst();

      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      // Validate lesson or assignment hierarchy
      if (input.lessonId) {
        const lesson = await db
          .selectFrom("course_lessons")
          .selectAll()
          .where("id", "=", input.lessonId)
          .executeTakeFirst();

        if (!lesson || lesson.course_id !== input.courseId) {
          throw httpError(400, "INVALID_LESSON", "Lesson does not belong to this course");
        }
      }

      // Check suspension with scope
      const threadKind = input.kind || "comment";
      const requiredScopes: ("commenting" | "qa" | "all")[] =
        threadKind === "comment" ? ["commenting", "all"] : ["qa", "all"];

      const activeSuspension = await db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", input.userId)
        .where("is_active", "=", true)
        .where("scope", "in", requiredScopes)
        .where((eb) =>
          eb.or([
            eb("course_id", "is", null),
            eb("course_id", "=", input.courseId),
          ]),
        )
        .where((eb) =>
          eb.or([
            eb("expires_at", "is", null),
            eb("expires_at", ">", new Date()),
          ]),
        )
        .executeTakeFirst();

      if (activeSuspension) {
        throw httpError(
          403,
          "PARTICIPATION_SUSPENDED",
          `Your participation for ${activeSuspension.scope} is suspended. Reason: ${activeSuspension.reason}`,
        );
      }

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

      await threadsRepo.createThread(db, {
        id,
        academyId,
        courseId: input.courseId,
        lessonId: input.lessonId || null,
        assignmentId: input.assignmentId || null,
        userId: input.userId,
        kind: threadKind,
        title: input.title || null,
        content: input.content,
        plainText,
        timestampSeconds: input.timestampSeconds ?? null,
        visibility: input.visibility || "public",
      });

      // Attach any verified attachments owned by the caller
      if (input.attachmentIds && input.attachmentIds.length > 0) {
        for (const attachmentId of input.attachmentIds) {
          const attachment = await db
            .selectFrom("learning_attachments")
            .selectAll()
            .where("id", "=", attachmentId)
            .executeTakeFirst();

          if (attachment && attachment.owner_id === input.userId && attachment.status === "ready") {
            await db
              .updateTable("learning_attachments")
              .set({
                target_type: "thread",
                target_id: id,
              })
              .where("id", "=", attachmentId)
              .execute();
          }
        }
      }

      const created = await threadsRepo.findThreadById(db, id);
      if (!created) {
        throw httpError(500, "CREATE_FAILED", "Failed to load created thread");
      }

      const attachments = await db
        .selectFrom("learning_attachments")
        .selectAll()
        .where("target_type", "=", "thread")
        .where("target_id", "=", id)
        .execute();

      return mapThreadRow(created, input.userId, attachments);
    },

    async getThread(db, threadId, currentUserId) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      const attachments = await db
        .selectFrom("learning_attachments")
        .selectAll()
        .where("target_type", "=", "thread")
        .where("target_id", "=", threadId)
        .execute();

      return mapThreadRow(row, currentUserId, attachments);
    },

    async listThreads(db, query) {
      const academyId = await resolveAcademyId(db);
      const rows = await threadsRepo.listThreads(db, { ...query, academyId });
      const threads = rows.map((row) => mapThreadRow(row, query.currentUserId));

      return {
        threads,
        nextCursor: null,
        totalCount: threads.length,
      };
    },

    async updateThread(db, threadId, userId, updates) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (row.userId !== userId) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You are not allowed to update this discussion thread",
        );
      }

      if (row.isLocked) {
        throw httpError(
          400,
          "THREAD_LOCKED",
          "This discussion thread is locked and cannot be edited",
        );
      }

      const plainText = updates.content ? extractPlainText(updates.content) : undefined;
      await threadsRepo.updateThread(db, threadId, {
        ...updates,
        ...(plainText ? { plainText } : {}),
      });

      const updated = await threadsRepo.findThreadById(db, threadId);
      return mapThreadRow(updated, userId);
    },

    async deleteThread(db, threadId, userId, isModerator = false) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (row.userId !== userId && !isModerator) {
        throw httpError(
          403,
          "FORBIDDEN",
          "You are not allowed to delete this discussion thread",
        );
      }

      await threadsRepo.softDeleteThread(db, threadId);
    },
  };
}
