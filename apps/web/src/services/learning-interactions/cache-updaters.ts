import type { InfiniteData, QueryClient } from "@tanstack/react-query";
import type {
  DiscussionsWorkspaceResponse,
  LearningRepliesListResponse,
  LearningThread,
  LearningThreadsListResponse,
  WorkspaceDiscussionItem,
} from "@veolms/contracts";
import { learningInteractionKeys } from "./learning-interactions.keys";
import {
  getClientEntityId,
  getServerEntityId,
  type LearningNoteCacheItem,
  type LearningNotesCacheResponse,
  type LearningRepliesCacheResponse,
} from "./interaction-entities";
import { isInfiniteCacheData, mapPaginatedCache } from "./paginated-cache";

type ThreadListCache =
  | LearningThreadsListResponse
  | import("@tanstack/react-query").InfiniteData<LearningThreadsListResponse>;
type NoteListCache =
  | LearningNotesCacheResponse
  | import("@tanstack/react-query").InfiniteData<LearningNotesCacheResponse>;
type ReplyListCache =
  | LearningRepliesCacheResponse
  | import("@tanstack/react-query").InfiniteData<LearningRepliesCacheResponse>;
type DiscussionsWorkspaceCache = InfiniteData<DiscussionsWorkspaceResponse>;

type DiscussionWorkspaceSourceType = "thread" | "note";

function matchesDiscussionWorkspaceSource(
  item: WorkspaceDiscussionItem,
  sourceType: DiscussionWorkspaceSourceType,
  sourceId: string,
): boolean {
  if (sourceType === "note") {
    return item.itemType === "note" && item.id === sourceId;
  }

  return (
    (item.itemType === "thread" && item.id === sourceId) ||
    (item.itemType === "reply" && item.parentThreadId === sourceId)
  );
}

interface DiscussionsWorkspaceQueryFilters {
  tab?: string;
  courseId?: string;
  kind?: string;
  search?: string;
  visibility?: string;
}

export interface DiscussionsWorkspaceCacheSnapshot {
  readonly entries: ReadonlyArray<{
    queryKey: readonly unknown[];
    data: DiscussionsWorkspaceCache;
  }>;
}

export interface OptimisticDiscussionsWorkspaceMembership {
  sourceType: DiscussionWorkspaceSourceType;
  sourceId: string;
  sourceItem: WorkspaceDiscussionItem;
  bookmarked?: boolean;
  following?: boolean;
}

function isDiscussionsWorkspaceQuery(queryKey: readonly unknown[]): boolean {
  return (
    queryKey[0] === learningInteractionKeys.all[0] &&
    queryKey[1] === "discussions-workspace"
  );
}

function getWorkspaceQueryFilters(
  queryKey: readonly unknown[],
): DiscussionsWorkspaceQueryFilters {
  return (queryKey[3] as DiscussionsWorkspaceQueryFilters | undefined) ?? {};
}

function matchesWorkspaceFilters(
  item: WorkspaceDiscussionItem,
  filters: DiscussionsWorkspaceQueryFilters,
): boolean {
  if (filters.courseId && item.courseId !== filters.courseId) return false;
  if (
    filters.kind &&
    filters.kind !== "all" &&
    item.kind !== (filters.kind === "qna" ? "question" : filters.kind)
  ) {
    return false;
  }
  if (filters.visibility && item.visibility !== filters.visibility) return false;
  if (filters.search) {
    const searchableText = [item.title, item.plainText, item.content]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase();
    if (!searchableText.includes(filters.search.toLocaleLowerCase())) {
      return false;
    }
  }
  return true;
}

