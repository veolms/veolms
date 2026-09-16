import {
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  LearningNotesListResponse,
  LearningRepliesListResponse,
  ListLearningNotesQuery,
  ListLearningRepliesQuery,
  ListLearningThreadsQuery,
  ListReportsQuery,
  LearningThreadsListResponse,
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
import { applyOptimisticEditFields } from "./edit-cache-updaters";
import { optimisticEditCoordinator } from "./optimistic-edit-coordinator";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletionRevision,
} from "./optimistic-deletion-coordinator";
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
  ThreadCreationRecord,
} from "./interaction-creation-coordinator";
import { isInfiniteCacheData } from "./paginated-cache";
import type { InfiniteData } from "@tanstack/react-query";
import {
  flattenReplyPages,
  getReplyTotalCount,
} from "./reply-pagination";

export { flattenReplyPages, getReplyTotalCount } from "./reply-pagination";

type LessonThreadsQuery = Partial<Omit<ListLearningThreadsQuery, "cursor">>;
type UserNotesQuery = Partial<Omit<ListLearningNotesQuery, "cursor">>;
type RepliesQuery = Partial<Omit<ListLearningRepliesQuery, "cursor">>;
type RepliesInfiniteData = InfiniteData<LearningRepliesCacheResponse>;

function normalizeExistingInfiniteCache(
  queryClient: ReturnType<typeof useQueryClient>,
  queryKey: readonly unknown[],
  pageKeys: readonly string[],
): void {
  const existing = queryClient.getQueryData<unknown>(queryKey);
  if (!existing || isInfiniteCacheData(existing)) return;
  if (!pageKeys.some((key) => key in Object(existing))) return;
  queryClient.setQueryData(queryKey, {
    pages: [existing],
    pageParams: [null],
  });
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

function entityMatchesEditFields(
  entity: { content?: string; plainText?: string; visibility?: string },
  fields: { content?: string; plainText?: string; visibility?: string },
): boolean {
  return (
    (fields.content === undefined || entity.content === fields.content) &&
    (fields.plainText === undefined || entity.plainText === fields.plainText) &&
    (fields.visibility === undefined || entity.visibility === fields.visibility)
  );
}

export function projectThreadLocalState(
  thread: LearningThreadEntity,
): LearningThreadEntity {
  thread = projectThreadEditState(thread);
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
  const replyDeletion =
    optimisticDeletionCoordinator.projectThreadReplyState(next);
  if (
    replyDeletion &&
    (next.repliesCount !== replyDeletion.repliesCount ||
      next.acceptedAnswerId !== replyDeletion.acceptedAnswerId)
  ) {
    next = {
      ...next,
      ...replyDeletion,
    };
  }
  return next;
}

function projectThreadEditState(
  thread: LearningThreadEntity,
): LearningThreadEntity {
  const record = optimisticEditCoordinator.findForEntity("thread", thread);
  if (!record) return thread;
  const fields = record.authoritative ?? record.optimistic;
  if (
    record.status === "confirmed" &&
    entityMatchesEditFields(thread, fields)
  ) {
    optimisticEditCoordinator.acknowledge("thread", record.clientId);
  }
  return {
    ...applyOptimisticEditFields(
      thread as unknown as {
        id: string | number;
        content?: string;
        plainText?: string;
        visibility?: string;
      },
      fields,
    ),
    id: record.clientId,
    clientId: record.clientId,
    serverId: record.serverId,
    creationStatus: "confirmed",
  } as LearningThreadEntity;
}

export function projectReplyLocalState(
  reply: LearningReplyCacheItem,
  threadId: string,
): LearningReplyCacheItem {
  reply = projectReplyEditState(reply);
  const clientId = getClientEntityId(reply);
  const serverId = getServerEntityId(reply);
  const acceptedState =
    desiredStateCoordinator.getAcceptedAnswerState(threadId);
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

function projectReplyEditState(
  reply: LearningReplyCacheItem,
): LearningReplyCacheItem {
  const record = optimisticEditCoordinator.findForEntity("reply", reply);
  if (!record) return reply;
  const fields = record.authoritative ?? record.optimistic;
  if (record.status === "confirmed" && entityMatchesEditFields(reply, fields)) {
    optimisticEditCoordinator.acknowledge("reply", record.clientId);
  }
  return {
    ...applyOptimisticEditFields(
      reply as unknown as {
        id: string | number;
        content?: string;
        plainText?: string;
        visibility?: string;
      },
      fields,
    ),
    id: record.clientId,
    clientId: record.clientId,
    serverId: record.serverId,
    creationStatus: "confirmed",
  } as LearningReplyCacheItem;
}

export function projectNoteLocalState(
  note: LearningNoteCacheItem,
): LearningNoteCacheItem {
  note = projectNoteEditState(note);
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

function projectNoteEditState(
  note: LearningNoteCacheItem,
): LearningNoteCacheItem {
  const record = optimisticEditCoordinator.findForEntity("note", note);
  if (!record) return note;
  const fields = record.authoritative ?? record.optimistic;
  if (record.status === "confirmed" && entityMatchesEditFields(note, fields)) {
    optimisticEditCoordinator.acknowledge("note", record.clientId);
  }
  return {
    ...applyOptimisticEditFields(
      note as unknown as {
        id: string | number;
        content?: string;
        plainText?: string;
        visibility?: string;
      },
      fields,
    ),
    id: record.clientId,
    clientId: record.clientId,
    serverId: record.serverId,
    creationStatus: "confirmed",
  } as LearningNoteCacheItem;
}

function noteMatchesQuery(
  note: LearningNoteCacheItem,
  query?: UserNotesQuery,
): boolean {
  if (!query) return true;
  if (query.courseId && query.courseId !== note.courseId) return false;
  if (query.lessonId && query.lessonId !== note.lessonId) return false;
  if (query.visibility && query.visibility !== note.visibility) return false;
  if (query.mine !== undefined && Boolean(query.mine) !== Boolean(note.isOwn)) {
    return false;
  }
  if (query.query) {
    const needle = query.query.toLowerCase();
    const searchable =
      `${note.title ?? ""} ${note.plainText} ${note.content}`.toLowerCase();
    if (!searchable.includes(needle)) return false;
  }
  if (query.tag && !note.tags.includes(query.tag)) return false;
  return true;
}

export function mergeNotesWithCreationRecords(
  response: LearningNotesListResponse,
  query: UserNotesQuery | undefined,
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

function threadMatchesQuery(
  thread: LearningThreadEntity,
  query?: LessonThreadsQuery,
): boolean {
  if (!query) return true;
  const normalizedKind = query.kind === "qna" ? "question" : query.kind;
  if (
    normalizedKind &&
    normalizedKind !== "all" &&
    thread.kind !== normalizedKind
  ) {
    return false;
  }
  if (query.courseId && query.courseId !== thread.courseId) return false;
  if (query.lessonId && query.lessonId !== thread.lessonId) return false;
  if (query.visibility && query.visibility !== thread.visibility) return false;
  if (query.mine !== undefined && Boolean(query.mine) !== Boolean(thread.isOwn)) {
    return false;
  }
  if (query.search) {
    const needle = query.search.toLowerCase();
    if (
      !`${thread.title ?? ""} ${thread.plainText} ${thread.content}`
        .toLowerCase()
        .includes(needle)
    ) {
      return false;
    }
  }
  if (query.status === "answered" && (thread.repliesCount ?? 0) <= 0) {
    return false;
  }
  if (query.status === "solved" && !thread.acceptedAnswerId) return false;
  if (
    query.status === "open" &&
    ((thread.repliesCount ?? 0) > 0 || thread.acceptedAnswerId)
  ) {
    return false;
  }
  return true;
}

export function mergeThreadsWithCreationRecords(
  response: LearningThreadsListResponse,
  query: LessonThreadsQuery | undefined,
  records: readonly ThreadCreationRecord[],
): LearningThreadCacheResponse {
  const threads: LearningThreadEntity[] = response.threads.map(
    (thread) => toLearningThreadEntity(thread),
  );
  let addedLocalThreads = 0;

  for (const record of records) {
    const localThread = record.optimisticThread;
    if (!threadMatchesQuery(localThread, query)) continue;

    const existingIndex = threads.findIndex(
      (thread) =>
        getClientEntityId(thread) === record.clientId ||
        (record.optimisticThread.serverId !== undefined &&
          getServerEntityId(thread) === record.optimisticThread.serverId),
    );
    if (existingIndex >= 0) {
      threads[existingIndex] = localThread;
    } else {
      threads.push(localThread);
      addedLocalThreads += 1;
    }
  }

  return {
    ...response,
    threads: threads.map(projectThreadLocalState),
    totalCount:
      response.totalCount === undefined
        ? response.totalCount
        : response.totalCount + addedLocalThreads,
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
  query?: LessonThreadsQuery,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const queryKey = learningInteractionKeys.lessonThreads(courseId, lessonId, query);
  normalizeExistingInfiniteCache(queryClient, queryKey, ["threads"]);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const response = await learningInteractionsService.listLessonThreads(
        courseId,
        lessonId,
        {
          ...query,
          ...(pageParam ? { cursor: pageParam } : {}),
        } as ListLearningThreadsQuery,
      );
      const page = {
        ...response,
        threads: response.threads.map((thread) =>
          toLearningThreadEntity(thread),
        ),
      };
      return pageParam === null
        ? mergeThreadsWithCreationRecords(
            page,
            query,
            interactionCreationCoordinator.getActiveThreadRecords({
              courseId,
              lessonId,
            }),
          )
        : {
            ...page,
            threads: page.threads.map(projectThreadLocalState),
          };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? Boolean(courseId && lessonId),
    staleTime: 30 * 1000,
  });
  useOptimisticDeletionRevision();
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          pages: result.data.pages.map((page) => ({
            ...page,
            threads: page.threads.map(projectThreadLocalState),
          })),
        }
      : result.data,
  };
}

export function useHubThreads(
  query?: ListLearningThreadsQuery,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const queryKey = learningInteractionKeys.hubThreads(query);
  normalizeExistingInfiniteCache(queryClient, queryKey, ["threads"]);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const response = await learningInteractionsService.listHubThreads({
        ...query,
        ...(pageParam ? { cursor: pageParam } : {}),
      } as ListLearningThreadsQuery);
      return {
        ...response,
        threads: response.threads.map((thread) =>
          projectThreadLocalState(toLearningThreadEntity(thread)),
        ),
      };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
  useOptimisticDeletionRevision();
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          pages: result.data.pages.map((page) => ({
            ...page,
            threads: page.threads.map(projectThreadLocalState),
          })),
        }
      : result.data,
  };
}

