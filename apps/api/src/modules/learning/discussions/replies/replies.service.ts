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
import { httpError } from "../../../../lib/errors.ts";
import { extractPlainText } from "../shared/discussion.utils.ts";
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
      replyToReplyId?: string | null;
      replyToUserId?: string | null;
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
  function mapReplyRow(
    row: any,
    currentUserId?: string,
    attachments: any[] = [],
    likedReplyIds?: Set<string>,
  ): LearningReply {
    const isOwn = currentUserId ? row.userId === currentUserId : false;
    const isLiked = likedReplyIds ? likedReplyIds.has(row.id) : false;

    const repliedTo =
      row.replyToReplyId || row.replyToUserId
        ? {
            id: row.replyToReplyId || row.parentReplyId || row.id,
            userId: row.replyToUserId || row.userId,
            username: (row.replyToUsername || "user").split("@")[0],
            displayName: row.replyToDisplayName || "Learner",
            textSnippet: row.replyToContent ? row.replyToContent.slice(0, 120) : undefined,
          }
        : null;

    return {
      id: row.id,
      threadId: row.threadId,
      parentReplyId: row.parentReplyId ?? null,
      replyToReplyId: row.replyToReplyId ?? null,
      replyToUserId: row.replyToUserId ?? null,
      repliedTo,
      userId: row.userId,
      author: {
        id: row.userId,
        displayName: row.authorName || "Anonymous Learner",
        username: (row.authorUsername || row.authorEmail || "user").split("@")[0],
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
        metadata: a.metadata ? (typeof a.metadata === "string" ? JSON.parse(a.metadata) : a.metadata) : null,
      })),
      isLiked,
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

      // 2. Resolve replyTo target for quoting / flat hierarchy
      let targetReplyId = input.replyToReplyId || input.parentReplyId || null;
      let targetUserId = input.replyToUserId || null;

      if (targetReplyId) {
        const targetReply = await repliesRepo.findReplyById(db, targetReplyId);
        if (!targetReply || targetReply.threadId !== input.threadId) {
          throw httpError(400, "INVALID_PARENT_REPLY", "Referenced reply does not belong to this thread");
        }
        if (!targetUserId) {
          targetUserId = targetReply.userId;
        }
      }

      // 3. Check suspension with scope (skip for notes)
      if (thread.kind !== "note") {
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
      }

      const id = crypto.randomUUID();
      const plainText = extractPlainText(input.content);

      await repliesRepo.createReply(db, {
        id,
        threadId: input.threadId,
        parentReplyId: input.parentReplyId || null,
        replyToReplyId: targetReplyId,
        replyToUserId: targetUserId,
        userId: input.userId,
        content: input.content,
        plainText,
        timestampSeconds: input.timestampSeconds ?? null,
      });

      await threadsRepo.incrementRepliesCount(db, input.threadId, 1);

      // Extract @mentions from content and save to learning_mentions
      const mentionMatches = input.content.match(/@([a-zA-Z0-9_-]+)/g);
      if (mentionMatches && mentionMatches.length > 0) {
        const usernames = [...new Set(mentionMatches.map((m) => m.slice(1).toLowerCase()))];
        for (const u of usernames) {
          const user = await db
            .selectFrom("users")
            .select("id")
            .where(db.fn("lower", ["username"]), "=", u)
            .executeTakeFirst();

          if (user && user.id !== input.userId) {
            await db
              .insertInto("learning_mentions")
              .values({
                id: crypto.randomUUID(),
                source_type: "reply",
                source_id: id,
                mentioned_user_id: user.id,
              })
              .onConflict((oc) => oc.columns(["source_type", "source_id", "mentioned_user_id"]).doNothing())
              .execute();
          }
        }
      }

      // If replying to someone specifically, ensure they are also recorded in mentions if not already
      if (targetUserId && targetUserId !== input.userId) {
        await db
          .insertInto("learning_mentions")
          .values({
            id: crypto.randomUUID(),
            source_type: "reply",
            source_id: id,
            mentioned_user_id: targetUserId,
          })
          .onConflict((oc) => oc.columns(["source_type", "source_id", "mentioned_user_id"]).doNothing())
          .execute();
      }

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

      let likedReplyIds = new Set<string>();
      if (currentUserId && rows.length > 0) {
        const replyIds = rows.map((r) => r.id);
        const likes = await db
          .selectFrom("learning_likes")
          .select("target_id")
          .where("user_id", "=", currentUserId)
          .where("target_type", "=", "reply")
          .where("target_id", "in", replyIds)
          .execute();

        likedReplyIds = new Set(likes.map((l) => l.target_id));
      }

      const replies = rows.map((r) => mapReplyRow(r, currentUserId, [], likedReplyIds));

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
