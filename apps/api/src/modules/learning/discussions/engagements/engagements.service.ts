import type { DatabaseExecutor } from "@veolms/database";
import type {
  DiscussionReactionType,
  EngagementTargetType,
  LockThreadResponse,
  ReactionsListResponse,
  ToggleBookmarkResponse,
  ToggleFollowResponse,
  ToggleLikeResponse,
  UserAutocompleteItem,
} from "@veolms/contracts";
import { httpError } from "../../../../lib/errors.ts";
import { withWriteTransaction } from "../shared/discussion.mentions.ts";
import {
  createDiscussionAccess,
  type DiscussionActor,
} from "../shared/discussion.access.ts";
import { createDiscussionRepository } from "../shared/discussion.repository.ts";
import {
  createLessonDiscussionAccess,
  type LessonDiscussionAccess,
} from "../shared/lesson-discussion-access.ts";
import { DiscussionErrors } from "../shared/discussion.errors.ts";
import { decodeDiscussionCursor } from "../shared/discussion.utils.ts";
import {
  createNotesRepository,
  type NotesRepository,
} from "../notes/notes.repository.ts";
import type { RepliesRepository } from "../replies/replies.repository.ts";
import type { ThreadsRepository } from "../threads/threads.repository.ts";
import type { EngagementsRepository } from "./engagements.repository.ts";

export interface EngagementsService {
  toggleLike(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    targetType: EngagementTargetType,
    targetId: string,
    reaction?: DiscussionReactionType,
  ): Promise<ToggleLikeResponse>;

  listReactions(
    db: DatabaseExecutor,
    actor: DiscussionActor | null,
    targetType: EngagementTargetType,
    targetId: string,
    filterReaction?: DiscussionReactionType,
    limit?: number,
    cursor?: string,
  ): Promise<ReactionsListResponse>;

  toggleBookmark(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    threadId: string,
  ): Promise<ToggleBookmarkResponse>;

  toggleNoteBookmark(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    noteId: string,
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
  ): Promise<LockThreadResponse>;

  searchMentions(
    db: DatabaseExecutor,
    actor: DiscussionActor,
    input: {
      query?: string;
      courseId: string;
      limit?: number;
    },
  ): Promise<UserAutocompleteItem[]>;
}

