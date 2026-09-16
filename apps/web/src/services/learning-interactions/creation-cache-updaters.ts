import type { QueryClient } from "@tanstack/react-query";
import type {
  LearningNote,
  LearningReply,
  LearningThread,
  LearningThreadsListResponse,
  ListLearningNotesQuery,
} from "@veolms/contracts";
import { learningInteractionKeys } from "./learning-interactions.keys";
import {
  getClientEntityId,
  getServerEntityId,
  isLearningThreadEntity,
  type LearningNoteCacheItem,
  type LearningNoteEntity,
  type LearningNotesCacheResponse,
  type LearningReplyCacheItem,
  type LearningReplyEntity,
  type LearningRepliesCacheResponse,
  type LearningThreadEntity,
} from "./interaction-entities";
import {
  mergeConfirmedInteractionAttachments,
  type InteractionAttachment,
  type InteractionAttachmentPatch,
} from "./attachment-model";
import {
  isInfiniteCacheData,
  mapFirstPaginatedPage,
  mapPaginatedCache,
} from "./paginated-cache";

type ThreadListCache =
  | LearningThreadsListResponse
  | import("@tanstack/react-query").InfiniteData<LearningThreadsListResponse>;
type NoteListCache =
  | LearningNotesCacheResponse
  | import("@tanstack/react-query").InfiniteData<LearningNotesCacheResponse>;

export interface LessonThreadCacheContext {
  courseId: string;
  lessonId: string;
}

export interface NoteCacheContext {
  courseId: string;
  lessonId: string;
}

const lessonThreadQueryPrefix = (context: LessonThreadCacheContext) =>
  [
    ...learningInteractionKeys.all,
    "lesson-threads",
    context.courseId,
    context.lessonId,
  ] as const;

const replyQueryPrefix = (parentId: string) =>
  learningInteractionKeys.threadRepliesRoot(parentId);

const noteQueryPrefix = () => learningInteractionKeys.notesRoot();

function getNoteClientId(note: LearningNoteCacheItem): string {
  return getClientEntityId(note);
}

function getNoteServerId(note: LearningNoteCacheItem): string | undefined {
  return getServerEntityId(note);
}

function getListFilters(
  queryKey: readonly unknown[],
): ListLearningNotesQuery | undefined {
  const filters = queryKey[2] === "infinite" ? queryKey[3] : queryKey[2];
  return filters && typeof filters === "object"
    ? (filters as ListLearningNotesQuery)
    : undefined;
}

function matchesNoteContext(
  note: LearningNoteCacheItem,
  context: NoteCacheContext,
): boolean {
  return note.courseId === context.courseId && note.lessonId === context.lessonId;
}

function matchesNoteQuery(
  note: LearningNoteCacheItem,
  filters: ListLearningNotesQuery | undefined,
): boolean {
  if (!filters) return true;
  if (filters.courseId && note.courseId !== filters.courseId) return false;
  if (filters.lessonId && note.lessonId !== filters.lessonId) return false;
  if (filters.visibility && note.visibility !== filters.visibility) return false;
  if (
    filters.mine !== undefined &&
    Boolean(filters.mine) !== Boolean(note.isOwn)
  ) {
    return false;
  }
  if (filters.query) {
    const query = filters.query.toLowerCase();
    const searchable = `${note.title ?? ""} ${note.plainText} ${note.content}`.toLowerCase();
    if (!searchable.includes(query)) return false;
  }
  if (filters.tag && !note.tags.includes(filters.tag)) return false;
  if (filters.cursor) return false;
  return true;
}

function forEachNoteCache(
  queryClient: QueryClient,
  updater: (
    data: LearningNotesCacheResponse,
    filters: ListLearningNotesQuery | undefined,
  ) => LearningNotesCacheResponse,
): boolean {
  let changed = false;
  for (const [queryKey, data] of queryClient.getQueriesData<NoteListCache>({
    queryKey: noteQueryPrefix(),
  })) {
    if (!data) continue;
    const next = mapPaginatedCache(data, (page) =>
      updater(page, getListFilters(queryKey)),
    );
    if (next === data) continue;
    queryClient.setQueryData(queryKey, next);
    changed = true;
  }
  return changed;
}

