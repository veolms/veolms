import type { DatabaseExecutor } from "@veolms/database";
import type {
  EngagementTargetType,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UserMention,
} from "@veolms/contracts";
import { httpError } from "../../../lib/errors.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { EngagementsRepository } from "./engagements.repository.ts";

export interface EngagementsService {
  toggleLike(
    db: DatabaseExecutor,
    userId: string,
    targetType: EngagementTargetType,
    targetId: string,
  ): Promise<ToggleLikeResponse>;

  toggleBookmark(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<ToggleBookmarkResponse>;

  toggleFollow(
    db: DatabaseExecutor,
    userId: string,
    threadId: string,
  ): Promise<ToggleFollowResponse>;

  lockThread(
    db: DatabaseExecutor,
    threadId: string,
    isLocked: boolean,
    userId: string,
    isModerator?: boolean,
  ): Promise<{ threadId: string; isLocked: boolean }>;

  searchMentions(
    db: DatabaseExecutor,
    query: string,
    limit?: number,
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
  return {
    async toggleLike(db, userId, targetType, targetId) {
      if (targetType === "thread") {
        const thread = await threadsRepo.findThreadById(db, targetId);
        if (!thread) {
          throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
        }
      } else {
        const reply = await repliesRepo.findReplyById(db, targetId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }
      }

      const alreadyLiked = await engagementsRepo.findLike(
        db,
        userId,
        targetType,
        targetId,
      );

      if (alreadyLiked) {
        await engagementsRepo.removeLike(db, userId, targetType, targetId);
        if (targetType === "thread") {
          await threadsRepo.incrementLikesCount(db, targetId, -1);
          const thread = await threadsRepo.findThreadById(db, targetId);
          return {
            targetType,
            targetId,
            liked: false,
            likesCount: Number(thread?.likesCount || 0),
          };
        } else {
          const reply = await repliesRepo.findReplyById(db, targetId);
          return {
            targetType,
            targetId,
            liked: false,
            likesCount: Number(reply?.likesCount || 0),
          };
        }
      } else {
        await engagementsRepo.addLike(db, userId, targetType, targetId);
        if (targetType === "thread") {
          await threadsRepo.incrementLikesCount(db, targetId, 1);
          const thread = await threadsRepo.findThreadById(db, targetId);
          return {
            targetType,
            targetId,
            liked: true,
            likesCount: Number(thread?.likesCount || 0),
          };
        } else {
          const reply = await repliesRepo.findReplyById(db, targetId);
          return {
            targetType,
            targetId,
            liked: true,
            likesCount: Number(reply?.likesCount || 0),
          };
        }
      }
    },

    async toggleBookmark(db, userId, threadId) {
      const alreadyBookmarked = await engagementsRepo.findBookmark(
        db,
        userId,
        threadId,
      );

      if (alreadyBookmarked) {
        await engagementsRepo.removeBookmark(db, userId, threadId);
        return { threadId, bookmarked: false };
      } else {
        await engagementsRepo.addBookmark(db, userId, threadId);
        return { threadId, bookmarked: true };
      }
    },

    async toggleFollow(db, userId, threadId) {
      const alreadyFollowed = await engagementsRepo.findFollow(
        db,
        userId,
        threadId,
      );

      if (alreadyFollowed) {
        await engagementsRepo.removeFollow(db, userId, threadId);
        return { threadId, following: false };
      } else {
        await engagementsRepo.addFollow(db, userId, threadId);
        return { threadId, following: true };
      }
    },

    async lockThread(db, threadId, isLocked, userId, isModerator = false) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }

      if (thread.userId !== userId && !isModerator) {
        throw httpError(
          403,
          "FORBIDDEN",
          "Only the author or instructor/moderator can lock/unlock this discussion",
        );
      }

      await threadsRepo.setLocked(db, threadId, isLocked);
      return { threadId, isLocked };
    },

    async searchMentions(db, query, limit = 10) {
      return engagementsRepo.searchUsersForMention(
        db,
        query,
        limit,
      );
    },
  };
}