function withWorkspaceMembership(
  item: WorkspaceDiscussionItem,
  membership: OptimisticDiscussionsWorkspaceMembership,
): WorkspaceDiscussionItem {
  const isSource = matchesDiscussionWorkspaceSource(
    item,
    membership.sourceType,
    membership.sourceId,
  );
  if (!isSource) return item;

  const nextBookmarked = membership.bookmarked ?? item.isBookmarked;
  const nextFollowing =
    membership.following !== undefined && item.itemType !== "note"
      ? membership.following
      : item.isFollowing;
  if (
    nextBookmarked === item.isBookmarked &&
    nextFollowing === item.isFollowing
  ) {
    return item;
  }
  return {
    ...item,
    isBookmarked: nextBookmarked,
    isFollowing: nextFollowing,
  };
}

function getSourceItemForDestination(
  cacheEntries: readonly { data: DiscussionsWorkspaceCache }[],
  membership: OptimisticDiscussionsWorkspaceMembership,
): WorkspaceDiscussionItem | null {
  if (membership.sourceType === "note") return membership.sourceItem;
  if (membership.sourceItem.itemType === "thread") return membership.sourceItem;

  for (const { data } of cacheEntries) {
    for (const page of data.pages) {
      const rootThread = page.items.find(
        (item) => item.itemType === "thread" && item.id === membership.sourceId,
      );
      if (rootThread) return rootThread;
    }
  }

  return null;
}

function compareThreadActivity(
  left: WorkspaceDiscussionItem,
  right: WorkspaceDiscussionItem,
): number {
  const leftTime = new Date(left.updatedAt).getTime();
  const rightTime = new Date(right.updatedAt).getTime();
  if (leftTime !== rightTime) return rightTime - leftTime;
  return right.id.localeCompare(left.id);
}

function insertIntoSavedWorkspace(
  data: DiscussionsWorkspaceCache,
  item: WorkspaceDiscussionItem,
): DiscussionsWorkspaceCache {
  const firstPage = data.pages[0];
  if (!firstPage) return data;
  const bookmarkedItem = {
    ...item,
    isBookmarked: true,
    bookmarkedAt: new Date().toISOString(),
  };
  return {
    ...data,
    pages: [
      {
        ...firstPage,
        items: [bookmarkedItem, ...firstPage.items],
        totalCount: firstPage.totalCount + 1,
      },
      ...data.pages.slice(1).map((page) => ({
        ...page,
        totalCount: page.totalCount + 1,
      })),
    ],
  };
}

function insertIntoFollowingWorkspace(
  data: DiscussionsWorkspaceCache,
  item: WorkspaceDiscussionItem,
): DiscussionsWorkspaceCache {
  if (data.pages.length === 0) return data;
  const followedItem = { ...item, isFollowing: true };
  let insertionPageIndex = data.pages.length - 1;
  let insertionItemIndex = data.pages[insertionPageIndex]!.items.length;

  for (const [pageIndex, page] of data.pages.entries()) {
    const itemIndex = page.items.findIndex(
      (existing) => compareThreadActivity(followedItem, existing) < 0,
    );
    if (itemIndex >= 0) {
      insertionPageIndex = pageIndex;
      insertionItemIndex = itemIndex;
      break;
    }
  }

  return {
    ...data,
    pages: data.pages.map((page, pageIndex) => ({
      ...page,
      items:
        pageIndex === insertionPageIndex
          ? [
              ...page.items.slice(0, insertionItemIndex),
              followedItem,
              ...page.items.slice(insertionItemIndex),
            ]
          : page.items,
      totalCount: page.totalCount + 1,
    })),
  };
}

function removeFromWorkspaceMembership(
  data: DiscussionsWorkspaceCache,
  membership: OptimisticDiscussionsWorkspaceMembership,
): DiscussionsWorkspaceCache {
  let removed = false;
  const pages = data.pages.map((page) => {
    const items = page.items.filter((item) => {
      const shouldRemove = matchesDiscussionWorkspaceSource(
        item,
        membership.sourceType,
        membership.sourceId,
      );
      removed ||= shouldRemove;
      return !shouldRemove;
    });
    return items.length === page.items.length ? page : { ...page, items };
  });
  if (!removed) return data;
  return {
    ...data,
    pages: pages.map((page) => ({
      ...page,
      totalCount: Math.max(0, page.totalCount - 1),
    })),
  };
}