export function useThreadDetails(
  threadId: string | undefined,
  options?: { enabled?: boolean },
) {
  const isPendingClientId =
    isClientEntityId(threadId) ||
    interactionCreationCoordinator.hasPendingClientId(threadId);
  const result = useQuery<LearningThreadEntity, ApiError>({
    queryKey: learningInteractionKeys.threadDetails(threadId ?? ""),
    queryFn: async () => {
      if (!threadId || isPendingClientId) {
        throw new Error("A confirmed server thread ID is required.");
      }
      return projectThreadLocalState(
        toLearningThreadEntity(
          await learningInteractionsService.getThread(threadId),
        ),
      );
    },
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isPendingClientId,
  });
  useOptimisticDeletionRevision();
  const data = result.data ? projectThreadLocalState(result.data) : result.data;
  return {
    ...result,
    data:
      data && optimisticDeletionCoordinator.isTombstoned("thread", data)
        ? undefined
        : data,
  };
}

export function useThreadReplies(
  threadId: string | undefined,
  query?: RepliesQuery,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const queryKey = learningInteractionKeys.threadReplies(threadId ?? "", query);
  normalizeExistingInfiniteCache(queryClient, queryKey, ["replies"]);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      if (
        !threadId ||
        isClientEntityId(threadId) ||
        interactionCreationCoordinator.hasPendingClientId(threadId)
      ) {
        throw new Error("A confirmed server thread ID is required.");
      }
      const response = await learningInteractionsService.listReplies(threadId, {
        ...query,
        ...(pageParam ? { cursor: pageParam } : {}),
        limit: 20,
      });
      return pageParam === null
        ? mergeRepliesWithCreationRecords(
            response,
            threadId,
            interactionCreationCoordinator.getActiveReplyRecords(threadId),
          )
        : {
            ...response,
            replies: response.replies.map((reply) =>
              projectReplyLocalState(reply, threadId),
            ),
          };
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled:
      (options?.enabled ?? Boolean(threadId)) &&
      Boolean(threadId) &&
      !isClientEntityId(threadId) &&
      !interactionCreationCoordinator.hasPendingClientId(threadId),
  });
  useOptimisticDeletionRevision();
  if (!result.data) return result;
  const projectedPages = result.data.pages.map((page) => ({
    ...page,
    replies: page.replies.map((reply) =>
      projectReplyLocalState(reply, threadId ?? ""),
    ),
  }));
  const hiddenCount = projectedPages
    .flatMap((page) => page.replies)
    .filter((reply) => optimisticDeletionCoordinator.isTombstoned("reply", reply))
    .length;
  return {
    ...result,
    data: {
      ...result.data,
      pages: projectedPages.map((page, pageIndex) =>
        pageIndex === 0 && page.totalCount !== undefined
          ? {
              ...page,
              totalCount: Math.max(0, page.totalCount - hiddenCount),
            }
          : page,
      ),
    } as RepliesInfiniteData,
  };
}

export function useUserNotes(
  query?: UserNotesQuery,
  options?: { enabled?: boolean },
) {
  const queryClient = useQueryClient();
  const queryKey = learningInteractionKeys.notes(query);
  normalizeExistingInfiniteCache(queryClient, queryKey, ["notes"]);
  const result = useInfiniteQuery({
    queryKey,
    queryFn: async ({ pageParam }) => {
      const response = await learningInteractionsService.listNotes({
        ...query,
        ...(pageParam ? { cursor: pageParam } : {}),
      } as ListLearningNotesQuery);
      if (pageParam !== null) {
        return {
          ...response,
          notes: response.notes.map((note) =>
            projectNoteLocalState(note),
          ),
        };
      }
      return mergeNotesWithCreationRecords(
        response,
        query,
        interactionCreationCoordinator.getActiveNoteRecords(query),
      );
    },
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
    staleTime: 30 * 1000,
  });
  useOptimisticDeletionRevision();
  return {
    ...result,
    data: result.data
      ? {
          ...result.data,
          pages: result.data.pages.map((page) => ({
            ...page,
            notes: page.notes.map(projectNoteLocalState),
          })),
        }
      : result.data,
  };
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
