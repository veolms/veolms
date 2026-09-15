import { useQuery } from "@tanstack/react-query";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  ListReportsQuery,
  ReportsListResponse,
  UserAutocompleteQuery,
  UserAutocompleteResponse,
} from "@veolms/contracts";
import type { ApiError } from "../../lib/api-error";
import { learningInteractionKeys } from "./learning-interactions.keys";
import { learningInteractionsService } from "./learning-interactions.service";
import { interactionCreationCoordinator } from "./interaction-creation-coordinator";
import { desiredStateCoordinator } from "./desired-state-coordinator";
import { calculateNextLikesCount } from "./cache-updaters";
import {
  toLearningThreadEntity,
  getClientEntityId,
  isClientEntityId,
  getServerEntityId,
  type LearningReplyCacheItem,
  type LearningNoteCacheItem,
  type LearningNotesCacheResponse,
  type LearningRepliesCacheResponse,
  type LearningThreadCacheResponse,
  type LearningThreadEntity,
} from "./interaction-entities";
import type {
  NoteCreationRecord,
  ReplyCreationRecord,
} from "./interaction-creation-coordinator";

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply
    ? reply.localSequence
    : Number.MAX_SAFE_INTEGER;
}

function matchesAcceptedReply(
  reply: LearningReplyCacheItem,
  desiredAcceptedReplyId: string | null,
): boolean {
  return (
    desiredAcceptedReplyId !== null &&
    (String(reply.id) === desiredAcceptedReplyId ||
      getClientEntityId(reply) === desiredAcceptedReplyId ||
      getServerEntityId(reply) === desiredAcceptedReplyId)
  );
}

function projectThreadLocalState(thread: LearningThreadEntity): LearningThreadEntity {
  const clientId = getClientEntityId(thread);
  const serverId = getServerEntityId(thread);
  const acceptedState = desiredStateCoordinator.getAcceptedAnswerState(
    serverId ?? clientId,
  );
  const desiredLiked = desiredStateCoordinator.getLikeProjection(
    "thread",
    clientId,
    serverId,
  );

  let next = thread;
  if (
    acceptedState &&
    next.acceptedAnswerId !== acceptedState.desiredAcceptedReplyId
  ) {
    next = {
      ...next,
      acceptedAnswerId: acceptedState.desiredAcceptedReplyId,
    };
  }
  if (desiredLiked !== undefined && Boolean(next.isLiked) !== desiredLiked) {
    next = {
      ...next,
      isLiked: desiredLiked,
      likesCount: calculateNextLikesCount(
        next.likesCount ?? 0,
        next.isLiked,
        desiredLiked,
      ),
    };
  }
  return next;
}

function projectReplyLocalState(
  reply: LearningReplyCacheItem,
  threadId: string,
): LearningReplyCacheItem {
  const clientId = getClientEntityId(reply);
  const serverId = getServerEntityId(reply);
  const acceptedState = desiredStateCoordinator.getAcceptedAnswerState(threadId);
  const desiredLiked = desiredStateCoordinator.getLikeProjection(
    "reply",
    clientId,
    serverId,
  );

  let next = reply;
  if (
    acceptedState &&
    Boolean(next.isAccepted) !==
      matchesAcceptedReply(next, acceptedState.desiredAcceptedReplyId)
  ) {
    next = {
      ...next,
      isAccepted: matchesAcceptedReply(
        next,
        acceptedState.desiredAcceptedReplyId,
      ),
    };
  }
  if (desiredLiked !== undefined && Boolean(next.isLiked) !== desiredLiked) {
    next = {
      ...next,
      isLiked: desiredLiked,
      likesCount: calculateNextLikesCount(
        next.likesCount ?? 0,
        next.isLiked,
        desiredLiked,
      ),
    };
  }
  return next;
}