/**
 * Applies a Workspace membership transition only to existing cached feeds and
 * returns exact pre-transition data for coordinator-aware rollback.
 */
export function optimisticallyUpdateDiscussionsWorkspaceMembership(
  queryClient: QueryClient,
  membership: OptimisticDiscussionsWorkspaceMembership,
): DiscussionsWorkspaceCacheSnapshot {
  const cacheEntries = queryClient
    .getQueryCache()
    .findAll({ predicate: (query) => isDiscussionsWorkspaceQuery(query.queryKey) })
    .flatMap((query) => {
      const data = query.state.data as DiscussionsWorkspaceCache | undefined;
      return data ? [{ queryKey: query.queryKey, data }] : [];
    });
  const destinationItem = getSourceItemForDestination(cacheEntries, membership);
  const snapshots: Array<{
    queryKey: readonly unknown[];
    data: DiscussionsWorkspaceCache;
  }> = [];

  for (const cacheEntry of cacheEntries) {
    const filters = getWorkspaceQueryFilters(cacheEntry.queryKey);
    let membershipChanged = false;
    const pagesWithMembership = cacheEntry.data.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((item) => {
        const nextItem = withWorkspaceMembership(item, membership);
        pageChanged ||= nextItem !== item;
        return nextItem;
      });
      membershipChanged ||= pageChanged;
      return pageChanged ? { ...page, items } : page;
    });
    let nextData: DiscussionsWorkspaceCache = membershipChanged
      ? { ...cacheEntry.data, pages: pagesWithMembership }
      : cacheEntry.data;
    const sourcePresent = nextData.pages.some((page) =>
      page.items.some((item) =>
        matchesDiscussionWorkspaceSource(
          item,
          membership.sourceType,
          membership.sourceId,
        ),
      ),
    );

    if (filters.tab === "saved" && membership.bookmarked !== undefined) {
      if (!membership.bookmarked && sourcePresent) {
        nextData = removeFromWorkspaceMembership(nextData, membership);
      } else if (
        membership.bookmarked &&
        !sourcePresent &&
        destinationItem &&
        matchesWorkspaceFilters(destinationItem, filters)
      ) {
        nextData = insertIntoSavedWorkspace(nextData, destinationItem);
      }
    }

    if (filters.tab === "following" && membership.following !== undefined) {
      if (!membership.following && sourcePresent) {
        nextData = removeFromWorkspaceMembership(nextData, membership);
      } else if (
        membership.following &&
        !sourcePresent &&
        destinationItem &&
        membership.sourceType === "thread" &&
        matchesWorkspaceFilters(destinationItem, filters)
      ) {
        nextData = insertIntoFollowingWorkspace(nextData, destinationItem);
      }
    }

    if (nextData !== cacheEntry.data) {
      snapshots.push(cacheEntry);
      queryClient.setQueryData(cacheEntry.queryKey, nextData);
    }
  }

  return { entries: snapshots };
}

export function restoreDiscussionsWorkspaceCacheSnapshot(
  queryClient: QueryClient,
  snapshot: DiscussionsWorkspaceCacheSnapshot,
): void {
  for (const entry of snapshot.entries) {
    queryClient.setQueryData(entry.queryKey, entry.data);
  }
}

function updateDiscussionsWorkspaceSource(
  queryClient: QueryClient,
  sourceType: DiscussionWorkspaceSourceType,
  sourceId: string,
  update: (item: WorkspaceDiscussionItem) => WorkspaceDiscussionItem,
): void {
  for (const query of queryClient
    .getQueryCache()
    .findAll({ predicate: (entry) => isDiscussionsWorkspaceQuery(entry.queryKey) })) {
    const old = query.state.data as DiscussionsWorkspaceCache | undefined;
    if (!old) continue;
    let changed = false;
    const pages = old.pages.map((page) => {
      let pageChanged = false;
      const items = page.items.map((item) => {
        if (!matchesDiscussionWorkspaceSource(item, sourceType, sourceId)) {
          return item;
        }
        const nextItem = update(item);
        changed ||= nextItem !== item;
        pageChanged ||= nextItem !== item;
        return nextItem;
      });
      return pageChanged ? { ...page, items } : page;
    });
    if (changed) queryClient.setQueryData(query.queryKey, { ...old, pages });
  }
}