function forEachNoteCacheFirstPage(
  queryClient: QueryClient,
  updater: (
    data: LearningNotesCacheResponse,
    filters: ListLearningNotesQuery | undefined,
  ) => LearningNotesCacheResponse,
): boolean {
  let changed = false;
  for (const [queryKey, data] of queryClient.getQueriesData<NoteListCache>({
    queryKey: noteQueryPrefix(),
  })) {
    if (!data) continue;
    const next = mapFirstPaginatedPage(data, (page) =>
      updater(page, getListFilters(queryKey)),
    );
    if (next === data) continue;
    queryClient.setQueryData(queryKey, next);
    changed = true;
  }
  return changed;
}

function addToCanonicalNoteCache(
  queryClient: QueryClient,
  context: NoteCacheContext,
  note: LearningNoteCacheItem,
): void {
  queryClient.setQueryData<NoteListCache>(
    learningInteractionKeys.notes({
      courseId: context.courseId,
      lessonId: context.lessonId,
      limit: 20,
    }),
    (old) => {
      const prepend = (page: LearningNotesCacheResponse) => {
        if (page.notes.some((candidate) => getNoteClientId(candidate) === getNoteClientId(note))) {
          return page;
        }
        return {
          ...page,
          notes: [note, ...page.notes],
          totalCount:
            page.totalCount === undefined ? page.totalCount : page.totalCount + 1,
        };
      };
      if (isInfiniteCacheData<LearningNotesCacheResponse>(old)) {
        const firstPage = old.pages[0];
        if (!firstPage) return old;
        const nextPage = prepend(firstPage);
        return nextPage === firstPage
          ? old
          : { ...old, pages: [nextPage, ...old.pages.slice(1)] };
      }
      const page = prepend(old ?? { notes: [], nextCursor: null });
      return { pages: [page], pageParams: [null] };
    },
  );
}

export function insertOptimisticNoteInCaches(
  queryClient: QueryClient,
  context: NoteCacheContext,
  note: LearningNoteEntity,
): void {
  const changedExistingCache = forEachNoteCacheFirstPage(queryClient, (old, filters) => {
    if (!matchesNoteContext(note, context) || !matchesNoteQuery(note, filters)) {
      return old;
    }
    if (old.notes.some((candidate) => getNoteClientId(candidate) === note.clientId)) {
      return old;
    }
    return {
      ...old,
      notes: [note, ...old.notes],
      totalCount:
        old.totalCount === undefined ? old.totalCount : old.totalCount + 1,
    };
  });

  if (!changedExistingCache) addToCanonicalNoteCache(queryClient, context, note);
}

export function reconcileOptimisticNoteInCaches(
  queryClient: QueryClient,
  context: NoteCacheContext,
  clientId: string,
  serverNote: LearningNote,
  localSequence: number,
  localAttachments?: readonly InteractionAttachment[],
): void {
  const confirmedNote: LearningNoteEntity = {
    ...serverNote,
    attachments: mergeConfirmedInteractionAttachments(
      serverNote.attachments,
      localAttachments,
    ),
    id: clientId,
    clientId,
    serverId: serverNote.id,
    creationStatus: "confirmed",
    localSequence,
  };
  let reconciled = false;

  forEachNoteCache(queryClient, (old, filters) => {
    if (!matchesNoteContext(serverNote, context)) {
      return old;
    }
    const existingIndex = old.notes.findIndex(
      (note) =>
        getNoteClientId(note) === clientId ||
        getNoteServerId(note) === serverNote.id,
    );
    if (existingIndex < 0) {
      return old;
    }
    if (!matchesNoteQuery(serverNote, filters)) {
      const notes = old.notes.filter((_note, index) => index !== existingIndex);
      reconciled = true;
      return {
        ...old,
        notes,
        totalCount:
          old.totalCount === undefined
            ? old.totalCount
            : Math.max(0, old.totalCount - 1),
      };
    }
    const notes = [...old.notes];
    notes[existingIndex] = confirmedNote;
    reconciled = true;
    return { ...old, notes };
  });

  if (!reconciled) addToCanonicalNoteCache(queryClient, context, confirmedNote);
}

