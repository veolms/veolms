import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  CreateLearningReplyRequest,
  LearningRepliesListResponse,
  LearningReply,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { RepliesRepository } from "./replies.repository.ts";

export interface RepliesService {
  createReply(
    db: DatabaseExecutor,
    input: {
      threadId: string;
      userId: string;
      content: string;
      plainText?: string;
      parentReplyId?: string | null;
      timestampSeconds?: number | null;
    },
  ): Promise<LearningReply>;

  listReplies(
    db: DatabaseExecutor,
    threadId: string,
    query: ListLearningRepliesQuery,
    currentUserId?: string,
  ): Promise<LearningRepliesListResponse>;

  updateReply(
    db: DatabaseExecutor,
    replyId: string,
    userId: string,
    updates: UpdateLearningReplyRequest,
  ): Promise<LearningReply>;

  deleteReply(
    db: DatabaseExecutor,
    replyId: string,
    userId: string,
    isModerator?: boolean,
  ): Promise<void>;

  acceptAnswer(
    db: DatabaseExecutor,
    threadId: string,
    replyId: string | null,
    userId: string,
    isModerator?: boolean,
  ): Promise<{ acceptedAnswerId: string | null }>;
}

export function createRepliesService({
  threadsRepo,
  repliesRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
}): RepliesService {
  function mapReplyRow(row: any, currentUserId?: string): LearningReply {
    const isOwn = currentUserId ? row.userId === currentUserId : false;
    const authorRole =
      row.authorRole === "admin"
        ? "Admin"
        : row.authorRole === "instructor" || row.authorRole === "creator"
          ? "Instructor"
          : "Student";

    return {
      id: row.id,
      threadId: row.threadId,
      parentReplyId: row.parentReplyId ?? null,
      userId: row.userId,
      author: {
        id: row.userId,
        displayName: row.authorName || "Anonymous Learner",
        username: (row.authorEmail || "user").split("@")[0],
        avatarUrl: `/assets/${row.userId.charCodeAt(0) % 2 === 0 ? "sofia" : "ethan"}-avatar-160.webp`,
        role: authorRole,
      },
      content: row.content,
      plainText: row.plainText,
      timestampSeconds: row.timestampSeconds ?? null,
      isAccepted: Boolean(row.isAccepted),
      status: row.status,
      likesCount: Number(row.likesCount || 0),
      isLiked: false,
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
    async createReply(db, input) {
      // Check if thread exists and is not locked
      const thread = await threadsRepo.findThreadById(db, input.threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (thread.isLocked) {
        throw httpError(
          400,
          "THREAD_LOCKED",
          "This discussion thread is locked. No new replies can be added.",
        );
      }

      // Check user suspension
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
            `Your participation is suspended. Reason: ${activeSuspension.reason}`,
          );
        }
      }

      const id = crypto.randomUUID();
      const plainText =
        input.plainText || input.content.replace(/<[^>]+>/g, "").trim();

      await repliesRepo.createReply(db, {
        id,
        threadId: input.threadId,
        parentReplyId: input.parentReplyId || null,
        userId: input.userId,
        content: input.content,
        plainText,
        timestampSeconds: input.timestampSeconds ?? null,
      });

      await threadsRepo.incrementRepliesCount(db, input.threadId, 1);

      const created = await repliesRepo.findReplyById(db, id);
      return mapReplyRow(created, input.userId);
    },

    async listReplies(db, threadId, query, currentUserId) {
      const rows = await repliesRepo.listRepliesByThreadId(db, threadId, query);
      const replies = rows.map((r) => mapReplyRow(r, currentUserId));

      return {
        replies,
        nextCursor: null,
        totalCount: replies.length,
      };
    },

    async updateReply(db, replyId, userId, updates) {
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
      }

      if (reply.userId !== userId) {
        throw httpError(403, "FORBIDDEN", "You are not allowed to update this reply");
      }

      await repliesRepo.updateReply(db, replyId, updates);
      const updated = await repliesRepo.findReplyById(db, replyId);
      return mapReplyRow(updated, userId);
    },

    async deleteReply(db, replyId, userId, isModerator = false) {
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
      }

      if (reply.userId !== userId && !isModerator) {
        throw httpError(403, "FORBIDDEN", "You are not allowed to delete this reply");
      }

      await repliesRepo.softDeleteReply(db, replyId);
      await threadsRepo.incrementRepliesCount(db, reply.threadId, -1);
    },

    async acceptAnswer(db, threadId, replyId, userId, isModerator = false) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (thread.kind !== "question") {
        throw httpError(400, "NOT_A_QUESTION", "Only Q&A questions can have accepted answers");
      }

      if (thread.userId !== userId && !isModerator) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Only the question author or an instructor/moderator can mark an answer as accepted",
        );
      }

      if (replyId) {
        const reply = await repliesRepo.findReplyById(db, replyId);
        if (!reply || reply.threadId !== threadId) {
          throw httpError(400, "INVALID_REPLY", "The specified reply does not belong to this question");
        }

        // Unaccept previous answer if any
        if (thread.acceptedAnswerId && thread.acceptedAnswerId !== replyId) {
          await repliesRepo.setAcceptedStatus(db, thread.acceptedAnswerId, false);
        }

        await repliesRepo.setAcceptedStatus(db, replyId, true);
        await threadsRepo.setAcceptedAnswer(db, threadId, replyId);
        return { acceptedAnswerId: replyId };
      } else {
        // Clear accepted answer
        if (thread.acceptedAnswerId) {
          await repliesRepo.setAcceptedStatus(db, thread.acceptedAnswerId, false);
        }
        await threadsRepo.setAcceptedAnswer(db, threadId, null);
        return { acceptedAnswerId: null };
      }
    },
  };
}