function projectNoteLocalState(
  note: LearningNoteCacheItem,
): LearningNoteCacheItem {
  const clientId = getClientEntityId(note);
  const serverId = getServerEntityId(note);
  const desiredLiked = desiredStateCoordinator.getLikeProjection(
    "note",
    clientId,
    serverId,
  );

  if (desiredLiked === undefined || Boolean(note.isLiked) === desiredLiked) {
    return note;
  }

  return {
    ...note,
    isLiked: desiredLiked,
    likesCount: calculateNextLikesCount(
      note.likesCount ?? 0,
      note.isLiked,
      desiredLiked,
    ),
  };
}

function noteMatchesQuery(
  note: LearningNoteCacheItem,
  query?: ListLearningNotesQuery,
): boolean {
  if (!query) return true;
  if (query.courseId && query.courseId !== note.courseId) return false;
  if (query.lessonId && query.lessonId !== note.lessonId) return false;
  if (query.visibility && query.visibility !== note.visibility) return false;
  if (
    query.mine !== undefined &&
    Boolean(query.mine) !== Boolean(note.isOwn)
  ) {
    return false;
  }
  if (query.query) {
    const needle = query.query.toLowerCase();
    const searchable = `${note.title ?? ""} ${note.plainText} ${note.content}`.toLowerCase();
    if (!searchable.includes(needle)) return false;
  }
  if (query.tag && !note.tags.includes(query.tag)) return false;
  if (query.cursor) return false;
  return true;
}

export function mergeNotesWithCreationRecords(
  response: LearningNotesListResponse,
  query: ListLearningNotesQuery | undefined,
  records: readonly NoteCreationRecord[],
): LearningNotesCacheResponse {
  const notes: LearningNoteCacheItem[] = [...response.notes];
  let addedLocalNotes = 0;

  for (const record of records) {
    const localNote =
      record.status === "confirmed" &&
      record.serverNote &&
      record.serverNoteEntity
        ? record.serverNoteEntity
        : record.optimisticNote;
    if (!noteMatchesQuery(localNote, query)) continue;

    const existingIndex = notes.findIndex(
      (note) =>
        getClientEntityId(note) === record.clientId ||
        (record.serverId !== undefined &&
          getServerEntityId(note) === record.serverId),
    );

    if (existingIndex >= 0) {
      notes[existingIndex] = localNote;
    } else {
      notes.push(localNote);
      addedLocalNotes += 1;
    }
  }

  return {
    ...response,
    notes: notes.map(projectNoteLocalState),
    totalCount:
      response.totalCount === undefined
        ? response.totalCount
        : response.totalCount + addedLocalNotes,
  };
}

export function mergeRepliesWithCreationRecords(
  response: LearningRepliesListResponse,
  threadId: string,
  records: readonly ReplyCreationRecord[],
): LearningRepliesCacheResponse {
  const replies: LearningReplyCacheItem[] = [...response.replies];
  let addedLocalReplies = 0;

  for (const record of records) {
    const localReply =
      record.status === "confirmed" && record.serverReply
        ? {
            ...record.serverReply,
            id: record.serverReply.id,
            threadId: record.serverReply.threadId,
            clientId: record.clientId,
            serverId: record.serverReply.id,
            creationStatus: "confirmed" as const,
            localSequence: record.localSequence,
          }
        : record.optimisticReply;
    const serverId = record.serverId ?? getServerEntityId(localReply);
    const existingIndex = serverId
      ? replies.findIndex((reply) => getServerEntityId(reply) === serverId)
      : -1;

    if (existingIndex >= 0) {
      replies[existingIndex] = {
        ...replies[existingIndex],
        ...localReply,
        clientId: record.clientId,
        serverId,
        creationStatus: "confirmed" as const,
        localSequence: record.localSequence,
      };
      continue;
    }

    replies.push(localReply);
    addedLocalReplies += 1;
  }

  replies.sort(
    (left, right) => getReplySequence(left) - getReplySequence(right),
  );
  const projectedReplies = replies.map((reply) =>
    projectReplyLocalState(reply, threadId),
  );
  return {
    ...response,
    replies: projectedReplies,
    totalCount:
      response.totalCount === undefined
        ? response.totalCount
        : response.totalCount + addedLocalReplies,
  };
}