export function updateOptimisticNoteAttachmentInCaches(
  queryClient: QueryClient,
  clientId: string,
  attachmentClientId: string,
  patch: InteractionAttachmentPatch,
): void {
  forEachNoteCache(queryClient, (old) => {
    let changed = false;
    const notes = old.notes.map((note) => {
      if (getNoteClientId(note) !== clientId || !("attachments" in note)) {
        return note;
      }
      let noteChanged = false;
      const attachments = (note.attachments ?? []).map((attachment) => {
        if (getAttachmentClientId(attachment) !== attachmentClientId) {
          return attachment;
        }
        changed = true;
        noteChanged = true;
        return { ...attachment, ...patch };
      });
      return noteChanged ? { ...note, attachments } : note;
    });
    return changed ? { ...old, notes } : old;
  });
}

export function removeOptimisticNoteFromCaches(
  queryClient: QueryClient,
  context: NoteCacheContext,
  clientId: string,
): void {
  forEachNoteCache(queryClient, (old) => {
    const notes = old.notes.filter(
      (note) =>
        !(
          matchesNoteContext(note, context) &&
          getNoteClientId(note) === clientId
        ),
    );
    if (notes.length === old.notes.length) return old;
    return {
      ...old,
      notes,
      totalCount:
        old.totalCount === undefined ? old.totalCount : Math.max(0, old.totalCount - 1),
    };
  });
}

function getReplyClientId(reply: LearningReplyCacheItem): string {
  return getClientEntityId(reply);
}

function getReplyServerId(reply: LearningReplyCacheItem): string | undefined {
  return getServerEntityId(reply);
}

function getReplySequence(reply: LearningReplyCacheItem): number {
  return "localSequence" in reply ? reply.localSequence : Number.MAX_SAFE_INTEGER;
}

function sortReplies(replies: LearningReplyCacheItem[]): LearningReplyCacheItem[] {
  return [...replies].sort((left, right) => {
    return getReplySequence(left) - getReplySequence(right);
  });
}

function setReplyCaches(
  queryClient: QueryClient,
  parentId: string,
  updater: (old: LearningRepliesCacheResponse | undefined) =>
    | LearningRepliesCacheResponse
    | undefined,
): boolean {
  let changedExistingCache = false;
  queryClient.setQueriesData<LearningRepliesCacheResponse>(
    { queryKey: replyQueryPrefix(parentId) },
    (old) => {
      const next = updater(old);
      if (next !== old) changedExistingCache = true;
      return next;
    },
  );
  return changedExistingCache;
}

function setThreadListCaches(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  updater: (
    old: LearningThreadsListResponse | undefined,
  ) => LearningThreadsListResponse | undefined,
): void {
  queryClient.setQueriesData<ThreadListCache>({ queryKey }, (old) =>
    old === undefined
      ? old
      : mapPaginatedCache<LearningThreadsListResponse>(old, (page) =>
          updater(page) ?? page,
        ),
  );
}

export function updateReplyCountInThreadCaches(
  queryClient: QueryClient,
  parentId: string,
  delta: number,
): void {
  queryClient.setQueryData<LearningThread>(
    learningInteractionKeys.threadDetails(parentId),
    (old) =>
      old
        ? { ...old, repliesCount: Math.max(0, (old.repliesCount ?? 0) + delta) }
        : old,
  );

  const updateThreadLists = (old: {
    threads: Array<LearningThread | LearningThreadEntity>;
    nextCursor: string | null;
    totalCount?: number;
  } | undefined) => {
    if (!old?.threads) return old;
    let changed = false;
    const threads = old.threads.map((thread) => {
      if (
        getClientEntityId(thread) !== parentId &&
        getServerEntityId(thread) !== parentId
      ) {
        return thread;
      }
      changed = true;
      return {
        ...thread,
        repliesCount: Math.max(0, (thread.repliesCount ?? 0) + delta),
      };
    });
    return changed ? { ...old, threads } : old;
  };

  setThreadListCaches(
    queryClient,
    [...learningInteractionKeys.all, "lesson-threads"],
    updateThreadLists,
  );
  setThreadListCaches(
    queryClient,
    [...learningInteractionKeys.all, "hub-threads"],
    updateThreadLists,
  );
}

