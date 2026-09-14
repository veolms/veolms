import type { QueryClient } from "@tanstack/react-query";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  LearningThread,
  LearningThreadsListResponse,
} from "@veolms/contracts";
import { learningInteractionKeys } from "./learning-interactions.keys";

/**
 * Transition-aware counter updater.
 * Only increments if false -> true, only decrements if true -> false.
 * Clamps at >= 0.
 */
export function calculateNextLikesCount(
  currentCount: number,
  previousLiked: boolean | undefined,
  nextLiked: boolean,
): number {
  const wasLiked = Boolean(previousLiked);
  if (wasLiked === nextLiked) {
    return Math.max(0, currentCount);
  }
  return Math.max(0, currentCount + (nextLiked ? 1 : -1));
}

/**
 * Directly updates thread like status across all matching cache keys:
 * 1. Specific or all lessonThreads queries
 * 2. Thread details query
 * 3. Hub threads queries
 */
export function updateThreadLikeInCache(
  queryClient: QueryClient,
  threadId: string,
  desiredLiked: boolean,
  lessonContext?: { courseId: string; lessonId: string },
): void {
  // 1. Update lesson threads lists
  queryClient.setQueriesData<LearningThreadsListResponse>(
    {
      queryKey: lessonContext
        ? [
            ...learningInteractionKeys.all,
            "lesson-threads",
            lessonContext.courseId,
            lessonContext.lessonId,
          ]
        : [...learningInteractionKeys.all, "lesson-threads"],
    },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (thread.id !== threadId) return thread;
        const currentLiked = Boolean(thread.isLiked);
        if (currentLiked === desiredLiked) return thread;
        hasChange = true;
        return {
          ...thread,
          isLiked: desiredLiked,
          likesCount: calculateNextLikesCount(
            thread.likesCount ?? 0,
            thread.isLiked,
            desiredLiked,
          ),
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );

  // 2. Update single thread details query
  queryClient.setQueryData<LearningThread>(
    learningInteractionKeys.threadDetails(threadId),
    (old) => {
      if (!old) return old;
      const currentLiked = Boolean(old.isLiked);
      if (currentLiked === desiredLiked) return old;
      return {
        ...old,
        isLiked: desiredLiked,
        likesCount: calculateNextLikesCount(
          old.likesCount ?? 0,
          old.isLiked,
          desiredLiked,
        ),
      };
    },
  );

  // 3. Update hub threads list if present
  queryClient.setQueriesData<LearningThreadsListResponse>(
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (thread.id !== threadId) return thread;
        const currentLiked = Boolean(thread.isLiked);
        if (currentLiked === desiredLiked) return thread;
        hasChange = true;
        return {
          ...thread,
          isLiked: desiredLiked,
          likesCount: calculateNextLikesCount(
            thread.likesCount ?? 0,
            thread.isLiked,
            desiredLiked,
          ),
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );
}

/**
 * Directly updates reply like status in the thread's replies cache.
 */
export function updateReplyLikeInCache(
  queryClient: QueryClient,
  threadId: string,
  replyId: string,
  desiredLiked: boolean,
): void {
  queryClient.setQueriesData<LearningRepliesListResponse>(
    { queryKey: learningInteractionKeys.threadRepliesRoot(threadId) },
    (old) => {
      if (!old?.replies) return old;
      let hasChange = false;
      const nextReplies = old.replies.map((reply) => {
        if (reply.id !== replyId) return reply;
        const currentLiked = Boolean(reply.isLiked);
        if (currentLiked === desiredLiked) return reply;
        hasChange = true;
        return {
          ...reply,
          isLiked: desiredLiked,
          likesCount: calculateNextLikesCount(
            reply.likesCount ?? 0,
            reply.isLiked,
            desiredLiked,
          ),
        };
      });
      return hasChange ? { ...old, replies: nextReplies } : old;
    },
  );
}

/**
 * Directly updates note like status in notes queries and note details query.
 */
export function updateNoteLikeInCache(
  queryClient: QueryClient,
  noteId: string,
  desiredLiked: boolean,
): void {
  // 1. Update notes list queries
  queryClient.setQueriesData<LearningNotesListResponse>(
    { queryKey: learningInteractionKeys.notesRoot() },
    (old) => {
      if (!old?.notes) return old;
      let hasChange = false;
      const nextNotes = old.notes.map((note) => {
        if (note.id !== noteId) return note;
        const currentLiked = Boolean(note.isLiked);
        if (currentLiked === desiredLiked) return note;
        hasChange = true;
        return {
          ...note,
          isLiked: desiredLiked,
          likesCount: calculateNextLikesCount(
            note.likesCount ?? 0,
            note.isLiked,
            desiredLiked,
          ),
        };
      });
      return hasChange ? { ...old, notes: nextNotes } : old;
    },
  );

  // 2. Update note details query if cached
  queryClient.setQueryData(
    learningInteractionKeys.noteDetails(noteId),
    (old: any) => {
      if (!old) return old;
      const currentLiked = Boolean(old.isLiked);
      if (currentLiked === desiredLiked) return old;
      return {
        ...old,
        isLiked: desiredLiked,
        likesCount: calculateNextLikesCount(
          old.likesCount ?? 0,
          old.isLiked,
          desiredLiked,
        ),
      };
    },
  );
}
