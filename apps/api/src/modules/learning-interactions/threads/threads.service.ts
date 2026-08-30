import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningThreadRequest,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningThreadsQuery,
  UpdateLearningThreadRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { ThreadsRepository } from "./threads.repository.ts";

export interface ThreadsService {
  createThread(
    db: DatabaseExecutor,
    input: {
      userId: string;
      courseId: string;
      lessonId: string;
      kind: CreateLearningThreadRequest["kind"];
      title?: string;
      content: string;
      plainText?: string;
      timestampSeconds?: number | null;
      visibility?: CreateLearningThreadRequest["visibility"];
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

  function mapThreadRow(row: any, currentUserId?: string): LearningThread {
    const isOwn = currentUserId ? row.userId === currentUserId : false;

    return {
      id: row.id,
      academyId: row.academyId,
      courseId: row.courseId,
      lessonId: row.lessonId,
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
      // Check if user is suspended
      const activeSuspension = await db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", input.userId)
        .where("is_active", "=", true)
        .executeTakeFirst();

      if (activeSuspension) {
        if (!activeSuspension.expires_at || activeSuspension.expires_at > new Date()) {
          throw httpError(
            403,
            "PARTICIPATION_SUSPENDED",
            `Your participation in discussions is suspended. Reason: ${activeSuspension.reason}`,
          );
        }
      }

      const academyId = await resolveAcademyId(db);
      const id = crypto.randomUUID();
      const plainText = input.plainText || input.content.replace(/<[^>]+>/g, "").trim();

      await threadsRepo.createThread(db, {
        id,
        academyId,
        courseId: input.courseId,
        lessonId: input.lessonId,
        userId: input.userId,
        kind: input.kind || "comment",
        title: input.title || null,
        content: input.content,
        plainText,
        timestampSeconds: input.timestampSeconds ?? null,
        visibility: input.visibility || "public",
      });

      const created = await threadsRepo.findThreadById(db, id);
      if (!created) {
        throw httpError(500, "CREATE_FAILED", "Failed to load created thread");
      }

      return mapThreadRow(created, input.userId);
    },

    async getThread(db, threadId, currentUserId) {
      const row = await threadsRepo.findThreadById(db, threadId);
      if (!row) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      return mapThreadRow(row, currentUserId);
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

      await threadsRepo.updateThread(db, threadId, updates);
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