export function createEngagementsService({
  threadsRepo,
  repliesRepo,
  notesRepo = createNotesRepository(),
  engagementsRepo,
  lessonAccess = createLessonDiscussionAccess(),
}: {
  threadsRepo: ThreadsRepository;
  repliesRepo: RepliesRepository;
  notesRepo?: NotesRepository;
  engagementsRepo: EngagementsRepository;
  lessonAccess?: LessonDiscussionAccess;
}): EngagementsService {
  const courseAccess = createDiscussionAccess();
  const discussionRepo = createDiscussionRepository();

  return {
    async toggleLike(db, actor, targetType, targetId, reaction) {
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
          await courseAccess.assertCanParticipateInCourse(
            trx,
            actor,
            thread.courseId,
          );
          await courseAccess.assertCanAccessThread(trx, actor, thread);
          courseAccess.assertThreadIsActive(thread);
          await courseAccess.assertNotSuspended(
            trx,
            actor.userId,
            thread.courseId,
            thread.kind,
          );
        } else if (targetType === "reply") {
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
        } else if (targetType === "note") {
          const note = await notesRepo.findNoteAccessTarget(trx, targetId);
          if (!note) {
            throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
          }
          await courseAccess.assertCanParticipateInCourse(
            trx,
            actor,
            note.courseId,
          );
          await courseAccess.assertCanAccessNote(trx, actor, note);
          await courseAccess.assertNotSuspended(
            trx,
            actor.userId,
            note.courseId,
            "commenting",
          );
        }

        const reactionToSet: DiscussionReactionType = reaction ?? "like";
        const result = await engagementsRepo.setReaction(
          trx,
          actor.userId,
          targetType,
          targetId,
          reactionToSet,
        );

        if (result.changedCount !== 0) {
          if (targetType === "thread") {
            await threadsRepo.incrementLikesCount(
              trx,
              targetId,
              result.changedCount,
            );
          } else if (targetType === "reply") {
            await repliesRepo.incrementLikesCount(
              trx,
              targetId,
              result.changedCount,
            );
          } else if (targetType === "note") {
            await notesRepo.incrementLikesCount(
              trx,
              targetId,
              result.changedCount,
            );
          }
        }

        return { liked: result.liked, reaction: result.reaction };
      });
    },

    async listReactions(
      db,
      actor,
      targetType,
      targetId,
      filterReaction,
      limit,
      cursor,
    ) {
      if (targetType === "thread") {
        const row = await threadsRepo.findThreadById(db, targetId);
        if (!row) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }

        const lessonReadAccess = row.lessonId
          ? await lessonAccess.assertCanReadLesson(db, {
              courseId: row.courseId,
              lessonId: row.lessonId,
              actor,
            })
          : null;
        if (lessonReadAccess?.canReadPrivateState) {
          courseAccess.assertThreadVisibleToMember(
            actor!,
            row,
            lessonReadAccess.canModerate,
          );
        } else if (lessonReadAccess) {
          courseAccess.assertThreadIsActive(row);
          if (row.visibility !== "public") {
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
          await courseAccess.assertCanAccessThread(db, actor, row);
        }
      } else if (targetType === "reply") {
        const reply = await repliesRepo.findReplyById(db, targetId);
        if (!reply) {
          throw httpError(404, "REPLY_NOT_FOUND", "Reply not found");
        }
        courseAccess.assertReplyIsActive(reply);

        const thread = await threadsRepo.findThreadById(db, reply.threadId);
        if (!thread) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }

        const lessonReadAccess = thread.lessonId
          ? await lessonAccess.assertCanReadLesson(db, {
              courseId: thread.courseId,
              lessonId: thread.lessonId,
              actor,
            })
          : null;
        if (lessonReadAccess?.canReadPrivateState) {
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
          await courseAccess.assertCanAccessThread(db, actor, thread);
        }
      } else if (targetType === "note") {
        const note = await notesRepo.findNoteAccessTarget(db, targetId);
        if (!note) {
          throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
        }

        if (note.visibility === "private") {
          if (!actor || actor.userId !== note.userId) {
            throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
          }
        } else {
          if (!actor) {
            throw DiscussionErrors.unauthorized();
          }
          await courseAccess.assertCanAccessNote(db, actor, note);
        }
      }

      const pageCursor = decodeDiscussionCursor(cursor);
      return engagementsRepo.listReactions(
        db,
        targetType,
        targetId,
        filterReaction,
        limit,
        pageCursor,
      );
    },

    async toggleBookmark(db, actor, threadId) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      await courseAccess.assertCanParticipateInCourse(
        db,
        actor,
        thread.courseId,
      );
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
        return { bookmarked: false };
      } else {
        await engagementsRepo.addBookmark(db, actor.userId, threadId);
        return { bookmarked: true };
      }
    },

    async toggleNoteBookmark(db, actor, noteId) {
      const note = await notesRepo.findNoteAccessTarget(db, noteId);
      if (!note) {
        throw httpError(404, "NOTE_NOT_FOUND", "Learning note not found");
      }
      await courseAccess.assertCanParticipateInCourse(db, actor, note.courseId);
      await courseAccess.assertCanAccessNote(db, actor, note);
      await courseAccess.assertNotSuspended(
        db,
        actor.userId,
        note.courseId,
        "commenting",
      );

      const alreadyBookmarked = await engagementsRepo.findNoteBookmark(
        db,
        actor.userId,
        noteId,
      );

      if (alreadyBookmarked) {
        await engagementsRepo.removeNoteBookmark(db, actor.userId, noteId);
        return { bookmarked: false };
      } else {
        await engagementsRepo.addNoteBookmark(db, actor.userId, noteId);
        return { bookmarked: true };
      }
    },

    async toggleFollow(db, actor, threadId) {
      return withWriteTransaction(db, async (trx) => {
        // Lock the root thread before reading the relationship. This keeps
        // concurrent toggle requests deterministic without changing the
        // public toggle API or relying on a unique-constraint error.
        const threadExists = await threadsRepo.lockThreadById(trx, threadId);
        if (!threadExists) {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }
        const thread = await threadsRepo.findThreadById(trx, threadId);
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

        if (thread.kind !== "question" && thread.kind !== "comment") {
          throw httpError(
            404,
            "THREAD_NOT_FOUND",
            "Discussion thread not found",
          );
        }

        await courseAccess.assertNotSuspended(
          trx,
          actor.userId,
          thread.courseId,
          thread.kind,
        );

        const alreadyFollowed = await engagementsRepo.findFollow(
          trx,
          actor.userId,
          threadId,
        );

        if (alreadyFollowed) {
          await engagementsRepo.removeFollow(trx, actor.userId, threadId);
          return { following: false };
        }

        await engagementsRepo.addFollow(trx, actor.userId, threadId);
        return { following: true };
      });
    },

    async lockThread(db, threadId, isLocked, actor) {
      const thread = await threadsRepo.findThreadById(db, threadId);
      if (!thread) {
        throw httpError(404, "THREAD_NOT_FOUND", "Discussion thread not found");
      }
      await courseAccess.assertCanParticipateInCourse(
        db,
        actor,
        thread.courseId,
      );
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

      if (!canStaffModerate) {
        // The author may lock their own thread and lift their own lock —
        // not one a moderator placed, which they used to be able to undo.
        const lockOwner = await threadsRepo.findLockOwner(db, threadId);
        if (lockOwner && lockOwner !== actor.userId) {
          if (isLocked) return { isLocked: true };
          throw httpError(
            403,
            "LOCKED_BY_MODERATOR",
            "This discussion was locked by a moderator and can only be unlocked by course staff.",
          );
        }
      }

      await threadsRepo.setLocked(db, threadId, isLocked, actor.userId);
      return { isLocked };
    },

    async searchMentions(db, actor, input) {
      const rawQuery = (input.query ?? "").trim();
      const needle = rawQuery.replace(/[%_\\]/g, "").toLowerCase();
      // Two characters minimum: a one-letter query pages through the whole
      // participant list a screenful at a time.
      if (needle.length < 2) {
        throw httpError(
          400,
          "QUERY_REQUIRED",
          "Type at least two characters to search for people to mention.",
        );
      }

      const course = await discussionRepo.findCourseId(db, input.courseId);
      if (!course) {
        throw httpError(404, "COURSE_NOT_FOUND", "Course not found");
      }

      // Only someone who may post in the course may look its people up: the
      // list exists to mention them, and mentioning requires posting.
      await courseAccess.assertCanParticipateInCourse(
        db,
        actor,
        input.courseId,
      );

      return engagementsRepo.searchUsersForMention(db, {
        query: needle,
        courseId: input.courseId,
        limit: input.limit ?? 10,
      });
    },
  };
}