export function insertOptimisticReplyInCaches(
  queryClient: QueryClient,
  parentId: string,
  reply: LearningReplyEntity,
): boolean {
  let inserted = false;
  const changedExistingCache = setReplyCaches(queryClient, parentId, (old) => {
    if (!old) return old;
    if (old.replies.some((item) => getReplyClientId(item) === reply.clientId)) {
      return old;
    }
    inserted = true;
    return {
      ...old,
      replies: sortReplies([...old.replies, reply]),
      totalCount:
        old.totalCount === undefined ? old.totalCount : old.totalCount + 1,
    };
  });

  if (!changedExistingCache) {
    queryClient.setQueryData<LearningRepliesCacheResponse>(
      learningInteractionKeys.threadReplies(parentId, undefined),
      (old) => {
        if (old?.replies.some((item) => getReplyClientId(item) === reply.clientId)) {
          return old;
        }
        inserted = true;
        return {
          ...(old ?? { nextCursor: null }),
          replies: sortReplies([...(old?.replies ?? []), reply]),
          totalCount:
            old?.totalCount === undefined ? old?.totalCount : old.totalCount + 1,
        };
      },
    );
  }
  if (inserted) updateReplyCountInThreadCaches(queryClient, parentId, 1);
  return inserted;
}

export function migrateOptimisticRepliesToServerParent(
  queryClient: QueryClient,
  parentClientId: string,
  parentServerId: string,
): void {
  const pendingEntries = queryClient.getQueriesData<LearningRepliesCacheResponse>({
    queryKey: replyQueryPrefix(parentClientId),
  });
  for (const [pendingKey, pendingData] of pendingEntries) {
    if (!pendingData) continue;
    const suffix = pendingKey.slice(replyQueryPrefix(parentClientId).length);
    const serverKey = [...replyQueryPrefix(parentServerId), ...suffix];
    queryClient.setQueryData<LearningRepliesCacheResponse>(serverKey, (old) => {
      const replies = [...(old?.replies ?? [])];
      for (const reply of pendingData.replies) {
        if (
          !replies.some(
            (candidate) =>
              getReplyClientId(candidate) === getReplyClientId(reply) ||
              (getReplyServerId(candidate) !== undefined &&
                getReplyServerId(candidate) === getReplyServerId(reply)),
          )
        ) {
          replies.push(reply);
        }
      }
      return {
        ...(old ?? { nextCursor: null }),
        replies: sortReplies(replies),
      };
    });
    queryClient.removeQueries({ queryKey: pendingKey, exact: true });
  }
}

export function reconcileOptimisticReplyInCaches(
  queryClient: QueryClient,
  parentServerId: string,
  clientId: string,
  serverReply: LearningReply,
  localAttachments?: readonly InteractionAttachment[],
): void {
  const confirmedReply: LearningReplyEntity = {
    ...serverReply,
    attachments: mergeConfirmedInteractionAttachments(
      serverReply.attachments,
      localAttachments,
    ),
    id: serverReply.id,
    threadId: serverReply.threadId,
    clientId,
    serverId: serverReply.id,
    creationStatus: "confirmed",
    localSequence: Number.MAX_SAFE_INTEGER,
  };
  const changedExistingCache = setReplyCaches(queryClient, parentServerId, (old) => {
    if (!old) return old;
    const existingIndex = old.replies.findIndex(
      (reply) =>
        getReplyClientId(reply) === clientId ||
        getReplyServerId(reply) === serverReply.id,
    );
    if (existingIndex < 0) {
      return { ...old, replies: sortReplies([...old.replies, confirmedReply]) };
    }
    const replies = [...old.replies];
    const existing = replies[existingIndex]!;
    replies[existingIndex] = {
      ...confirmedReply,
      localSequence: getReplySequence(existing),
    };
    return { ...old, replies: sortReplies(replies) };
  });
  if (!changedExistingCache) {
    queryClient.setQueryData<LearningRepliesCacheResponse>(
      learningInteractionKeys.threadReplies(parentServerId, undefined),
      (old) => ({
        ...(old ?? { nextCursor: null }),
        replies: sortReplies([...(old?.replies ?? []), confirmedReply]),
      }),
    );
  }
}