function setThreadQueriesData(
  queryClient: QueryClient,
  filters: { queryKey: readonly unknown[] },
  updater: (
    old: LearningThreadsListResponse | undefined,
  ) => LearningThreadsListResponse | undefined,
): void {
  queryClient.setQueriesData<ThreadListCache>(filters, (old) =>
    old === undefined
      ? old
      : mapPaginatedCache<LearningThreadsListResponse>(old, (page) =>
          updater(page) ?? page,
        ),
  );
}

function setNoteQueriesData(
  queryClient: QueryClient,
  filters: { queryKey: readonly unknown[] },
  updater: (
    old: LearningNotesCacheResponse | undefined,
  ) => LearningNotesCacheResponse | undefined,
): void {
  queryClient.setQueriesData<NoteListCache>(filters, (old) =>
    old === undefined
      ? old
      : mapPaginatedCache<LearningNotesCacheResponse>(old, (page) =>
          updater(page) ?? page,
        ),
  );
}

function matchesThreadIdentity(
  thread: { id: string; clientId?: string; serverId?: string },
  identity: string,
): boolean {
  return (
    thread.id === identity ||
    getClientEntityId(thread) === identity ||
    getServerEntityId(thread) === identity
  );
}

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
  setThreadQueriesData(
    queryClient,
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
        if (!matchesThreadIdentity(thread, threadId)) return thread;
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
  setThreadQueriesData(
    queryClient,
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (!matchesThreadIdentity(thread, threadId)) return thread;
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
  queryClient.setQueriesData<ReplyListCache>(
    { queryKey: learningInteractionKeys.threadRepliesRoot(threadId) },
    (old) => {
      const updatePage = (page: LearningRepliesCacheResponse) => {
        let hasChange = false;
        const nextReplies = page.replies.map((reply) => {
          if (
            getClientEntityId(reply) !== replyId &&
            getServerEntityId(reply) !== replyId
          )
            return reply;
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
        return hasChange ? { ...page, replies: nextReplies } : page;
      };
      return isInfiniteCacheData<LearningRepliesCacheResponse>(old)
        ? mapPaginatedCache<LearningRepliesCacheResponse>(old, updatePage) ?? old
        : old
          ? updatePage(old)
          : old;
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
  serverId?: string,
): void {
  // 1. Update notes list queries
  setNoteQueriesData(
    queryClient,
    { queryKey: learningInteractionKeys.notesRoot() },
    (old) => {
      if (!old?.notes) return old;
      let hasChange = false;
      const nextNotes = old.notes.map((note) => {
        if (
          note.id !== noteId &&
          getClientEntityId(note) !== noteId &&
          getServerEntityId(note) !== noteId
        ) {
          return note;
        }
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
  for (const detailId of new Set([noteId, serverId].filter(Boolean))) {
    queryClient.setQueryData(
      learningInteractionKeys.noteDetails(detailId!),
      (old: LearningNoteCacheItem | undefined) => {
        if (!old) return old;
        if (
          old.id !== noteId &&
          old.id !== serverId &&
          getClientEntityId(old) !== noteId &&
          getClientEntityId(old) !== serverId &&
          getServerEntityId(old) !== noteId &&
          getServerEntityId(old) !== serverId
        ) {
          return old;
        }
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
}

/**
 * Directly updates note bookmark status in notes queries and note details query.
 */
export function updateNoteBookmarkInCache(
  queryClient: QueryClient,
  noteId: string,
  desiredBookmarked: boolean,
  serverId?: string,
): void {
  // 1. Update notes list queries
  setNoteQueriesData(
    queryClient,
    { queryKey: learningInteractionKeys.notesRoot() },
    (old) => {
      if (!old?.notes) return old;
      let hasChange = false;
      const nextNotes = old.notes.map((note) => {
        if (
          note.id !== noteId &&
          getClientEntityId(note) !== noteId &&
          getServerEntityId(note) !== noteId
        ) {
          return note;
        }
        const currentBookmarked = Boolean(note.isBookmarked);
        if (currentBookmarked === desiredBookmarked) return note;
        hasChange = true;
        return {
          ...note,
          isBookmarked: desiredBookmarked,
        };
      });
      return hasChange ? { ...old, notes: nextNotes } : old;
    },
  );

  // 2. Update note details query if cached
  for (const detailId of new Set([noteId, serverId].filter(Boolean))) {
    queryClient.setQueryData(
      learningInteractionKeys.noteDetails(detailId!),
      (old: LearningNoteCacheItem | undefined) => {
        if (!old) return old;
        if (
          old.id !== noteId &&
          old.id !== serverId &&
          getClientEntityId(old) !== noteId &&
          getClientEntityId(old) !== serverId &&
          getServerEntityId(old) !== noteId &&
          getServerEntityId(old) !== serverId
        ) {
          return old;
        }
        const currentBookmarked = Boolean(old.isBookmarked);
        if (currentBookmarked === desiredBookmarked) return old;
        return {
          ...old,
          isBookmarked: desiredBookmarked,
        };
      },
    );
  }

  updateDiscussionsWorkspaceSource(queryClient, "note", noteId, (item) =>
    Boolean(item.isBookmarked) === desiredBookmarked
      ? item
      : { ...item, isBookmarked: desiredBookmarked },
  );
}

/**
 * Directly updates thread bookmark status across all matching cache keys:
 * 1. Specific or all lessonThreads queries
 * 2. Thread details query
 * 3. Hub threads queries if present
 */
export function updateThreadBookmarkInCache(
  queryClient: QueryClient,
  threadId: string,
  desiredBookmarked: boolean,
  lessonContext?: { courseId: string; lessonId: string },
): void {
  // 1. Update lesson threads lists
  setThreadQueriesData(
    queryClient,
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
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isBookmarked) === desiredBookmarked) return thread;
        hasChange = true;
        return {
          ...thread,
          isBookmarked: desiredBookmarked,
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
      if (Boolean(old.isBookmarked) === desiredBookmarked) return old;
      return {
        ...old,
        isBookmarked: desiredBookmarked,
      };
    },
  );

  // 3. Update hub threads list if present in cache
  setThreadQueriesData(
    queryClient,
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isBookmarked) === desiredBookmarked) return thread;
        hasChange = true;
        return {
          ...thread,
          isBookmarked: desiredBookmarked,
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );

  updateDiscussionsWorkspaceSource(queryClient, "thread", threadId, (item) =>
    Boolean(item.isBookmarked) === desiredBookmarked
      ? item
      : { ...item, isBookmarked: desiredBookmarked },
  );
}

/**
 * Directly updates thread follow status across all matching cache keys:
 * 1. Specific or all lessonThreads queries
 * 2. Thread details query
 * 3. Hub threads queries if present
 */
export function updateThreadFollowInCache(
  queryClient: QueryClient,
  threadId: string,
  desiredFollowed: boolean,
  lessonContext?: { courseId: string; lessonId: string },
): void {
  // 1. Update lesson threads lists
  setThreadQueriesData(
    queryClient,
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
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isFollowing) === desiredFollowed) return thread;
        hasChange = true;
        return {
          ...thread,
          isFollowing: desiredFollowed,
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
      if (Boolean(old.isFollowing) === desiredFollowed) return old;
      return {
        ...old,
        isFollowing: desiredFollowed,
      };
    },
  );

  // 3. Update hub threads list if present in cache
  setThreadQueriesData(
    queryClient,
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isFollowing) === desiredFollowed) return thread;
        hasChange = true;
        return {
          ...thread,
          isFollowing: desiredFollowed,
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );

  updateDiscussionsWorkspaceSource(queryClient, "thread", threadId, (item) =>
    Boolean(item.isFollowing) === desiredFollowed
      ? item
      : { ...item, isFollowing: desiredFollowed },
  );
}

/**
 * Directly updates thread lock status across all matching cache keys:
 * 1. Specific or all lessonThreads queries
 * 2. Thread details query
 * 3. Hub threads queries if present
 */
export function updateThreadLockInCache(
  queryClient: QueryClient,
  threadId: string,
  desiredLocked: boolean,
  lessonContext?: { courseId: string; lessonId: string },
): void {
  // 1. Update lesson threads lists
  setThreadQueriesData(
    queryClient,
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
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isLocked) === desiredLocked) return thread;
        hasChange = true;
        return {
          ...thread,
          isLocked: desiredLocked,
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
      if (Boolean(old.isLocked) === desiredLocked) return old;
      return {
        ...old,
        isLocked: desiredLocked,
      };
    },
  );

  // 3. Update hub threads list if present in cache
  setThreadQueriesData(
    queryClient,
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (Boolean(thread.isLocked) === desiredLocked) return thread;
        hasChange = true;
        return {
          ...thread,
          isLocked: desiredLocked,
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );
}

/**
 * Directly updates accepted answer status across replies and thread caches.
 * Mutual exclusivity guarantee: only the selected reply will have isAccepted: true.
 * All other replies will have isAccepted: false.
 */
export function updateAcceptedAnswerInCache(
  queryClient: QueryClient,
  threadId: string,
  desiredAcceptedReplyId: string | null,
  lessonContext?: { courseId: string; lessonId: string },
): void {
  // 1. Update thread replies cache
  queryClient.setQueriesData<LearningRepliesListResponse>(
    { queryKey: learningInteractionKeys.threadRepliesRoot(threadId) },
    (old) => {
      if (!old?.replies) return old;
      let hasChange = false;
      const nextReplies = old.replies.map((reply) => {
        const nextIsAccepted =
          desiredAcceptedReplyId !== null &&
          (String(reply.id) === desiredAcceptedReplyId ||
            getClientEntityId(reply) === desiredAcceptedReplyId ||
            getServerEntityId(reply) === desiredAcceptedReplyId);
        if (Boolean(reply.isAccepted) === nextIsAccepted) return reply;
        hasChange = true;
        return {
          ...reply,
          isAccepted: nextIsAccepted,
        };
      });
      return hasChange ? { ...old, replies: nextReplies } : old;
    },
  );

  // 2. Update thread details query
  queryClient.setQueryData<LearningThread>(
    learningInteractionKeys.threadDetails(threadId),
    (old) => {
      if (!old) return old;
      if (old.acceptedAnswerId === desiredAcceptedReplyId) {
        return old;
      }
      return {
        ...old,
        acceptedAnswerId: desiredAcceptedReplyId,
      };
    },
  );

  // 3. Update lesson threads lists
  setThreadQueriesData(
    queryClient,
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
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (thread.acceptedAnswerId === desiredAcceptedReplyId) {
          return thread;
        }
        hasChange = true;
        return {
          ...thread,
          acceptedAnswerId: desiredAcceptedReplyId,
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );

  // 4. Update hub threads list if present in cache
  setThreadQueriesData(
    queryClient,
    { queryKey: [...learningInteractionKeys.all, "hub-threads"] },
    (old) => {
      if (!old?.threads) return old;
      let hasChange = false;
      const nextThreads = old.threads.map((thread) => {
        if (!matchesThreadIdentity(thread, threadId)) return thread;
        if (thread.acceptedAnswerId === desiredAcceptedReplyId) {
          return thread;
        }
        hasChange = true;
        return {
          ...thread,
          acceptedAnswerId: desiredAcceptedReplyId,
        };
      });
      return hasChange ? { ...old, threads: nextThreads } : old;
    },
  );
}