export function useLessonThreads(
  courseId: string,
  lessonId: string,
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.lessonThreads(courseId, lessonId, query),
    queryFn: async () => {
      const response = await learningInteractionsService.listLessonThreads(
        courseId,
        lessonId,
        query,
      );
      return {
        ...response,
        threads: response.threads.map((thread) =>
          projectThreadLocalState(toLearningThreadEntity(thread)),
        ),
      };
    },
    enabled: options?.enabled ?? Boolean(courseId && lessonId),
    staleTime: 30 * 1000,
  });
}

export function useHubThreads(
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningThreadCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.hubThreads(query),
    queryFn: async () => {
      const response = await learningInteractionsService.listHubThreads(query);
      return {
        ...response,
        threads: response.threads.map((thread) =>
          projectThreadLocalState(toLearningThreadEntity(thread)),
        ),
      };
    },
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
}

export function useThreadDetails(
  threadId: string | undefined,
  options?: { enabled?: boolean },
) {
  const isPendingClientId =
    isClientEntityId(threadId) ||
    interactionCreationCoordinator.hasPendingClientId(threadId);
  return useQuery<LearningThreadEntity, ApiError>({
    queryKey: learningInteractionKeys.threadDetails(threadId ?? ""),
    queryFn: async () => {
      if (!threadId || isPendingClientId) {
        throw new Error("A confirmed server thread ID is required.");
      }
      return projectThreadLocalState(
        toLearningThreadEntity(await learningInteractionsService.getThread(threadId)),
      );
    },
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isPendingClientId,
  });
}

export function useThreadReplies(
  threadId: string | undefined,
  query?: ListLearningRepliesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningRepliesCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.threadReplies(threadId ?? "", query),
    queryFn: async () => {
      if (
        !threadId ||
        isClientEntityId(threadId) ||
        interactionCreationCoordinator.hasPendingClientId(threadId)
      ) {
        throw new Error("A confirmed server thread ID is required.");
      }
      const response = await learningInteractionsService.listReplies(
        threadId,
        query,
      );
      return mergeRepliesWithCreationRecords(
        response,
        threadId,
        interactionCreationCoordinator.getActiveReplyRecords(threadId),
      );
    },
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isClientEntityId(threadId) &&
      !interactionCreationCoordinator.hasPendingClientId(threadId),
  });
}

export function useUserNotes(
  query?: ListLearningNotesQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<LearningNotesCacheResponse, ApiError>({
    queryKey: learningInteractionKeys.notes(query),
    queryFn: async () => {
      const response = await learningInteractionsService.listNotes(query);
      return mergeNotesWithCreationRecords(
        response,
        query,
        interactionCreationCoordinator.getActiveNoteRecords(query),
      );
    },
    enabled: options?.enabled ?? true,
  });
}

export function useUserAutocomplete(
  query: UserAutocompleteQuery,
  options?: { enabled?: boolean },
) {
  const searchTerm = query.query ?? query.q ?? "";
  return useQuery<UserAutocompleteResponse, ApiError>({
    queryKey: learningInteractionKeys.autocompleteUsers(
      query.courseId,
      searchTerm,
    ),
    queryFn: () => learningInteractionsService.autocompleteUsers(query),
    enabled:
      options?.enabled ?? Boolean(query.courseId && searchTerm.length >= 1),
    staleTime: 60 * 1000,
  });
}

export function useModerationReports(
  query?: ListReportsQuery,
  options?: { enabled?: boolean },
) {
  return useQuery<ReportsListResponse, ApiError>({
    queryKey: learningInteractionKeys.moderationReports(query),
    queryFn: () => learningInteractionsService.listReports(query),
    enabled: options?.enabled ?? true,
  });
}
