import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AcceptReplyResponse,
  CreateLearningReplyRequest,
  LearningRepliesListResponse,
  LearningReply,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import { extractPlainText } from "../shared/text-sanitizer.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { RepliesRepository } from "./replies.repository.ts";

export interface RepliesService {
  createReply(
    db: DatabaseExecutor,
    input: {
      threadId: string;
      userId: string;
      content: string;
      parentReplyId?: string | null;
      timestampSeconds?: number | null;
      attachmentIds?: string[];
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

  acceptReply(
    db: DatabaseExecutor,
    replyId: string,
    accepted: boolean,
    userId: string,
    isModerator?: boolean,
  ): Promise<AcceptReplyResponse>;
}

export function createRepliesService({
  threadsRepo,
  repliesRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
}): RepliesService {
  function mapReplyRow(row: any, currentUserId?: string, attachments: any[] = []): LearningReply {
    const isOwn = currentUserId ? row.userId === currentUserId : false;

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
        role: "Student",
      },
      content: row.content,
      plainText: row.plainText,
      timestampSeconds: row.timestampSeconds ?? null,
      isAccepted: Boolean(row.isAccepted),
      status: row.status,
      likesCount: Number(row.likesCount || 0),
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
      // 1. Check thread existence & lock status
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

      // 2. Enforce 1-level reply nesting
      if (input.parentReplyId) {
        const parent = await repliesRepo.findReplyById(db, input.parentReplyId);
        if (!parent || parent.threadId !== input.threadId) {
          throw httpError(400, "INVALID_PARENT_REPLY", "Parent reply does not belong to this thread");
        }

        if (parent.parentReplyId !== null) {
          throw httpError(
            400,
            "MAX_NESTING_EXCEEDED",
            "Nested replies are limited to 1 level. Reply directly to the root comment or answer.",
          );
        }
      }

      // 3. Check suspension with scope
      const requiredScopes: ("commenting" | "qa" | "all")[] =
        thread.kind === "comment" ? ["commenting", "all"] : ["qa", "all"];
      const activeSuspension = await db
        .selectFrom("learning_suspensions")
        .selectAll()
        .where("user_id", "=", input.userId)
        .where("is_active", "=", true)
        .where("scope", "in", requiredScopes)
        .where((eb) =>
          eb.or([
            eb("course_id", "is", null),
            eb("course_id", "=", thread.courseId),
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
          `Your participation is suspended. Reason: ${activeSuspension.reason}`,
        );
      }

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

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
                target_type: "reply",
                target_id: id,
              })
              .where("id", "=", attachmentId)
              .execute();
          }
        }
      }

      const created = await repliesRepo.findReplyById(db, id);
      const attachments = await db
        .selectFrom("learning_attachments")
        .selectAll()
        .where("target_type", "=", "reply")
        .where("target_id", "=", id)
        .execute();

      return mapReplyRow(created, input.userId, attachments);
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

      const plainText = updates.content ? extractPlainText(updates.content) : undefined;
      await repliesRepo.updateReply(db, replyId, {
        ...updates,
        ...(plainText ? { plainText } : {}),
      });

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

    async acceptReply(db, replyId, accepted, userId, isModerator = false) {
      const reply = await repliesRepo.findReplyById(db, replyId);
      if (!reply) {
        throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
      }

      const thread = await threadsRepo.findThreadById(db, reply.threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (thread.kind !== "question") {
        throw httpError(400, "NOT_A_QUESTION", "Only Q&A questions can have accepted answers");
      }

      // Enforce: reply belongs to this exact thread
      if (reply.threadId !== thread.id) {
        throw httpError(400, "INVALID_REPLY", "The answer does not belong to this question thread");
      }

      if (thread.userId !== userId && !isModerator) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Only the question author or an instructor/moderator can mark an answer as accepted",
        );
      }

      if (accepted) {
        if (thread.acceptedAnswerId && thread.acceptedAnswerId !== replyId) {
          await repliesRepo.setAcceptedStatus(db, thread.acceptedAnswerId, false);
        }

        await repliesRepo.setAcceptedStatus(db, replyId, true);
        await threadsRepo.setAcceptedAnswer(db, thread.id, replyId);

        return {
          replyId,
          threadId: thread.id,
          isAccepted: true,
          acceptedAnswerId: replyId,
        };
      } else {
        await repliesRepo.setAcceptedStatus(db, replyId, false);
        if (thread.acceptedAnswerId === replyId) {
          await threadsRepo.setAcceptedAnswer(db, thread.id, null);
        }

        return {
          replyId,
          threadId: thread.id,
          isAccepted: false,
          acceptedAnswerId: null,
        };
      }
    },
  };
}
