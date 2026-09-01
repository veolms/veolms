import crypto from "node:crypto";
import type { DatabaseExecutor } from "@veolms/database";
import type {
  AcceptReplyResponse,
  LearningRepliesListResponse,
  LearningReply,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import {
  createDiscussionOutbox,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  extractPlainText,
  mapAuthorRole,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { RepliesRepository } from "./replies.repository.ts";

export interface RepliesService {
  createReply(
    db: DatabaseExecutor,
    input: {
      threadId: string;
      userId: string;
      roles: readonly string[];
      content: string;
      parentReplyId?: string | null;
      replyToReplyId?: string | null;
      timestampSeconds?: number | null;
      attachmentIds?: string[];
    },
  ): Promise<LearningReply>;

  listReplies(
    db: DatabaseExecutor,
    threadId: string,
    query: ListLearningRepliesQuery,
    actor: DiscussionActor,
  ): Promise<LearningRepliesListResponse>;

  updateReply(
    db: DatabaseExecutor,
    replyId: string,
    actor: DiscussionActor,
    updates: UpdateLearningReplyRequest,
  ): Promise<LearningReply>;

  deleteReply(
    db: DatabaseExecutor,
    replyId: string,
    actor: DiscussionActor,
  ): Promise<void>;

  acceptReply(
    db: DatabaseExecutor,
    replyId: string,
    accepted: boolean,
    actor: DiscussionActor,
  ): Promise<AcceptReplyResponse>;
}

export function createRepliesService({
  threadsRepo,
  repliesRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
}): RepliesService {
  const outbox = createDiscussionOutbox();
  const courseAccess = createDiscussionAccess();

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
            textSnippet: row.replyToContent
              ? row.replyToContent.slice(0, 120)
              : undefined,
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
        username: (row.authorUsername || row.authorEmail || "user").split(
          "@",
        )[0],
        avatarUrl: null,
        role: mapAuthorRole(row.authorRole),
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
        metadata: a.metadata
          ? typeof a.metadata === "string"
            ? JSON.parse(a.metadata)
            : a.metadata
          : null,
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
      return withWriteTransaction(db, async (trx) => {
        // 1. Check thread existence & lock status
        const thread = await threadsRepo.findThreadById(trx, input.threadId);
        if (!thread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }

        await courseAccess.assertCanAccessThread(
          trx,
          {
            userId: input.userId,
            roles: input.roles,
          },
          thread,
        );
        courseAccess.assertThreadIsActive(thread);
        courseAccess.assertThreadNotLocked(thread);
        await courseAccess.assertNotSuspended(
          trx,
          input.userId,
          thread.courseId,
          thread.kind,
        );

        // Resolve reply-to from the parent reply only — never from client user ids
        let targetReplyId = input.replyToReplyId || input.parentReplyId || null;
        let targetUserId: string | null = null;

        if (targetReplyId) {
          const targetReply = await repliesRepo.findReplyById(
            trx,
            targetReplyId,
          );
          if (!targetReply || targetReply.threadId !== input.threadId) {
            throw httpError(
              400,
              "INVALID_PARENT_REPLY",
              "Referenced reply does not belong to this thread",
            );
          }
          courseAccess.assertReplyIsActive(targetReply);
          targetUserId = targetReply.userId;
        }

        const id = crypto.randomUUID();
        const plainText = extractPlainText(input.content);

        await repliesRepo.createReply(trx, {
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

        await threadsRepo.incrementRepliesCount(trx, input.threadId, 1);

        await syncMentionsAndNotify(trx, outbox, {
          sourceType: "reply",
          sourceId: id,
          actorUserId: input.userId,
          content: input.content,
          extraUserIds: targetUserId ? [targetUserId] : [],
          courseId: thread.courseId,
          threadId: input.threadId,
          plainText,
        });

        // Attach any verified attachments owned by the caller
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          for (const attachmentId of input.attachmentIds) {
            const attachment = await trx
              .selectFrom("learning_attachments")
              .selectAll()
              .where("id", "=", attachmentId)
              .executeTakeFirst();

            if (
              attachment &&
              attachment.owner_id === input.userId &&
              attachment.status === "ready"
            ) {
              await trx
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

        const created = await repliesRepo.findReplyById(trx, id);
        const attachments = await trx
          .selectFrom("learning_attachments")
          .selectAll()
          .where("target_type", "=", "reply")
          .where("target_id", "=", id)
          .execute();

        return mapReplyRow(created, input.userId, attachments);
      });
    },

    async listReplies(db, threadId, query, actor) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      await courseAccess.assertCanAccessThread(db, actor, thread);

      const pageCursor = decodeDiscussionCursor(query.cursor);
      const [rows, totalCount] = await Promise.all([
        repliesRepo.listRepliesByThreadId(db, threadId, {
          ...query,
          pageCursor,
        }),
        repliesRepo.countRepliesByThreadId(db, threadId),
      ]);
      const { page, hasMore } = takePage(rows, query.limit);

      let likedReplyIds = new Set<string>();
      if (page.length > 0) {
        const replyIds = page.map((r) => r.id);
        const likes = await db
          .selectFrom("learning_likes")
          .select("target_id")
          .where("user_id", "=", actor.userId)
          .where("target_type", "=", "reply")
          .where("target_id", "in", replyIds)
          .execute();

        likedReplyIds = new Set(likes.map((l) => l.target_id));
      }

      const replies = page.map((r) =>
        mapReplyRow(r, actor.userId, [], likedReplyIds),
      );

      const last = page.at(-1);
      return {
        replies,
        nextCursor:
          hasMore && last
            ? encodeDiscussionCursor({
                id: last.id,
                createdAt: toDate(last.createdAt),
                isAccepted: Boolean(last.isAccepted),
              })
            : null,
        totalCount,
      };
    },

    async updateReply(db, replyId, actor, updates) {
      return withWriteTransaction(db, async (trx) => {
        const reply = await repliesRepo.findReplyById(trx, replyId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }

        const thread = await threadsRepo.findThreadById(trx, reply.threadId);
        if (!thread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
        await courseAccess.assertCanAccessThread(trx, actor, thread);
        courseAccess.assertThreadIsActive(thread);
        courseAccess.assertReplyIsActive(reply);

        if (reply.userId !== actor.userId) {
          throw httpError(
            403,
            "FORBIDDEN",
            "You are not allowed to update this reply",
          );
        }

        courseAccess.assertThreadNotLocked(thread);
        await courseAccess.assertNotSuspended(
          trx,
          actor.userId,
          thread.courseId,
          thread.kind,
        );

        const plainText = updates.content
          ? extractPlainText(updates.content)
          : undefined;
        await repliesRepo.updateReply(trx, replyId, {
          ...updates,
          ...(plainText ? { plainText } : {}),
        });

        if (updates.content) {
          await syncMentionsAndNotify(trx, outbox, {
            sourceType: "reply",
            sourceId: replyId,
            actorUserId: actor.userId,
            content: updates.content,
            extraUserIds: reply.replyToUserId ? [reply.replyToUserId] : [],
            courseId: thread.courseId,
            threadId: reply.threadId,
            plainText,
          });
        }

        const updated = await repliesRepo.findReplyById(trx, replyId);
        return mapReplyRow(updated, actor.userId);
      });
    },

    async deleteReply(db, replyId, actor) {
      return withWriteTransaction(db, async (trx) => {
        const reply = await repliesRepo.findReplyById(trx, replyId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }

        const thread = await threadsRepo.findThreadById(trx, reply.threadId);
        if (!thread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
        await courseAccess.assertCanAccessThread(trx, actor, thread);
        courseAccess.assertThreadIsActive(thread);
        courseAccess.assertReplyIsActive(reply);

        const canStaffModerate = await courseAccess.canModerateCourse(
          trx,
          actor,
          thread.courseId,
        );
        if (reply.userId !== actor.userId && !canStaffModerate) {
          throw httpError(
            403,
            "FORBIDDEN",
            "You are not allowed to delete this reply",
          );
        }

        const deleted = await repliesRepo.deleteReply(trx, replyId);
        if (!deleted) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }

        await threadsRepo.incrementRepliesCount(trx, reply.threadId, -1);

        if (reply.isAccepted || thread.acceptedAnswerId === replyId) {
          await repliesRepo.setAcceptedStatus(trx, replyId, false);
          await threadsRepo.setAcceptedAnswer(trx, reply.threadId, null);
        }
      });
    },

    async acceptReply(db, replyId, accepted, actor) {
      return withWriteTransaction(db, async (trx) => {
        const reply = await repliesRepo.findReplyById(trx, replyId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }

        const thread = await threadsRepo.findThreadById(trx, reply.threadId);
        if (!thread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
        await courseAccess.assertCanAccessThread(trx, actor, thread);
        courseAccess.assertThreadIsActive(thread);
        courseAccess.assertReplyIsActive(reply);
        await courseAccess.assertNotSuspended(
          trx,
          actor.userId,
          thread.courseId,
          thread.kind,
        );

        if (thread.kind !== "question") {
          throw httpError(
            400,
            "NOT_A_QUESTION",
            "Only Q&A questions can have accepted answers",
          );
        }

        if (reply.threadId !== thread.id) {
          throw httpError(
            400,
            "INVALID_REPLY",
            "The answer does not belong to this question thread",
          );
        }

        const canStaffModerate = await courseAccess.canModerateCourse(
          trx,
          actor,
          thread.courseId,
        );
        if (thread.userId !== actor.userId && !canStaffModerate) {
          throw httpError(
            403,
            "FORBIDDEN",
            "Only the question author or a course owner/administrator can mark an answer as accepted",
          );
        }

        if (accepted) {
          if (thread.acceptedAnswerId && thread.acceptedAnswerId !== replyId) {
            await repliesRepo.setAcceptedStatus(
              trx,
              thread.acceptedAnswerId,
              false,
            );
          }

          await repliesRepo.setAcceptedStatus(trx, replyId, true);
          await threadsRepo.setAcceptedAnswer(trx, thread.id, replyId);

          return {
            replyId,
            threadId: thread.id,
            isAccepted: true,
            acceptedAnswerId: replyId,
          };
        }

        await repliesRepo.setAcceptedStatus(trx, replyId, false);
        if (thread.acceptedAnswerId === replyId) {
          await threadsRepo.setAcceptedAnswer(trx, thread.id, null);
        }

        return {
          replyId,
          threadId: thread.id,
          isAccepted: false,
          acceptedAnswerId: null,
        };
      });
    },
  };
}