export function updateOptimisticReplyAttachmentInCaches(
  queryClient: QueryClient,
  parentId: string,
  clientId: string,
  attachmentClientId: string,
  patch: InteractionAttachmentPatch,
): void {
  setReplyCaches(queryClient, parentId, (old) => {
    if (!old) return old;
    let changed = false;
    const replies = old.replies.map((reply) => {
      if (getReplyClientId(reply) !== clientId) return reply;
      let replyChanged = false;
      const attachments = (reply.attachments ?? []).map((attachment) => {
        if (getAttachmentClientId(attachment) !== attachmentClientId) {
          return attachment;
        }
        changed = true;
        replyChanged = true;
        return { ...attachment, ...patch };
      });
      return replyChanged ? { ...reply, attachments } : reply;
    });
    return changed ? { ...old, replies } : old;
  });
}

export function removeOptimisticReplyFromCaches(
  queryClient: QueryClient,
  parentId: string,
  clientId: string,
): void {
  let removed = false;
  setReplyCaches(queryClient, parentId, (old) => {
    if (!old) return old;
    const replies = old.replies.filter((reply) => getReplyClientId(reply) !== clientId);
    if (replies.length === old.replies.length) return old;
    removed = true;
    return {
      ...old,
      replies,
      totalCount:
        old.totalCount === undefined ? old.totalCount : Math.max(0, old.totalCount - 1),
    };
  });
  if (removed) updateReplyCountInThreadCaches(queryClient, parentId, -1);
}

function asThreadEntity(
  thread: LearningThread | LearningThreadEntity,
): LearningThreadEntity {
  if (isLearningThreadEntity(thread)) return thread;
  return {
    ...thread,
    id: thread.id,
    clientId: thread.id,
    serverId: thread.id,
    creationStatus: "confirmed",
  };
}

function isPendingThreadForClient(
  thread: LearningThread | LearningThreadEntity,
  clientId: string,
): boolean {
  return getClientEntityId(thread) === clientId;
}

function hasServerThread(
  thread: LearningThread | LearningThreadEntity,
  serverId: string,
): boolean {
  return getServerEntityId(thread) === serverId;
}

function setLessonThreadCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  updater: (
    old: LearningThreadsListResponse | undefined,
  ) => LearningThreadsListResponse | undefined,
): boolean {
  let changedExistingCache = false;
  queryClient.setQueriesData<ThreadListCache>(
    { queryKey: lessonThreadQueryPrefix(context) },
    (old) => {
      const next =
        old === undefined
          ? old
          : mapPaginatedCache<LearningThreadsListResponse>(old, (page) =>
              updater(page) ?? page,
            );
      if (next !== old) changedExistingCache = true;
      return next;
    },
  );
  return changedExistingCache;
}

function setLessonThreadCachesFirstPage(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  updater: (
    old: LearningThreadsListResponse | undefined,
  ) => LearningThreadsListResponse | undefined,
): boolean {
  let changedExistingCache = false;
  queryClient.setQueriesData<ThreadListCache>(
    { queryKey: lessonThreadQueryPrefix(context) },
    (old) => {
      const next =
        old === undefined
          ? old
          : mapFirstPaginatedPage<LearningThreadsListResponse>(old, (page) =>
              updater(page) ?? page,
            );
      if (next !== old) changedExistingCache = true;
      return next;
    },
  );
  return changedExistingCache;
}

export function insertOptimisticThreadInLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  optimisticThread: LearningThreadEntity,
): void {
  const changedExistingCache = setLessonThreadCachesFirstPage(
    queryClient,
    context,
    (old) => {
      if (!old?.threads) return old;
      if (
        old.threads.some(
          (thread) => getClientEntityId(thread) === optimisticThread.clientId,
        )
      ) {
        return old;
      }
      return {
        ...old,
        threads: [optimisticThread, ...old.threads.map(asThreadEntity)],
      };
    },
  );

  if (!changedExistingCache) {
    queryClient.setQueryData<ThreadListCache>(
      learningInteractionKeys.lessonThreads(
        context.courseId,
        context.lessonId,
        { kind: "all", status: "all", sort: "latest", limit: 20 },
      ),
      (old) => {
        const insert = (page: LearningThreadsListResponse) => {
          if (
            page.threads.some(
              (thread) => getClientEntityId(thread) === optimisticThread.clientId,
            )
          ) {
            return page;
          }
          return {
            ...page,
            threads: [
              optimisticThread,
              ...page.threads.map(asThreadEntity),
            ],
          };
        };
        if (isInfiniteCacheData<LearningThreadsListResponse>(old)) {
          const firstPage = old.pages[0];
          if (!firstPage) return old;
          const nextPage = insert(firstPage);
          return nextPage === firstPage
            ? old
            : { ...old, pages: [nextPage, ...old.pages.slice(1)] };
        }
        return {
          pages: [insert(old ?? { threads: [], nextCursor: null })],
          pageParams: [null],
        };
      },
    );
  }
}

export function reconcileOptimisticThreadInLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  clientId: string,
  serverThread: LearningThread,
  localAttachments?: readonly InteractionAttachment[],
): void {
  const confirmedThread = {
    ...serverThread,
    attachments: mergeConfirmedInteractionAttachments(
      serverThread.attachments,
      localAttachments,
    ),
    id: serverThread.id,
    clientId,
    serverId: serverThread.id,
    creationStatus: "confirmed" as const,
  };

  const changedExistingCache = setLessonThreadCaches(
    queryClient,
    context,
    (old) => {
      if (!old?.threads) return old;
      const hasPending = old.threads.some((thread) =>
        isPendingThreadForClient(thread, clientId),
      );
      const hasConfirmed = old.threads.some((thread) =>
        hasServerThread(thread, serverThread.id),
      );
      if (!hasPending && !hasConfirmed) return old;

      const withoutPending = old.threads.filter(
        (thread) => !isPendingThreadForClient(thread, clientId),
      );
      if (hasConfirmed) {
        return {
          ...old,
          threads: withoutPending.map((thread) =>
            hasServerThread(thread, serverThread.id)
              ? confirmedThread
              : asThreadEntity(thread),
          ),
        };
      }

      const pendingIndex = old.threads.findIndex((thread) =>
        isPendingThreadForClient(thread, clientId),
      );
      const nextThreads = withoutPending.map(asThreadEntity);
      nextThreads.splice(Math.max(0, pendingIndex), 0, confirmedThread);
      return { ...old, threads: nextThreads };
    },
  );

  if (!changedExistingCache) {
    queryClient.setQueryData<ThreadListCache>(
      learningInteractionKeys.lessonThreads(
        context.courseId,
        context.lessonId,
        { kind: "all", status: "all", sort: "latest", limit: 20 },
      ),
      (old) => {
        const reconcile = (page: LearningThreadsListResponse) => {
          if (
            page.threads.some((thread) => hasServerThread(thread, serverThread.id))
          ) {
            return page;
          }
          return {
            ...page,
            threads: [...page.threads.map(asThreadEntity), confirmedThread],
          };
        };
        if (isInfiniteCacheData<LearningThreadsListResponse>(old)) {
          const firstPage = old.pages[0];
          if (!firstPage) return old;
          const nextPage = reconcile(firstPage);
          return nextPage === firstPage
            ? old
            : { ...old, pages: [nextPage, ...old.pages.slice(1)] };
        }
        if (!old) {
          return {
            pages: [{ threads: [confirmedThread], nextCursor: null }],
            pageParams: [null],
          };
        }
        return reconcile(old);
      },
    );
  }
}

export function updateOptimisticThreadAttachmentInCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  clientId: string,
  attachmentClientId: string,
  patch: InteractionAttachmentPatch,
): void {
  setLessonThreadCaches(queryClient, context, (old) => {
    if (!old?.threads) return old;
    let changed = false;
    const threads = old.threads.map((thread) => {
      if (getClientEntityId(thread) !== clientId) return thread;
      let threadChanged = false;
      const attachments = (thread.attachments ?? []).map((attachment) => {
        if (getAttachmentClientId(attachment) !== attachmentClientId) {
          return attachment;
        }
        changed = true;
        threadChanged = true;
        return { ...attachment, ...patch };
      });
      return threadChanged ? { ...thread, attachments } : thread;
    });
    return changed ? { ...old, threads } : old;
  });
}

export function removeOptimisticThreadFromLessonCaches(
  queryClient: QueryClient,
  context: LessonThreadCacheContext,
  clientId: string,
): void {
  setLessonThreadCaches(queryClient, context, (old) => {
    if (!old?.threads) return old;
    const threads = old.threads.filter(
      (thread) => !isPendingThreadForClient(thread, clientId),
    );
    return threads.length === old.threads.length ? old : { ...old, threads };
  });
}

function getAttachmentClientId(attachment: { id: string; clientId?: string }): string {
  return attachment.clientId ?? attachment.id;
}
