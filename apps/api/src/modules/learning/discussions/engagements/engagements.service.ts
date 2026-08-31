import type { DatabaseExecutor } from "@veolms/database";
import type {
  EngagementTargetType,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UserMention,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { withWriteTransaction } from "../shared/discussion.mentions.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { EngagementsRepository } from "./engagements.repository.ts";

export interface EngagementsService {
  toggleLike(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<ToggleLikeResponse>;

  toggleBookmark(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    threadId: string,
  ): Promise<ToggleBookmarkResponse>;

  toggleFollow(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    threadId: string,
  ): Promise<ToggleFollowResponse>;

  lockThread(
    db: DatabaseExecutor,
    threadId: string,
    isLocked: boolean,
    actor: DiscussionActor,
  ): Promise<{ threadId: string; isLocked: boolean }>;

  searchMentions(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: {
      query?: string;
      q?: string;
      courseId: string;
      limit?: number;
    },
  ): Promise<UserMention[]>;
}

export function createEngagementsService({
  threadsRepo,
  repliesRepo,
  engagementsRepo,
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
  engagementsRepo: EngagementsRepository;
}): EngagementsService {
  const courseAccess = createDiscussionAccess();

  return {
    async toggleLike(db, actor, targetType, targetId) {
      return withWriteTransaction(db, async (trx) => {
        if (targetType === "thread") {
          const thread = await threadsRepo.findThreadById(trx, targetId);
          if (!thread) {
            throw httpError(
              404,
              "THREAD_NOT_FOUND",
              "Discussion thread not found",
            );
          }
          await courseAccess.assertCanAccessThread(trx, actor, thread);
          courseAccess.assertThreadIsActive(thread);
          await courseAccess.assertNotSuspended(
            trx,
            actor.userId,
            thread.courseId,
            thread.kind,
          );
        } else {
          const reply = await repliesRepo.findReplyById(trx, targetId);
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
        }

        const alreadyLiked = await engagementsRepo.findLike(
          trx,
          actor.userId,
          targetType,
          targetId,
        );

        if (alreadyLiked) {
          const removed = await engagementsRepo.removeLike(
            trx,
            actor.userId,
            targetType,
            targetId,
          );
          if (removed) {
            if (targetType === "thread") {
              await threadsRepo.incrementLikesCount(trx, targetId, -1);
            } else {
              await repliesRepo.incrementLikesCount(trx, targetId, -1);
            }
          }
        } else {
          const added = await engagementsRepo.addLike(
            trx,
            actor.userId,
            targetType,
            targetId,
          );
          if (added) {
            if (targetType === "thread") {
              await threadsRepo.incrementLikesCount(trx, targetId, 1);
            } else {
              await repliesRepo.incrementLikesCount(trx, targetId, 1);
            }
          }
        }

        if (targetType === "thread") {
          const thread = await threadsRepo.findThreadById(trx, targetId);
          return {
            targetType,
            targetId,
            liked: !alreadyLiked,
            likesCount: Number(thread?.likesCount || 0),
          };
        }

        const reply = await repliesRepo.findReplyById(trx, targetId);
        return {
          targetType,
          targetId,
          liked: !alreadyLiked,
          likesCount: Number(reply?.likesCount || 0),
        };
      });
    },

    async toggleBookmark(db, actor, threadId) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      await courseAccess.assertCanAccessThread(db, actor, thread);
      courseAccess.assertThreadIsActive(thread);
      await courseAccess.assertNotSuspended(
        db,
        actor.userId,
        thread.courseId,
        thread.kind,
      );

      const alreadyBookmarked = await engagementsRepo.findBookmark(
        db,
        actor.userId,
        threadId,
      );

      if (alreadyBookmarked) {
        await engagementsRepo.removeBookmark(db, actor.userId, threadId);
        return { threadId, bookmarked: false };
      } else {
        await engagementsRepo.addBookmark(db, actor.userId, threadId);
        return { threadId, bookmarked: true };
      }
    },

    async toggleFollow(db, actor, threadId) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      await courseAccess.assertCanAccessThread(db, actor, thread);
      courseAccess.assertThreadIsActive(thread);
      await courseAccess.assertNotSuspended(
        db,
        actor.userId,
        thread.courseId,
        thread.kind,
      );

      const alreadyFollowed = await engagementsRepo.findFollow(
        db,
        actor.userId,
        threadId,
      );

      if (alreadyFollowed) {
        await engagementsRepo.removeFollow(db, actor.userId, threadId);
        return { threadId, following: false };
      } else {
        await engagementsRepo.addFollow(db, actor.userId, threadId);
        return { threadId, following: true };
      }
    },

    async lockThread(db, threadId, isLocked, actor) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      await courseAccess.assertCanAccessThread(db, actor, thread);
      courseAccess.assertThreadIsActive(thread);
      await courseAccess.assertNotSuspended(
        db,
        actor.userId,
        thread.courseId,
        thread.kind,
      );

      const canStaffModerate = await courseAccess.canModerateCourse(
        db,
        actor,
        thread.courseId,
      );
      if (thread.userId !== actor.userId && !canStaffModerate) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Only the author or a course owner/administrator can lock/unlock this discussion",
        );
      }

      await threadsRepo.setLocked(db, threadId, isLocked);
      return { threadId, isLocked };
    },

    async searchMentions(db, actor, input) {
      const rawQuery = (input.query ?? input.q ?? "").trim();
      const needle = rawQuery.replace(/[%_\\]/g, "").toLowerCase();
      if (!needle) {
        throw httpError(
          400,
          "QUERY_REQUIRED",
          "A non-empty mention query is required.",
        );
      }

      const course = await db
        .selectFrom("courses")
        .select("id")
        .where("id", "=", input.courseId)
        .executeTakeFirst();
      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      await courseAccess.assertCanAccessCourse(db, actor, input.courseId);

      const participantIds = await courseAccess.listCourseParticipantIds(
        db,
        input.courseId,
      );

      return engagementsRepo.searchUsersForMention(db, {
        query: needle,
        userIds: participantIds,
        limit: input.limit ?? 10,
      });
    },
  };
}
