import type { DatabaseExecutor } from "@veolms/database";
import type {
  AcceptReplyResponse,
  LearningRepliesListResponse,
  LearningReply,
  LearningReplyEditResponse,
  ListLearningRepliesQuery,
  UpdateLearningReplyRequest,
} from "@veolms/contracts";
import type { S3StorageService } from "@veolms/storage";
import { httpError } from "../../../../lib/errors.ts";
import { DiscussionErrors } from "../shared/discussion.errors.ts";
import {
  createDiscussionOutbox,
  resolveActorName,
  resolveDeepLink,
  syncMentionsAndNotify,
  withWriteTransaction,
} from "../shared/discussion.mentions.ts";
import {
  decodeDiscussionCursor,
  encodeDiscussionCursor,
  extractPlainText,
  takePage,
  toDate,
} from "../shared/discussion.utils.ts";
import {
  presentDiscussionAuthor,
  toIsoString,
} from "../shared/discussion.presenters.ts";
import {
  listReadyAttachments,
  presentDiscussionAttachment,
  type DiscussionAttachmentRow,
} from "../shared/discussion-attachments.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import {
  createLessonDiscussionAccess,
  type LessonDiscussionAccess,
} from "../shared/lesson-discussion-access.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type {
  RepliesRepository,
  ReplyRowWithAuthor,
} from "./replies.repository.ts";

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
    actor: DiscussionActor | null,
  ): Promise<LearningRepliesListResponse>;

  updateReply(
    db: DatabaseExecutor,
    replyId: string,
    actor: DiscussionActor,
    updates: UpdateLearningReplyRequest,
  ): Promise<LearningReplyEditResponse>;

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
  lessonAccess = createLessonDiscussionAccess(),
  storage,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
  lessonAccess?: LessonDiscussionAccess;
  storage?: S3StorageService;
}): RepliesService {
  const outbox = createDiscussionOutbox();
  const courseAccess = createDiscussionAccess();

  function mapReplyRow(
    row: ReplyRowWithAuthor,
    currentUserId?: string,
    attachments: DiscussionAttachmentRow[] = [],
    likedReplyIds?: Set<string>,
  ): LearningReply {
    return {
      id: row.id,
      threadId: row.threadId,
      author: presentDiscussionAuthor(row),
      content: row.content,
      plainText: row.plainText,
      isAccepted: Boolean(row.isAccepted),
      likesCount: Number(row.likesCount || 0),
      attachments: attachments.map((attachment) =>
        presentDiscussionAttachment(attachment, storage),
      ),
      isLiked: likedReplyIds ? likedReplyIds.has(row.id) : false,
      isOwn: currentUserId ? row.userId === currentUserId : false,
      createdAt: toIsoString(row.createdAt),
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

        await courseAccess.assertCanParticipateInCourse(
          trx,
          {
            userId: input.userId,
            roles: input.roles,
          },
          thread.courseId,
        );
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
        let parentReplyId = input.parentReplyId || null;
        let targetUserId: string | null = null;

        if (targetReplyId) {
          const targetReply = await repliesRepo.findReplyById(
            trx,
            targetReplyId,
          );
          if (!targetReply || targetReply.threadId !== input.threadId) {
            throw DiscussionErrors.invalidReply();
          }
          courseAccess.assertReplyIsActive(targetReply);

          // If the referenced reply is already a child reply (has parentReplyId), nesting further is disallowed
          if (targetReply.parentReplyId !== null) {
            throw DiscussionErrors.maxNestingExceeded();
          }

          targetUserId = targetReply.userId;
        }

        if (parentReplyId && parentReplyId !== targetReplyId) {
          const parentReply = await repliesRepo.findReplyById(
            trx,
            parentReplyId,
          );
          if (!parentReply || parentReply.threadId !== input.threadId) {
            throw DiscussionErrors.invalidReply();
          }
          courseAccess.assertReplyIsActive(parentReply);
          if (parentReply.parentReplyId !== null) {
            throw DiscussionErrors.maxNestingExceeded();
          }
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

        // Attach any verified, still-unattached attachments owned by the caller
        if (input.attachmentIds && input.attachmentIds.length > 0) {
          for (const attachmentId of input.attachmentIds) {
            const result = await trx
              .updateTable("learning_attachments")
              .set({
                target_type: "reply",
                target_id: id,
              })
              .where("id", "=", attachmentId)
              .where("owner_id", "=", input.userId)
              .where("status", "=", "ready")
              .where("target_id", "is", null)
              .executeTakeFirst();

            if (Number(result.numUpdatedRows ?? 0) === 0) {
              throw httpError(
                400,
                "INVALID_ATTACHMENT",
                `Attachment ${attachmentId} is unavailable or already attached elsewhere`,
              );
            }
          }
        }

        const created = await repliesRepo.findReplyById(trx, id);
        if (!created) {
          throw httpError(500, "CREATE_FAILED", "Failed to load created reply");
        }
        const attachments = await listReadyAttachments(trx, "reply", [id]);

        return mapReplyRow(created, input.userId, attachments.get(id));
      });
    },

    async listReplies(db, threadId, query, actor) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      const lessonReadAccess = thread.lessonId
        ? await lessonAccess.assertCanReadLesson(db, {
            courseId: thread.courseId,
            lessonId: thread.lessonId,
            actor,
          })
        : null;
      if (lessonReadAccess?.canReadPrivateState) {
        // The lesson check has already established course access.
        courseAccess.assertThreadVisibleToMember(
          actor!,
          thread,
          lessonReadAccess.canModerate,
        );
      } else if (lessonReadAccess) {
        courseAccess.assertThreadIsActive(thread);
        if (thread.visibility !== "public") {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
      } else {
        if (!actor) {
          throw DiscussionErrors.unauthorized();
        }
        await courseAccess.assertCanAccessThread(db, actor!, thread);
      }
      const canReadPrivateState = lessonReadAccess
        ? lessonReadAccess.canReadPrivateState
        : Boolean(actor);

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
      let attachmentsByReplyId = new Map<string, DiscussionAttachmentRow[]>();
      if (page.length > 0) {
        const replyIds = page.map((r) => r.id);
        const [likes, attachments] = await Promise.all([
          actor && canReadPrivateState
            ? db
                .selectFrom("learning_likes")
                .select("target_id")
                .where("user_id", "=", actor.userId)
                .where("target_type", "=", "reply")
                .where("target_id", "in", replyIds)
                .execute()
            : Promise.resolve([]),
          listReadyAttachments(db, "reply", replyIds),
        ]);

        likedReplyIds = new Set(likes.map((l) => l.target_id));
        attachmentsByReplyId = attachments;
      }

      const replies = page.map((r) =>
        mapReplyRow(
          r,
          actor?.userId,
          attachmentsByReplyId.get(r.id),
          likedReplyIds,
        ),
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
        await courseAccess.assertCanParticipateInCourse(
          trx,
          actor,
          thread.courseId,
        );
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
        if (!updated) {
          throw httpError(500, "UPDATE_FAILED", "Failed to load updated reply");
        }
        return {
          id: updated.id,
          content: updated.content,
          plainText: updated.plainText,
          updatedAt: toIsoString(updated.updatedAt),
        };
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
        await courseAccess.assertCanParticipateInCourse(
          trx,
          actor,
          thread.courseId,
        );
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

        await trx
          .deleteFrom("learning_mentions")
          .where("source_type", "=", "reply")
          .where("source_id", "=", replyId)
          .execute();

        await trx
          .updateTable("learning_attachments")
          .set({ status: "deleted" })
          .where("target_type", "=", "reply")
          .where("target_id", "=", replyId)
          .execute();

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
        await courseAccess.assertCanParticipateInCourse(
          trx,
          actor,
          thread.courseId,
        );
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
          throw DiscussionErrors.notAQuestion();
        }

        if (reply.threadId !== thread.id) {
          throw DiscussionErrors.invalidReply();
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

        // Serialize concurrent accept/unaccept requests for this thread so
        // only one reply ends up accepted.
        const lockedThread = await trx
          .selectFrom("learning_threads")
          .select(["id", "accepted_answer_id as acceptedAnswerId"])
          .where("id", "=", thread.id)
          .forUpdate()
          .executeTakeFirst();
        if (!lockedThread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
        thread.acceptedAnswerId = lockedThread.acceptedAnswerId ?? null;

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

          if (reply.userId !== actor.userId) {
            const actorName = await resolveActorName(trx, actor.userId);
            const deepLink = await resolveDeepLink(
              trx,
              thread.courseId,
              thread.id,
            );
            await outbox.publish(trx, {
              type: "discussion.answer_accepted",
              version: 1,
              dedupeKey: `discussion.answer_accepted:${thread.id}:${replyId}`,
              occurredAt: new Date(),
              payload: {
                recipientUserId: reply.userId,
                actorName,
                threadTitle: thread.title || "Question",
                deepLink,
              },
            });
          }

          return { acceptedAnswerId: replyId };
        }

        await repliesRepo.setAcceptedStatus(trx, replyId, false);
        if (thread.acceptedAnswerId === replyId) {
          await threadsRepo.setAcceptedAnswer(trx, thread.id, null);
        }

        return {
          acceptedAnswerId:
            thread.acceptedAnswerId === replyId
              ? null
              : thread.acceptedAnswerId,
        };
      });
    },
  };
}
