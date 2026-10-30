import React, {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LessonDiscussionItem,
  LearningNotesListResponse,
  LearningThreadsListResponse,
} from "@veolms/contracts";
import { QueryClientContext } from "@tanstack/react-query";
import {
  openingLessonDiscussionsQuery,
  readAccountCopy,
} from "../services/accountSessionCopies";
import {
  useInRouterContext,
  useRouteLoaderData,
  useSearchParams,
} from "react-router";
import { useDebounce } from "../hooks";
import { SearchHighlightProvider } from "../lib/searchHighlight";
import type { AcademyStaticPageData } from "../routes/academyStaticPageData";
import type { LessonPageSeed } from "./staticLessonPage";
import { ThreadSurface } from "./discussion/ThreadSurface";
import {
  CURRENT_USER,
  getCachedInteractionItems,
  threadEntriesShareIdentity,
  mergeDirectThreadCommentIdentity,
  initialEntries,
  getAllowedVisibility,
  isValidNoteDeepLinkId,
  isStoredEntries,
} from "./discussion/discussionEntries";
import { keepEntryCentered } from "./discussion/keepEntryCentered";
import type {
  DiscussionProps,
  EditingEntry,
  OpenDiscussionThread,
} from "./discussion/discussionTypes";
import {
  DEFAULT_CAPABILITIES,
  DISCUSSION_COMMENT_CHARACTER_LIMIT,
  COMMENT_LENGTH_NOTICE,
  initialDraft,
  countCharacters,
} from "./discussion/discussionConstants";
export {
  threadEntriesShareIdentity,
  mergeDirectThreadCommentIdentity,
} from "./discussion/discussionEntries";
export { PrerenderedMobileCommentComposer } from "./discussion/CompactComposer";
export {
  getDiscussionComposerCollapsedSnapPoint,
  getDiscussionComposerViewportGeometry,
} from "./discussion/composerGeometry";
export type {
  DiscussionProps,
  LessonContentAccessState,
  LessonParticipationState,
} from "./discussion/discussionTypes";
export { DISCUSSION_COMMENT_CHARACTER_LIMIT } from "./discussion/discussionConstants";
export { shouldShowDiscussionEnd } from "./discussion/ThreadSurface";
import { ToastNotification, type ToastMessage } from "../ToastNotification";
import type { Comment, CommentReply } from "./CommentCard";
import { withKeepScroll } from "../shell/applicationScroll";
import {
  applyDiscussionFeed,
  getDiscussionFeedSort,
  getDiscussionCountForFilter,
  type DiscussionEntryFilter,
  type DiscussionFeedSort,
  type DiscussionFeedView,
  type InteractionCapabilities,
} from "./discussionFeed";
import {
  adaptUnifiedDiscussionItem,
  orderUnifiedDiscussionEntries,
  withSourceAwareIdentity,
} from "./unified-discussions.adapter";
import {
  filterTombstonedEntities,
  mergeLocalOnlyEntities,
  reconcileUnifiedEntity,
  type ReconciliationEntity,
} from "./unified-discussions.reconciliation";

export type { InteractionCapabilities };
const loadDiscussionThreadPanel = () => import("./DiscussionThreadPanel");
const DiscussionThreadPanel = lazy(() =>
  loadDiscussionThreadPanel().then((module) => ({
    default: module.DiscussionThreadPanel,
  })),
);
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  getDiscussionAttachmentCount,
  hasDiscussionDraftContent,
  isStoredDiscussionDraft,
  type DiscussionDraft,
  type DiscussionEntryKind,
  type DiscussionVisibility,
} from "./discussion-editor/types";
import { preloadDiscussionEditor } from "./discussion-editor/DiscussionEditor";
import {
  NO_LEGACY_KEYS,
  useSessionStorageState,
} from "./useSessionStorageState";
import { useCurrentUser } from "../services/auth";
import { useCapabilities } from "../services/authorization";
import {
  useCreateLessonThread,
  useCreateNote,
  useCreateReport,
  useDeleteNote,
  useDeleteThread,
  useLessonInteractionCounts,
  useLessonThreads,
  useNoteDetails,
  useThreadDetails,
  desiredStateCoordinator,
  learningInteractionsService,
  updateNoteBookmarkInCache,
  useUpdateNote,
  useUpdateThread,
  useUserNotes,
} from "../services/learning-interactions";
import {
  createClientEntityId,
  revokeLocalAttachmentPreview,
  type LocalComposerAttachment,
} from "../services/learning-interactions/attachment-model";
import {
  interactionCreationCoordinator,
  learningInteractionKeys,
  mergeNotesWithCreationRecords,
  mergeThreadsWithCreationRecords,
  useLessonDiscussions,
} from "../services/learning-interactions";
import { optimisticEditCoordinator } from "../services/learning-interactions/optimistic-edit-coordinator";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletionRevision,
} from "../services/learning-interactions/optimistic-deletion-coordinator";
import {
  applyLessonInteractionCountDelta,
  restoreLessonInteractionCounts,
  type LessonInteractionCountKind,
  type LessonInteractionCountChange,
} from "../services/learning-interactions/interaction-counts-cache";
import {
  getClientEntityId,
  getServerEntityId,
  isClientEntityId,
  isPendingClientEntity,
  type LearningNoteCacheItem,
  type LearningThreadEntity,
} from "../services/learning-interactions/interaction-entities";
import {
  DiscussionReportDialog,
  type ReportTarget,
  type ReportSubmissionPayload,
} from "./DiscussionReportDialog";
import { adaptLearningNoteToComment } from "./learning-notes.adapter";
import {
  adaptLearningThreadToComment,
  isCommentOrQaThread,
} from "./learning-threads.adapter";

type SetURLSearchParams = (
  nextInit?: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  navigateOpts?: { replace?: boolean; state?: unknown },
) => void;

interface DiscussionInnerProps extends DiscussionProps {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
  /** What the document was built with, when it is a lesson page. */
  builtLessonPage?: LessonPageSeed;
}

function DiscussionInner({
  persistenceKey,
  courseSlug,
  courseId,
  courseCreatorId,
  lessonId,
  mobileLessonHeader,
  mobileBottomNavigation = false,
  mobileBottomNavigationHidden = false,
  lessonDescription,
  isLessonDescriptionLoading = false,
  interactionCapabilities,
  isInteractionCapabilitiesLoading = false,
  lessonContentAccess,
  lessonContentAccessReason = null,
  canParticipate = true,
  participationState = "granted",
  participationActionLabel,
  onParticipationAction,
  loginToParticipate = false,
  isThreadDeepLinkReady = true,
  noteDeepLinkId = null,
  onSeekToTimestamp,
  searchParams,
  setSearchParams,
  builtLessonPage,
}: DiscussionInnerProps) {
  const capabilities = interactionCapabilities ?? DEFAULT_CAPABILITIES;
  const hasNoteDeepLink = Boolean(noteDeepLinkId);
  const isValidNoteDeepLink = isValidNoteDeepLinkId(noteDeepLinkId);
  const enabledKinds = useMemo<DiscussionEntryKind[]>(() => {
    const kinds: DiscussionEntryKind[] = [];
    if (capabilities.allowComments) kinds.push("comment");
    if (capabilities.allowNotes) kinds.push("note");
    if (capabilities.allowQa) kinds.push("question");
    return kinds;
  }, [
    capabilities.allowComments,
    capabilities.allowNotes,
    capabilities.allowQa,
  ]);

  const isAllDisabled =
    !isInteractionCapabilitiesLoading &&
    enabledKinds.length === 0 &&
    !hasNoteDeepLink;

  const firstAvailableKind = useMemo<DiscussionEntryKind>(() => {
    if (capabilities.allowComments) return "comment";
    if (capabilities.allowQa) return "question";
    if (capabilities.allowNotes) return "note";
    return "comment";
  }, [
    capabilities.allowComments,
    capabilities.allowNotes,
    capabilities.allowQa,
  ]);

  const availableFilters = useMemo<
    readonly (readonly [DiscussionEntryFilter, string])[]
  >(() => {
    if (enabledKinds.length === 0 && !hasNoteDeepLink) return [];
    if (enabledKinds.length === 1 && !hasNoteDeepLink) {
      const singleKind = enabledKinds[0]!;
      const label =
        singleKind === "comment"
          ? "Comments"
          : singleKind === "note"
            ? "Notes"
            : "Q&As";
      return [[singleKind, label]] as const;
    }
    const filters: (readonly [DiscussionEntryFilter, string])[] =
      enabledKinds.length > 1 ? [["all", "All"]] : [];
    if (capabilities.allowComments) filters.push(["comment", "Comments"]);
    if (capabilities.allowNotes || hasNoteDeepLink) {
      filters.push(["note", "Notes"]);
    }
    if (capabilities.allowQa) filters.push(["question", "Q&As"]);
    return filters;
  }, [capabilities, enabledKinds, hasNoteDeepLink]);

  const promptText = useMemo(() => {
    if (enabledKinds.length === 1) {
      if (enabledKinds[0] === "note") return "Write a note…";
      if (enabledKinds[0] === "question") return "Ask a question…";
      return "Write a comment…";
    }
    return "Write something…";
  }, [enabledKinds]);

  const { data: currentUser } = useCurrentUser();
  const queryClient = React.useContext(QueryClientContext);
  const authorName =
    currentUser?.displayName?.trim() ||
    currentUser?.username?.trim() ||
    CURRENT_USER.name;
  const authorAvatar = currentUser?.avatarDataUrl || CURRENT_USER.avatar;
  const deletionRevision = useOptimisticDeletionRevision();

  const [entryKind, setEntryKind] =
    useState<DiscussionEntryKind>(firstAvailableKind);
  const [visibility, setVisibility] = useState<DiscussionVisibility>("public");
  const [entryFilter, setEntryFilter] = useState<DiscussionEntryFilter>(
    enabledKinds.length === 1 ? enabledKinds[0]! : "all",
  );
  const [chosenFeedView, setFeedView] = useState<DiscussionFeedView>("top");
  // "Mine" is only there for a learner who is signed in; one who signs out
  // while it is chosen is back on the top ones.
  const feedView: DiscussionFeedView =
    chosenFeedView === "mine" && !currentUser ? "top" : chosenFeedView;
  const feedSort: DiscussionFeedSort = getDiscussionFeedSort(feedView);
  const feedMine = feedView === "mine";
  // The search is asked of the server once typing pauses, within the kind
  // and the order chosen; the server takes up to 200 characters.
  const [discussionSearch, setDiscussionSearch] = useState("");
  const feedSearch = useDebounce(discussionSearch.trim().slice(0, 200));

  const { data: interactionCounts } = useLessonInteractionCounts(
    courseId,
    lessonId,
    {
      enabled:
        lessonContentAccess === "granted" &&
        !isInteractionCapabilitiesLoading &&
        enabledKinds.length > 0,
      // The lesson page shows the count from this tab's copy before its
      // scripts run (lessonPageEarlyState.ts); the first render agrees.
      fromTabCopy: true,
    },
  );
  const discussionCount = interactionCounts
    ? getDiscussionCountForFilter(interactionCounts, entryFilter)
    : undefined;
  const discussionCountSource =
    courseId && lessonId
      ? `${courseId}:${lessonId}:${
          entryFilter === "comment"
            ? "comments"
            : entryFilter === "question"
              ? "qna"
              : entryFilter === "note"
                ? "notes"
                : "total"
        }`
      : undefined;

  const threadQuery = useMemo(
    () => ({
      kind:
        entryFilter === "comment" || entryFilter === "question"
          ? entryFilter
          : ("all" as const),
      status: "all" as const,
      sort: feedSort === "top" ? ("popular" as const) : ("latest" as const),
      limit: 20,
    }),
    [entryFilter, feedSort],
  );
  const notesQuery = useMemo(
    () => ({
      courseId: courseId ?? "",
      lessonId: lessonId ?? "",
      limit: 20,
    }),
    [courseId, lessonId],
  );

  const { data: notesData } =
    useUserNotes(notesQuery, {
      // The unified lesson-discussions query is the only remote feed source.
      // This query remains mounted as a cache observer for existing optimistic
      // interaction projections.
      enabled: false,
    }) ?? {};

  const {
    data: directNoteData,
    isLoading: isDirectNoteLoading,
    isError: isDirectNoteError,
  } = useNoteDetails(noteDeepLinkId ?? undefined, {
    enabled: Boolean(
      isValidNoteDeepLink &&
      isThreadDeepLinkReady &&
      lessonContentAccess === "granted" &&
      courseId &&
      lessonId,
    ),
  });

  const shouldFetchThreads = Boolean(
    courseId &&
    lessonId &&
    (capabilities.allowComments || capabilities.allowQa),
  );

  const { data: threadsData } =
    useLessonThreads(courseId ?? "", lessonId ?? "", threadQuery, {
      // See the notes observer above. Keeping this cache observer active lets
      // existing creation/edit/like/delete projections stay reactive.
      enabled: false,
    }) ?? {};

  const unifiedDiscussionQuery = useMemo(
    () => ({
      kind:
        entryFilter === "comment" ||
        entryFilter === "question" ||
        entryFilter === "note"
          ? entryFilter
          : ("all" as const),
      sort: feedSort,
      ...(feedMine ? { mine: true } : {}),
      ...(feedSearch ? { search: feedSearch } : {}),
    }),
    [entryFilter, feedMine, feedSearch, feedSort],
  );
  // A lesson page is built with the first of its discussions in the order
  // they open with, so they are there at once; they are asked for again
  // straight away, as they are as old as the build.
  const builtDiscussions =
    builtLessonPage?.discussions &&
    builtLessonPage.curriculum.course.id === courseId &&
    builtLessonPage.lessonId === lessonId &&
    builtLessonPage.discussions.kind === unifiedDiscussionQuery.kind &&
    unifiedDiscussionQuery.sort === "top" &&
    !feedMine &&
    !feedSearch
      ? {
          page: builtLessonPage.discussions.page,
          updatedAt: builtLessonPage.builtAt,
        }
      : undefined;
  const unifiedDiscussions = useLessonDiscussions(
    courseId ?? "",
    lessonId ?? "",
    unifiedDiscussionQuery,
    {
      initialPage: builtDiscussions,
      // A search refined as it is typed keeps the list it narrows on screen
      // until its own results come, instead of a loading state each pause.
      keepPreviousData: Boolean(feedSearch),
      enabled: Boolean(
        courseId &&
        lessonId &&
        lessonContentAccess === "granted" &&
        !isInteractionCapabilitiesLoading &&
        (enabledKinds.length > 0 || hasNoteDeepLink),
      ),
    },
  );
  // The first page this tab last fetched for the lesson, put in place of
  // the one the page was built with as soon as the page has hydrated (the
  // built one is what the document shows, so the first render keeps it),
  // then asked again in the background as usual. Only the opening query
  // is kept (see services/accountSessionCopies.ts).
  const openingKind = unifiedDiscussionQuery.kind;
  const isOpeningQuery =
    unifiedDiscussionQuery.sort === "top" && !feedMine && !feedSearch;
  useEffect(() => {
    if (!queryClient || !courseId || !lessonId || !isOpeningQuery) return;
    const queryKey = learningInteractionKeys.lessonDiscussions(
      courseId,
      lessonId,
      openingLessonDiscussionsQuery(openingKind),
    );
    const copy = readAccountCopy<unknown>(queryKey);
    if (!copy) return;
    const state = queryClient.getQueryState(queryKey);
    if (state && state.dataUpdatedAt >= copy.savedAt) return;
    queryClient.setQueryData(queryKey, copy.value, {
      updatedAt: copy.savedAt,
    });
  }, [courseId, isOpeningQuery, lessonId, openingKind, queryClient]);
  const unifiedDiscussionItems = useMemo<LessonDiscussionItem[]>(
    () => unifiedDiscussions.data?.pages.flatMap((page) => page.items) ?? [],
    [unifiedDiscussions.data],
  );
  const unifiedRemoteBaseRef = useRef<
    Map<string, Readonly<Record<string, unknown>>>
  >(new Map());
  const visibleUnifiedDiscussionItems = useMemo(
    () =>
      unifiedDiscussionItems.filter((item) => {
        const entity = item.sourceType === "thread" ? item.thread : item.note;
        return !optimisticDeletionCoordinator.isCommittedTombstoned(
          item.sourceType,
          entity,
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deletionRevision is not read here: it changes when the deletion coordinator read above does
    [deletionRevision, unifiedDiscussionItems],
  );
  useEffect(() => {
    unifiedRemoteBaseRef.current.clear();
  }, [courseId, currentUser?.id, lessonId]);
  // A list that failed and is being asked for again still counts as failed
  // until the new attempt is over. Asked for again with nothing loaded, the
  // query goes back to pending and forgets its error, and the page swapped
  // the error for the loading placeholders: a shorter block, which pulled
  // the list's scroll up and brought the phone's bottom menu back.
  const [retryingAfterError, setRetryingAfterError] = useState(false);
  const wasFetchingRef = useRef(false);
  useEffect(() => {
    if (wasFetchingRef.current && !unifiedDiscussions.isFetching) {
      setRetryingAfterError(false);
    }
    wasFetchingRef.current = unifiedDiscussions.isFetching;
  }, [unifiedDiscussions.isFetching]);
  const listFailed = unifiedDiscussions.isError || retryingAfterError;
  const isNotesLoading =
    unifiedDiscussions.isLoading &&
    (entryFilter === "all" || entryFilter === "note");
  const isThreadsLoading =
    unifiedDiscussions.isLoading && entryFilter !== "note";
  const isNotesError =
    listFailed && (entryFilter === "all" || entryFilter === "note");
  const isThreadsError = listFailed && entryFilter !== "note";
  const retryDiscussions = () => {
    setRetryingAfterError(true);
    return unifiedDiscussions.refetch();
  };
  const refetchNotes = retryDiscussions;
  const refetchThreads = retryDiscussions;

  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote(courseId, lessonId);

  const createThreadMutation = useCreateLessonThread(
    courseId ?? "",
    lessonId ?? "",
  );
  const updateThreadMutation = useUpdateThread();
  const deleteThreadMutation = useDeleteThread(courseId, lessonId);
  const createReportMutation = useCreateReport();

  // Who may lock any thread here and accept any answer, as the API decides
  // it: the course's creator, or a role that moderates every course.
  const { canOnCourse } = useCapabilities({ enabled: Boolean(currentUser) });
  const canModerate =
    Boolean(currentUser?.id && courseCreatorId === currentUser.id) ||
    canOnCourse("discussion.moderate", null);

  const legacyNotes = useMemo<LearningNoteCacheItem[]>(() => {
    const legacyNotesData = notesData as unknown as
      | {
          pages?: Array<{ notes: LearningNoteCacheItem[] }>;
          notes?: LearningNoteCacheItem[];
        }
      | undefined;
    const pages =
      legacyNotesData?.pages ??
      (legacyNotesData?.notes ? [{ notes: legacyNotesData.notes }] : []);
    return pages.flatMap((page) => page.notes);
  }, [notesData]);

  const legacyThreads = useMemo<LearningThreadEntity[]>(() => {
    const legacyThreadsData = threadsData as unknown as
      | {
          pages?: Array<{ threads: LearningThreadEntity[] }>;
          threads?: LearningThreadEntity[];
        }
      | undefined;
    const pages =
      legacyThreadsData?.pages ??
      (legacyThreadsData?.threads
        ? [{ threads: legacyThreadsData.threads }]
        : []);
    return pages.flatMap((page) => page.threads);
  }, [threadsData]);

  useEffect(() => {
    // Do not replace the legacy cache during the unified query's initial
    // loading pass. Existing optimistic/confirmed creations must remain
    // available until there is an authoritative unified response to merge.
    if (!queryClient || !courseId || !lessonId || !unifiedDiscussions.data) {
      return;
    }

    const threadIdentity = (thread: LearningThreadEntity) => {
      const serverId = getServerEntityId(thread);
      return serverId
        ? `thread:${serverId}`
        : `thread:client:${getClientEntityId(thread)}`;
    };
    const noteIdentity = (note: LearningNoteCacheItem) => {
      const serverId = getServerEntityId(note);
      return serverId
        ? `note:${serverId}`
        : `note:client:${getClientEntityId(note)}`;
    };

    const existingThreads = getCachedInteractionItems<LearningThreadEntity>(
      queryClient.getQueryData(
        learningInteractionKeys.lessonThreads(courseId, lessonId, threadQuery),
      ),
      "threads",
    );
    const existingNotes = getCachedInteractionItems<LearningNoteCacheItem>(
      queryClient.getQueryData(learningInteractionKeys.notes(notesQuery)),
      "notes",
    );

    const existingThreadsByIdentity = new Map<string, LearningThreadEntity>();
    const existingThreadsByClientId = new Map<string, LearningThreadEntity>();
    for (const thread of existingThreads) {
      const identity = threadIdentity(thread);
      if (identity) existingThreadsByIdentity.set(identity, thread);
      existingThreadsByClientId.set(getClientEntityId(thread), thread);
    }

    const existingNotesByIdentity = new Map<string, LearningNoteCacheItem>();
    const existingNotesByClientId = new Map<string, LearningNoteCacheItem>();
    for (const note of existingNotes) {
      const identity = noteIdentity(note);
      if (identity) existingNotesByIdentity.set(identity, note);
      existingNotesByClientId.set(getClientEntityId(note), note);
    }

    const threadResponse: LearningThreadsListResponse = {
      threads: visibleUnifiedDiscussionItems.flatMap((item) =>
        item.sourceType === "thread" ? [item.thread] : [],
      ),
      nextCursor: null,
    };
    const noteResponse: LearningNotesListResponse = {
      notes: visibleUnifiedDiscussionItems.flatMap((item) =>
        item.sourceType === "note" ? [item.note] : [],
      ),
      nextCursor: null,
    };
    interactionCreationCoordinator.consumeConfirmedThreadCreationsObservedByUnified(
      { courseId, lessonId },
      unifiedDiscussionItems
        .filter((item) => item.sourceType === "thread")
        .map((item) => item.entityId),
    );
    interactionCreationCoordinator.consumeConfirmedNoteCreationsObservedByUnified(
      { courseId, lessonId },
      unifiedDiscussionItems
        .filter((item) => item.sourceType === "note")
        .map((item) => item.entityId),
    );
    const threadPage = mergeThreadsWithCreationRecords(
      threadResponse,
      threadQuery,
      interactionCreationCoordinator.getActiveThreadRecords({
        courseId,
        lessonId,
      }),
    );
    const notePage = mergeNotesWithCreationRecords(
      noteResponse,
      notesQuery,
      interactionCreationCoordinator.getActiveNoteRecords(notesQuery),
    );

    const reconciledThreads = threadPage.threads.map((thread) => {
      const identity = threadIdentity(thread);
      const existing = identity
        ? existingThreadsByIdentity.get(identity)
        : existingThreadsByClientId.get(getClientEntityId(thread));
      return reconcileUnifiedEntity(
        thread as unknown as ReconciliationEntity,
        existing as unknown as ReconciliationEntity | undefined,
        identity ? unifiedRemoteBaseRef.current.get(identity) : undefined,
      ) as unknown as LearningThreadEntity;
    });
    const reconciledNotes = notePage.notes.map((note) => {
      const identity = noteIdentity(note);
      const existing = identity
        ? existingNotesByIdentity.get(identity)
        : existingNotesByClientId.get(getClientEntityId(note));
      return reconcileUnifiedEntity(
        note as unknown as ReconciliationEntity,
        existing as unknown as ReconciliationEntity | undefined,
        identity ? unifiedRemoteBaseRef.current.get(identity) : undefined,
      ) as unknown as LearningNoteCacheItem;
    });

    const threadsWithLocalOnly = filterTombstonedEntities(
      mergeLocalOnlyEntities(
        reconciledThreads as unknown as ReconciliationEntity[],
        existingThreads as unknown as ReconciliationEntity[],
        (thread) => threadIdentity(thread as unknown as LearningThreadEntity),
        (thread) => {
          const candidate = thread as unknown as LearningThreadEntity;
          const requestedKind = threadQuery.kind;
          return requestedKind === "all" || candidate.kind === requestedKind;
        },
      ),
      (thread) =>
        optimisticDeletionCoordinator.isCommittedTombstoned(
          "thread",
          thread as unknown as LearningThreadEntity,
        ),
    ).map((thread) => thread as unknown as LearningThreadEntity);
    const notesWithLocalOnly = filterTombstonedEntities(
      mergeLocalOnlyEntities(
        reconciledNotes as unknown as ReconciliationEntity[],
        existingNotes as unknown as ReconciliationEntity[],
        (note) => noteIdentity(note as unknown as LearningNoteCacheItem),
        (note) => {
          const candidate = note as unknown as LearningNoteCacheItem;
          return entryFilter === "all" || entryFilter === "note";
        },
      ),
      (note) =>
        optimisticDeletionCoordinator.isCommittedTombstoned(
          "note",
          note as unknown as LearningNoteCacheItem,
        ),
    ).map((note) => note as unknown as LearningNoteCacheItem);

    const reconciledThreadPage = {
      ...threadPage,
      threads: threadsWithLocalOnly,
    };
    const reconciledNotePage = {
      ...notePage,
      notes: notesWithLocalOnly,
    };

    for (const item of unifiedDiscussionItems) {
      if (
        !visibleUnifiedDiscussionItems.some(
          ({ identity }) => identity === item.identity,
        )
      ) {
        unifiedRemoteBaseRef.current.delete(item.identity);
        continue;
      }
      unifiedRemoteBaseRef.current.set(
        item.identity,
        (item.sourceType === "thread"
          ? item.thread
          : item.note) as unknown as Readonly<Record<string, unknown>>,
      );
    }

    queryClient.setQueryData(
      learningInteractionKeys.lessonThreads(courseId, lessonId, threadQuery),
      { pages: [reconciledThreadPage], pageParams: [null] },
    );
    queryClient.setQueryData(learningInteractionKeys.notes(notesQuery), {
      pages: [reconciledNotePage],
      pageParams: [null],
    });
  }, [
    courseId,
    currentUser?.id,
    entryFilter,
    lessonId,
    notesQuery,
    queryClient,
    threadQuery,
    unifiedDiscussionItems,
    unifiedDiscussions.data,
    visibleUnifiedDiscussionItems,
  ]);

  const backendNotes = useMemo<Comment[]>(() => {
    if (
      !courseId ||
      !lessonId ||
      (!capabilities.allowNotes && !hasNoteDeepLink) ||
      (entryFilter !== "all" && entryFilter !== "note")
    )
      return [];

    const unifiedNoteIdentities = new Set(
      visibleUnifiedDiscussionItems
        .filter((item) => item.sourceType === "note")
        .map((item) => item.identity),
    );
    const notes = legacyNotes
      .filter((note) => {
        const serverId = getServerEntityId(note);
        return (
          !serverId ||
          isClientEntityId(getClientEntityId(note)) ||
          unifiedNoteIdentities.has(`note:${serverId}`)
        );
      })
      .map((note) => {
        const adapted = adaptLearningNoteToComment(
          note,
          authorName,
          authorAvatar,
          currentUser?.id,
        );
        const serverId = getServerEntityId(note);
        return serverId
          ? withSourceAwareIdentity(adapted, "note", serverId)
          : adapted;
      });
    const unifiedNotes = visibleUnifiedDiscussionItems
      .filter((item) => item.sourceType === "note")
      .filter(
        (item) =>
          !notes.some((note) => getServerEntityId(note) === item.entityId),
      )
      .map((item) =>
        adaptUnifiedDiscussionItem(
          item,
          authorName,
          authorAvatar,
          currentUser?.id,
        ),
      );
    const allNotes = [...notes, ...unifiedNotes];

    if (
      directNoteData &&
      directNoteData.courseId === courseId &&
      directNoteData.lessonId === lessonId
    ) {
      const directNote = adaptLearningNoteToComment(
        directNoteData,
        authorName,
        authorAvatar,
        currentUser?.id,
      );
      const sourceAwareDirectNote = withSourceAwareIdentity(
        directNote,
        "note",
        directNoteData.id,
      );
      return [
        sourceAwareDirectNote,
        ...allNotes.filter(
          (note) => getServerEntityId(note) !== directNoteData.id,
        ),
      ];
    }

    return allNotes;
  }, [
    authorAvatar,
    authorName,
    capabilities.allowNotes,
    courseId,
    currentUser?.id,
    directNoteData,
    entryFilter,
    hasNoteDeepLink,
    lessonId,
    legacyNotes,
    visibleUnifiedDiscussionItems,
  ]);

  const isBackendMode = Boolean(
    courseId || courseSlug || isInteractionCapabilitiesLoading,
  );

  const rawThreadId = noteDeepLinkId ? null : searchParams.get("thread");
  const linkedThreadId =
    rawThreadId && rawThreadId.trim().length > 0 ? rawThreadId.trim() : null;
  // A thread link with `focus=comment` does not open the thread. The comment
  // is brought to the top of the list, scrolled to and highlighted instead.
  // The id is kept in state because the link's parameters are dropped once
  // that has happened, and the comment should stay where the visitor found it.
  const spotlightIdFromUrl =
    linkedThreadId && searchParams.get("focus") === "comment"
      ? linkedThreadId
      : null;
  const [spotlightThreadId, setSpotlightThreadId] = useState<string | null>(
    spotlightIdFromUrl,
  );
  if (spotlightIdFromUrl && spotlightIdFromUrl !== spotlightThreadId) {
    setSpotlightThreadId(spotlightIdFromUrl);
  }
  const threadIdFromUrl = spotlightIdFromUrl ? null : linkedThreadId;
  const directThreadId = threadIdFromUrl ?? spotlightThreadId;
  const initialThreadDeepLinkId = useState<string | null>(
    () => threadIdFromUrl,
  )[0];

  const {
    data: directThreadData,
    isLoading: isDirectThreadLoading,
    isError: isDirectThreadError,
  } = useThreadDetails(directThreadId ?? "", {
    enabled: Boolean(
      directThreadId &&
      isBackendMode &&
      // A comment a link points at is asked for straight away, without
      // waiting for the lesson around it: the visitor came for the comment.
      (spotlightThreadId ||
        (isThreadDeepLinkReady &&
          lessonContentAccess === "granted" &&
          courseId &&
          lessonId)),
    ),
  });

  const directThreadComment = useMemo<Comment | null>(() => {
    if (!directThreadData || !isCommentOrQaThread(directThreadData))
      return null;
    return withSourceAwareIdentity(
      adaptLearningThreadToComment(directThreadData),
      "thread",
      directThreadData.id,
    );
  }, [directThreadData]);

  const backendThreads = useMemo<Comment[]>(() => {
    if (
      !courseId ||
      !lessonId ||
      (!capabilities.allowComments && !capabilities.allowQa)
    ) {
      return [];
    }

    const unifiedThreadIdentities = new Set(
      visibleUnifiedDiscussionItems
        .filter((item) => item.sourceType === "thread")
        .map((item) => item.identity),
    );
    const threads = legacyThreads
      .filter(isCommentOrQaThread)
      .filter((thread) => {
        const serverId = getServerEntityId(thread);
        return (
          !serverId ||
          isClientEntityId(getClientEntityId(thread)) ||
          unifiedThreadIdentities.has(`thread:${serverId}`)
        );
      })
      .map((thread) => {
        const adapted = adaptLearningThreadToComment(thread);
        const serverId = getServerEntityId(thread);
        return serverId
          ? withSourceAwareIdentity(adapted, "thread", serverId)
          : adapted;
      });
    const unifiedThreads = visibleUnifiedDiscussionItems
      .filter((item) => item.sourceType === "thread")
      .filter(
        (item) =>
          !threads.some(
            (thread) => getServerEntityId(thread) === item.entityId,
          ),
      )
      .map((item) =>
        adaptUnifiedDiscussionItem(
          item,
          authorName,
          authorAvatar,
          currentUser?.id,
        ),
      );
    return [...threads, ...unifiedThreads];
  }, [
    authorAvatar,
    authorName,
    capabilities.allowComments,
    capabilities.allowQa,
    courseId,
    currentUser?.id,
    lessonId,
    legacyThreads,
    visibleUnifiedDiscussionItems,
  ]);

  const backendOrderedEntries = useMemo(
    () =>
      orderUnifiedDiscussionEntries(
        visibleUnifiedDiscussionItems,
        [...backendNotes, ...backendThreads],
        feedSort,
      ),
    [backendNotes, backendThreads, feedSort, visibleUnifiedDiscussionItems],
  );

  const storageBase = `veolms-learning-${persistenceKey}-discussion`;
  const [draft, setDraft] = useSessionStorageState<DiscussionDraft>(
    `${storageBase}-markdown-draft-v1`,
    initialDraft,
    isStoredDiscussionDraft,
  );
  const [composerAttachments, setComposerAttachments] = useState<
    LocalComposerAttachment[]
  >([]);
  const composerAttachmentsRef = useRef(composerAttachments);

  useEffect(() => {
    composerAttachmentsRef.current = composerAttachments;
  }, [composerAttachments]);

  useEffect(
    () => () => {
      composerAttachmentsRef.current.forEach(revokeLocalAttachmentPreview);
    },
    [],
  );

  const draftRef = useRef(draft);
  const isMountedRef = useRef(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // The editor reads its text only when it mounts, so a draft put back after
  // a failed post is shown by giving the new-entry editor a fresh identity.
  const [draftRestoreToken, setDraftRestoreToken] = useState(0);

  // A failed post used to leave only a toast: the composer had already been
  // emptied, so the text was gone. Put the submitted snapshot back, but only
  // into a composer that is still empty, so it never replaces newer input.
  const restoreSubmittedDraft = (
    submittedDraft: DiscussionDraft,
    submittedAttachments: readonly LocalComposerAttachment[],
  ) => {
    if (
      !isMountedRef.current ||
      hasDiscussionDraftContent(draftRef.current) ||
      composerAttachmentsRef.current.length > 0
    ) {
      return;
    }

    // The failed creation already released these previews, so a restored
    // image or video needs a new one.
    const restoredAttachments = submittedAttachments.map((attachment) =>
      attachment.localPreviewUrl
        ? {
            ...attachment,
            localPreviewUrl: URL.createObjectURL(attachment.file),
          }
        : attachment,
    );
    draftRef.current = submittedDraft;
    composerAttachmentsRef.current = restoredAttachments;
    setDraft(submittedDraft);
    setComposerAttachments(restoredAttachments);
    setDraftRestoreToken((current) => current + 1);
  };

  const sanitizeStoredEntries = (items: Comment[]): Comment[] =>
    items.filter((entry) => entry.entryKind !== "note");

  const [postedEntries, setPostedEntries] = useSessionStorageState<Comment[]>(
    `${storageBase}-markdown-entries-v1`,
    [],
    isStoredEntries,
    NO_LEGACY_KEYS,
    sanitizeStoredEntries,
  );
  const [entries, setEntries] = useState(initialEntries);

  useEffect(() => {
    if (isBackendMode || postedEntries.length === 0) return;
    const sanitizedEntries = sanitizeStoredEntries(postedEntries);
    if (sanitizedEntries.length !== postedEntries.length) {
      setPostedEntries(sanitizedEntries);
      return;
    }
    setEntries((current) => [
      ...sanitizedEntries.map((entry) => ({ ...entry, isOwn: true })),
      ...current.filter(
        (entry) =>
          !sanitizedEntries.some((persisted) => persisted.id === entry.id),
      ),
    ]);
  }, [isBackendMode, postedEntries, setPostedEntries]);

  const [editingEntry, setEditingEntry] = useState<EditingEntry | null>(null);
  const [openThread, setOpenThread] = useState<OpenDiscussionThread | null>(
    null,
  );
  const [reportingTarget, setReportingTarget] = useState<ReportTarget | null>(
    null,
  );
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [creationToast, setCreationToast] = useState<ToastMessage | null>(null);
  const activeDraft = editingEntry?.draft ?? draft;
  const activeEntryKind = editingEntry?.entryKind ?? entryKind;
  const activeVisibility = editingEntry?.visibility ?? visibility;
  const draftAttachmentCount = getDiscussionAttachmentCount(
    activeDraft.markdown,
  );
  const draftHasContent = hasDiscussionDraftContent(activeDraft);
  const draftIsTooLong =
    countCharacters(activeDraft.plainText) > DISCUSSION_COMMENT_CHARACTER_LIMIT;
  const canSubmitDraft =
    canParticipate &&
    draftHasContent &&
    !draftIsTooLong &&
    (isBackendMode ? Boolean(courseId) : true);

  useEffect(() => {
    if (isInteractionCapabilitiesLoading || enabledKinds.length === 0) return;
    const isCurrentFilterValid =
      (entryFilter === "all" && enabledKinds.length > 1) ||
      (entryFilter !== "all" &&
        (enabledKinds.includes(entryFilter) ||
          (entryFilter === "note" && hasNoteDeepLink)));

    if (!isCurrentFilterValid) {
      const fallback = enabledKinds.length > 1 ? "all" : enabledKinds[0]!;
      setEntryFilter(fallback);
    }
  }, [
    enabledKinds,
    entryFilter,
    hasNoteDeepLink,
    isInteractionCapabilitiesLoading,
  ]);

  useEffect(() => {
    if (!hasNoteDeepLink || !isThreadDeepLinkReady || !courseId || !lessonId) {
      return;
    }
    setEntryFilter("note");
  }, [courseId, hasNoteDeepLink, isThreadDeepLinkReady, lessonId]);

  useEffect(() => {
    if (enabledKinds.length === 0) return;
    if (!enabledKinds.includes(entryKind)) {
      setEntryKind(firstAvailableKind);
      setVisibility((current) =>
        getAllowedVisibility(firstAvailableKind, current),
      );
    }
  }, [enabledKinds, entryKind, firstAvailableKind]);

  const combinedEntries = useMemo<Comment[]>(() => {
    if (isBackendMode) {
      return backendOrderedEntries;
    }
    return [...backendNotes, ...entries];
  }, [backendOrderedEntries, backendNotes, entries, isBackendMode]);

  const feedCapabilities = useMemo<InteractionCapabilities>(
    () =>
      hasNoteDeepLink && !capabilities.allowNotes
        ? { ...capabilities, allowNotes: true }
        : capabilities,
    [capabilities, hasNoteDeepLink],
  );

  const dedupedBackendEntries = useMemo(
    () =>
      Array.from(
        new Map(
          combinedEntries.map((entry) => [getClientEntityId(entry), entry]),
        ).values(),
      ),
    [combinedEntries],
  );

  const filteredEntries = useMemo(() => {
    const entries = applyDiscussionFeed({
      entries: isBackendMode ? dedupedBackendEntries : combinedEntries,
      filter: entryFilter,
      sort: feedSort,
      capabilities: feedCapabilities,
      preserveOrder: isBackendMode,
    });
    // The server sends only the learner's own for "Mine". What this page
    // already holds from the other views is merged in beside that, so the
    // same rule is kept here.
    return feedMine ? entries.filter((entry) => entry.isOwn) : entries;
  }, [
    combinedEntries,
    dedupedBackendEntries,
    entryFilter,
    feedCapabilities,
    feedMine,
    feedSort,
    isBackendMode,
  ]);

  const allFeedPageSnapshotRef = useRef<Comment[] | null>(null);
  const allFeedPagePendingRef = useRef(false);
  const [, setIsAllFeedPagePending] = useState(false);

  const isAllNotesSourceEnabled = Boolean(
    courseId && lessonId && (capabilities.allowNotes || hasNoteDeepLink),
  );
  const isAllThreadsSourceEnabled = Boolean(shouldFetchThreads);
  const isAllInitialLoading = Boolean(
    isBackendMode &&
    entryFilter === "all" &&
    !retryingAfterError &&
    ((isAllNotesSourceEnabled && isNotesLoading) ||
      (isAllThreadsSourceEnabled && isThreadsLoading)),
  );

  const visibleEntries =
    entryFilter === "all" &&
    allFeedPagePendingRef.current &&
    allFeedPageSnapshotRef.current
      ? allFeedPageSnapshotRef.current
      : filteredEntries;

  const noteDeepLinkTargetEntry = useMemo(
    () =>
      noteDeepLinkId
        ? (backendNotes.find(
            (entry) => getServerEntityId(entry) === noteDeepLinkId,
          ) ?? null)
        : null,
    [backendNotes, noteDeepLinkId],
  );
  const handledNoteDeepLinkRef = useRef<string | null>(null);
  const [noteDeepLinkHandled, setNoteDeepLinkHandled] = useState(false);
  const noteDeepLinkIdentityRef = useRef<string | null>(null);
  useEffect(() => {
    if (noteDeepLinkIdentityRef.current === noteDeepLinkId) return;
    noteDeepLinkIdentityRef.current = noteDeepLinkId;
    handledNoteDeepLinkRef.current = null;
    setNoteDeepLinkHandled(false);
  }, [noteDeepLinkId]);
  const isNoteDeepLinkPending = Boolean(noteDeepLinkId && !noteDeepLinkHandled);
  const spotlightEntry = useMemo(() => {
    if (!spotlightThreadId) return null;
    const entry =
      visibleEntries.find(
        (candidate) => getServerEntityId(candidate) === spotlightThreadId,
      ) ??
      // The comment fetched on its own stands in while the list has not
      // reached it. Not under "My Discussions": there it is shown only when
      // the filtered list itself has it, so someone else's linked comment
      // stays out.
      (!feedMine &&
      directThreadComment &&
      getServerEntityId(directThreadComment) === spotlightThreadId
        ? directThreadComment
        : null);
    if (!entry) return null;
    return entryFilter === "all" || entryFilter === entry.entryKind
      ? entry
      : null;
  }, [
    directThreadComment,
    entryFilter,
    feedMine,
    spotlightThreadId,
    visibleEntries,
  ]);
  const displayEntries = isNoteDeepLinkPending
    ? visibleEntries.filter(
        (entry) => getServerEntityId(entry) === noteDeepLinkId,
      )
    : spotlightEntry
      ? [
          spotlightEntry,
          ...visibleEntries.filter(
            (entry) => getServerEntityId(entry) !== spotlightThreadId,
          ),
        ]
      : visibleEntries;
  const spotlightEntryClientId = spotlightEntry
    ? getClientEntityId(spotlightEntry)
    : null;
  const spotlitThreadRef = useRef<string | null>(null);
  const spotlightScrollRef = useRef<ReturnType<
    typeof keepEntryCentered
  > | null>(null);
  useEffect(
    () => () => {
      spotlightScrollRef.current?.stop();
      // Forget that the jump was made, so a re-run of the effects (which
      // React does in development, and on a remount) starts it again
      // instead of finding it "done" with its hold already stopped.
      spotlitThreadRef.current = null;
    },
    [],
  );
  const [highlightedThreadId, setHighlightedThreadId] = useState<string | null>(
    null,
  );
  const clearHighlightedThread = useCallback(
    () => setHighlightedThreadId(null),
    [],
  );
  // The comment shows as soon as it has loaded, ahead of the lesson and the
  // rest of the list, and the page jumps to it straight away. Everything
  // else then arrives around it: what loads above it keeps the height its
  // placeholder had, and the hold below only steps in if the comment still
  // ends up away from the middle of the screen.
  useEffect(() => {
    if (
      !spotlightThreadId ||
      !spotlightEntryClientId ||
      spotlitThreadRef.current === spotlightThreadId
    ) {
      return;
    }
    const target = document.getElementById(
      `discussion-entry-${spotlightEntryClientId}`,
    );
    if (!target) return;

    spotlitThreadRef.current = spotlightThreadId;
    spotlightScrollRef.current?.stop();
    spotlightScrollRef.current = keepEntryCentered(target.id, 100);
    // The card shows the highlight itself once it is on screen: the list is
    // virtualized, so the element found here may be replaced on the way.
    setHighlightedThreadId(spotlightThreadId);
  }, [
    displayEntries.length,
    isAllInitialLoading,
    isThreadsLoading,
    spotlightEntryClientId,
    spotlightThreadId,
  ]);
  // Once the lesson and the whole list are in, the hold is wound down. It
  // was already stopped if the visitor moved the page themselves.
  const isSpotlightPageReady =
    isThreadDeepLinkReady &&
    !isInteractionCapabilitiesLoading &&
    !isLessonDescriptionLoading &&
    !isAllInitialLoading &&
    !isThreadsLoading;
  const settledSpotlightRef = useRef<string | null>(null);
  useEffect(() => {
    if (
      !spotlightThreadId ||
      !spotlightEntryClientId ||
      !isSpotlightPageReady ||
      spotlitThreadRef.current !== spotlightThreadId ||
      settledSpotlightRef.current === spotlightThreadId
    ) {
      return;
    }
    settledSpotlightRef.current = spotlightThreadId;
    if (spotlightScrollRef.current?.isRunning()) {
      spotlightScrollRef.current.stop();
      spotlightScrollRef.current = keepEntryCentered(
        `discussion-entry-${spotlightEntryClientId}`,
        8,
      );
    }
  }, [isSpotlightPageReady, spotlightEntryClientId, spotlightThreadId]);
  // The link has done its work once the lesson route has found the lesson
  // (it reads these parameters to do so): a reload or a resumed session
  // should open the lesson normally, not highlight the comment again. The
  // address change asks the app to leave the scroll position alone.
  useEffect(() => {
    if (!spotlightIdFromUrl || !isThreadDeepLinkReady) return;
    setSearchParams(
      (prev) => {
        if (prev.get("thread") !== spotlightIdFromUrl) return prev;
        const next = new URLSearchParams(prev);
        next.delete("thread");
        next.delete("focus");
        return next;
      },
      { replace: true, state: withKeepScroll(window.history.state?.usr) },
    );
  }, [isThreadDeepLinkReady, setSearchParams, spotlightIdFromUrl]);
  const noteDeepLinkReadyForFocus = Boolean(
    noteDeepLinkId &&
    !noteDeepLinkHandled &&
    entryFilter === "note" &&
    !isDirectNoteLoading &&
    noteDeepLinkTargetEntry,
  );

  const consumeNoteDeepLink = useCallback(
    (handledNoteId: string) => {
      if (
        handledNoteDeepLinkRef.current === handledNoteId ||
        noteDeepLinkId !== handledNoteId
      ) {
        return;
      }
      handledNoteDeepLinkRef.current = handledNoteId;
      setNoteDeepLinkHandled(true);
      setSearchParams(
        (prev) => {
          if (prev.get("noteId") !== handledNoteId || !prev.has("thread")) {
            return prev;
          }
          const next = new URLSearchParams(prev);
          next.delete("thread");
          return next;
        },
        { replace: true },
      );
    },
    [noteDeepLinkId, setSearchParams],
  );

  const handleUnavailableNoteDeepLink = useCallback(() => {
    if (!noteDeepLinkId || handledNoteDeepLinkRef.current === noteDeepLinkId) {
      return;
    }
    handledNoteDeepLinkRef.current = noteDeepLinkId;
    setNotice("This note is no longer available.");
    setCreationToast({
      message: "This note is no longer available.",
      type: "error",
    });
    setSearchParams(
      (prev) => {
        if (prev.get("noteId") !== noteDeepLinkId) return prev;
        const next = new URLSearchParams(prev);
        next.delete("noteId");
        next.delete("thread");
        return next;
      },
      { replace: true },
    );
  }, [noteDeepLinkId, setSearchParams]);

  useEffect(() => {
    if (!noteDeepLinkId) {
      handledNoteDeepLinkRef.current = null;
      setNoteDeepLinkHandled(false);
      return;
    }
    if (!isThreadDeepLinkReady || !courseId || !lessonId) return;
    if (!isValidNoteDeepLink) {
      handleUnavailableNoteDeepLink();
      return;
    }
    if (isDirectNoteLoading || noteDeepLinkTargetEntry) return;
    if (isDirectNoteError || !directNoteData) {
      handleUnavailableNoteDeepLink();
    }
  }, [
    courseId,
    directNoteData,
    handleUnavailableNoteDeepLink,
    isDirectNoteError,
    isDirectNoteLoading,
    isThreadDeepLinkReady,
    isValidNoteDeepLink,
    lessonId,
    noteDeepLinkId,
    noteDeepLinkTargetEntry,
  ]);

  const loadMoreDiscussion = useCallback(async () => {
    if (
      allFeedPagePendingRef.current ||
      unifiedDiscussions.isFetchingNextPage ||
      !unifiedDiscussions.hasNextPage
    ) {
      return;
    }

    if (entryFilter === "all") {
      allFeedPagePendingRef.current = true;
      allFeedPageSnapshotRef.current = filteredEntries;
      setIsAllFeedPagePending(true);
    }

    try {
      await unifiedDiscussions.fetchNextPage();
    } finally {
      allFeedPagePendingRef.current = false;
      allFeedPageSnapshotRef.current = null;
      setIsAllFeedPagePending(false);
    }
  }, [entryFilter, filteredEntries, unifiedDiscussions]);

  useEffect(() => {
    if (entryFilter === "all" || !allFeedPagePendingRef.current) return;
    allFeedPagePendingRef.current = false;
    allFeedPageSnapshotRef.current = null;
    setIsAllFeedPagePending(false);
  }, [entryFilter]);

  const hasNextDiscussionPage =
    isBackendMode &&
    Boolean(unifiedDiscussions.hasNextPage) &&
    !unifiedDiscussions.isFetchNextPageError;
  const isFetchingNextDiscussionPage = unifiedDiscussions.isFetchingNextPage;
  const threadEntries = useMemo(() => {
    const list = combinedEntries.filter((entry) => entry.entryKind !== "note");
    if (!directThreadComment) {
      return Array.from(
        new Map(
          list.map((entry) => [getClientEntityId(entry), entry]),
        ).values(),
      );
    }
    const previousEntry = list.find((entry) =>
      threadEntriesShareIdentity(entry, directThreadComment),
    );
    if (!previousEntry) {
      return [directThreadComment, ...list];
    }
    const mergedEntry = mergeDirectThreadCommentIdentity(
      previousEntry,
      directThreadComment,
    );
    const nextList = list.map((entry) =>
      entry === previousEntry ? mergedEntry : entry,
    );
    return nextList;
  }, [combinedEntries, directThreadComment]);
  const isInitialThreadDeepLink = Boolean(
    initialThreadDeepLinkId && threadIdFromUrl === initialThreadDeepLinkId,
  );
  const isInitialThreadListPending = Boolean(
    isInitialThreadDeepLink &&
    isThreadDeepLinkReady &&
    (isInteractionCapabilitiesLoading ||
      (shouldFetchThreads && entryFilter !== "note" && isThreadsLoading)),
  );
  const isThreadDeepLinkPending = Boolean(
    isInitialThreadListPending ||
    (threadIdFromUrl &&
      isThreadDeepLinkReady &&
      !threadEntries.some(
        (entry) => getServerEntityId(entry) === threadIdFromUrl,
      ) &&
      (isDirectThreadLoading ||
        isThreadsLoading ||
        isInteractionCapabilitiesLoading)),
  );
  const lastHandledErrorThreadRef = useRef<string | null>(null);
  const suppressThreadUrlSyncRef = useRef(false);
  // Set while the address is on its way to a thread that was chosen here: a
  // swipe to the next one, or another picked from the list. The address
  // follows such a choice a moment later. Until it has, the effect below
  // would take the old address for an instruction and put the old thread
  // back, which made every swipe between threads spring back. `from` is the
  // address the choice started from.
  const pendingThreadAddressRef = useRef<{
    from: string | null;
    to: string;
  } | null>(null);
  const expectThreadAddress = (serverId: string | undefined) => {
    pendingThreadAddressRef.current =
      serverId && serverId !== threadIdFromUrl && !spotlightIdFromUrl
        ? { from: threadIdFromUrl ?? null, to: serverId }
        : null;
  };
  const threadPanelOpen =
    openThread !== null &&
    threadEntries.some(
      (entry) => getClientEntityId(entry) === String(openThread.id),
    );
  // The thread panel is put on the page with the first thread that is opened
  // and stays until it has finished sliding shut, so it animates both ways.
  const [threadPanelMounted, setThreadPanelMounted] = useState(false);
  if (threadPanelOpen && !threadPanelMounted) setThreadPanelMounted(true);
  const hasThreadEntries = threadEntries.length > 0;

  useEffect(() => {
    if (!hasThreadEntries && !canParticipate) return undefined;
    // A visitor who has asked their browser to save data only pays for
    // these when they are about to use them.
    const saveData =
      (navigator as Navigator & { connection?: { saveData?: boolean } })
        .connection?.saveData === true;
    if (saveData) return undefined;
    // Fetched once the lesson is idle: the thread panel, so the first thread
    // that is opened does not wait for its code, and the editor, so neither
    // a reply nor a new comment waits for theirs. Arriving while the panel
    // is opening, the editor and its styles more than doubled that wait.
    const warm = () => {
      if (hasThreadEntries) void loadDiscussionThreadPanel().catch(() => {});
      if (canParticipate) preloadDiscussionEditor();
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(warm, { timeout: 4000 });
      return () => window.cancelIdleCallback(handle);
    }
    const handle = window.setTimeout(warm, 2000);
    return () => window.clearTimeout(handle);
  }, [canParticipate, hasThreadEntries]);

  useEffect(() => {
    if (
      threadIdFromUrl &&
      (!isThreadDeepLinkReady || isInitialThreadListPending)
    )
      return;

    if (suppressThreadUrlSyncRef.current) {
      if (!threadIdFromUrl) {
        suppressThreadUrlSyncRef.current = false;
      }
      return;
    }

    const pendingThreadAddress = pendingThreadAddressRef.current;
    if (pendingThreadAddress) {
      // Still where the choice started from: the address has not caught up.
      if ((threadIdFromUrl ?? null) === pendingThreadAddress.from) return;
      pendingThreadAddressRef.current = null;
    }

    if (!threadIdFromUrl) {
      const selectedEntry = openThread
        ? threadEntries.find(
            (entry) => getClientEntityId(entry) === String(openThread.id),
          )
        : undefined;
      const selectedServerId = selectedEntry
        ? getServerEntityId(selectedEntry)
        : undefined;

      if (selectedEntry && isBackendMode) {
        if (isPendingClientEntity(selectedEntry)) return;
        if (selectedServerId) {
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              next.set("thread", selectedServerId);
              return next;
            },
            { replace: true, state: withKeepScroll(window.history.state?.usr) },
          );
          return;
        }
      }

      if (openThread !== null) {
        setOpenThread(null);
      }
      return;
    }

    if (
      openThread &&
      getServerEntityId(
        threadEntries.find(
          (entry) => getClientEntityId(entry) === String(openThread.id),
        ) ?? { id: openThread.id },
      ) === threadIdFromUrl
    ) {
      return;
    }

    const matchingEntry = threadEntries.find(
      (entry) => getServerEntityId(entry) === threadIdFromUrl,
    );

    if (matchingEntry) {
      setOpenThread({
        id: getClientEntityId(matchingEntry),
        focusComposer: false,
      });
      return;
    }

    if (!isBackendMode && !isInteractionCapabilitiesLoading) {
      if (lastHandledErrorThreadRef.current !== threadIdFromUrl) {
        lastHandledErrorThreadRef.current = threadIdFromUrl;
        setNotice("This discussion thread is unavailable or has been removed.");
        if (openThread !== null) {
          setOpenThread(null);
        }
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("thread");
            return next;
          },
          { replace: true, state: withKeepScroll(window.history.state?.usr) },
        );
      }
    }
  }, [
    isBackendMode,
    isInteractionCapabilitiesLoading,
    isInitialThreadListPending,
    isThreadDeepLinkReady,
    openThread,
    setSearchParams,
    threadEntries,
    threadIdFromUrl,
  ]);

  useEffect(() => {
    if (!threadIdFromUrl || !isBackendMode || !isThreadDeepLinkReady) {
      lastHandledErrorThreadRef.current = null;
      return;
    }

    const isDirectFetchFailed =
      isDirectThreadError ||
      (!isDirectThreadLoading &&
        directThreadData &&
        !isCommentOrQaThread(directThreadData));

    const selectedEntry = openThread
      ? threadEntries.find(
          (entry) => getClientEntityId(entry) === String(openThread.id),
        )
      : undefined;
    const selectedEntryIsValid = Boolean(
      selectedEntry &&
      (isPendingClientEntity(selectedEntry) ||
        getServerEntityId(selectedEntry) === threadIdFromUrl),
    );

    if (isDirectFetchFailed && !selectedEntryIsValid) {
      if (lastHandledErrorThreadRef.current !== threadIdFromUrl) {
        lastHandledErrorThreadRef.current = threadIdFromUrl;
        setNotice("This discussion thread is unavailable or has been removed.");
        if (openThread !== null) {
          setOpenThread(null);
        }
        setSearchParams(
          (prev) => {
            const next = new URLSearchParams(prev);
            next.delete("thread");
            return next;
          },
          { replace: true, state: withKeepScroll(window.history.state?.usr) },
        );
      }
    }
  }, [
    directThreadData,
    isBackendMode,
    isDirectThreadError,
    isDirectThreadLoading,
    isThreadDeepLinkReady,
    openThread,
    setSearchParams,
    threadEntries,
    threadIdFromUrl,
  ]);

  const submitEntry = async (
    onLocallyAccepted?: () => void,
  ): Promise<boolean> => {
    if (draftIsTooLong) {
      setNotice(COMMENT_LENGTH_NOTICE);
      return false;
    }

    if (!draftHasContent) return false;

    const submittedEntryKind = editingEntry?.entryKind ?? activeEntryKind;

    if (submittedEntryKind === "note") {
      if (!courseId || !lessonId) {
        setNotice("Course or lesson context is missing.");
        return false;
      }

      if (editingEntry) {
        const note = combinedEntries.find(
          (entry) => getClientEntityId(entry) === String(editingEntry.id),
        );
        const noteServerId = note ? getServerEntityId(note) : undefined;
        if (!noteServerId) {
          setNotice("This note is still being posted.");
          return false;
        }
        const noteClientId = note
          ? getClientEntityId(note)
          : String(editingEntry.id);
        if (optimisticEditCoordinator.isEditing("note", noteClientId)) {
          setNotice("This note is already being updated.");
          return false;
        }
        const baseline = {
          content: note?.content?.markdown ?? note?.text ?? "",
          plainText: note?.content?.plainText ?? note?.text ?? "",
          visibility: note?.visibility,
        };
        const optimistic = {
          content: activeDraft.markdown,
          plainText: activeDraft.plainText,
          visibility: activeVisibility,
        };
        try {
          const request = updateNoteMutation.mutateAsync({
            noteId: noteServerId,
            payload: {
              content: activeDraft.markdown,
              visibility: activeVisibility,
            },
            __optimistic: {
              clientId: noteClientId,
              serverId: noteServerId,
              baseline,
              optimistic,
            },
          });
          setEditingEntry(null);
          setNotice("");
          onLocallyAccepted?.();
          await request;
          return true;
        } catch (error) {
          setNotice("Failed to update note. Please try again.");
          return false;
        }
      }

      const localAttachments = [...composerAttachments];
      const notePayload = {
        courseId,
        lessonId,
        content: activeDraft.markdown,
        visibility: activeVisibility,
        ...(localAttachments.length > 0
          ? {
              __clientId: createClientEntityId("note"),
              __localAttachments: localAttachments,
            }
          : {}),
      } as const;

      const submittedDraft = activeDraft;

      try {
        const request = createNoteMutation.mutateAsync(notePayload);
        setDraft(createEmptyDiscussionDraft());
        setComposerAttachments([]);
        setNotice("");
        onLocallyAccepted?.();
        await request;
        return true;
      } catch (error) {
        restoreSubmittedDraft(submittedDraft, localAttachments);
        setCreationToast({
          message: "Couldn't save your note. Please try again.",
          type: "error",
        });
        return false;
      }
    }

    // Comment or Question/Q&A
    if (isBackendMode) {
      if (!courseId) {
        setNotice("Course context is missing.");
        return false;
      }

      const submittedVisibility = getAllowedVisibility(
        submittedEntryKind,
        activeVisibility,
      );
      const threadVisibility =
        submittedVisibility === "private" ? "public" : submittedVisibility;

      if (editingEntry) {
        const thread = combinedEntries.find(
          (entry) => getClientEntityId(entry) === String(editingEntry.id),
        );
        const threadServerId = thread ? getServerEntityId(thread) : undefined;
        if (!threadServerId) {
          setNotice("This discussion entry is still being posted.");
          return false;
        }
        const threadClientId = thread
          ? getClientEntityId(thread)
          : String(editingEntry.id);
        if (optimisticEditCoordinator.isEditing("thread", threadClientId)) {
          setNotice("This discussion entry is already being updated.");
          return false;
        }
        const baseline = {
          content: thread?.content?.markdown ?? thread?.text ?? "",
          plainText: thread?.content?.plainText ?? thread?.text ?? "",
          visibility: thread?.visibility,
        };
        const optimistic = {
          content: activeDraft.markdown,
          plainText: activeDraft.plainText,
          visibility: threadVisibility,
        };
        try {
          const request = updateThreadMutation.mutateAsync({
            threadId: threadServerId,
            payload: {
              content: activeDraft.markdown,
              visibility: threadVisibility,
            },
            __optimistic: {
              clientId: threadClientId,
              serverId: threadServerId,
              baseline,
              optimistic,
            },
          });
          setEditingEntry(null);
          setNotice("");
          onLocallyAccepted?.();
          await request;
          return true;
        } catch (error) {
          setNotice("Failed to update discussion entry. Please try again.");
          return false;
        }
      }

      const localAttachments = [...composerAttachments];
      const createPayload = {
        courseId,
        lessonId: lessonId || undefined,
        kind: activeEntryKind === "question" ? "question" : "comment",
        content: activeDraft.markdown,
        visibility: threadVisibility,
        ...(localAttachments.length > 0
          ? {
              __clientId: createClientEntityId("thread"),
              __localAttachments: localAttachments,
            }
          : {}),
      } as const;

      // Capture and clear the submitted snapshot before dispatch. The
      // coordinator retains the immutable payload for reconciliation and
      // future recovery; a failure must never restore over newer input.
      const submittedDraft = activeDraft;
      setDraft(createEmptyDiscussionDraft());
      setComposerAttachments([]);

      try {
        const request = createThreadMutation.mutateAsync(createPayload);
        onLocallyAccepted?.();
        await request;
        setNotice("");
        return true;
      } catch (error) {
        restoreSubmittedDraft(submittedDraft, localAttachments);
        setCreationToast({
          message:
            activeEntryKind === "question"
              ? "Couldn't post your question. Please try again."
              : "Couldn't post your comment. Please try again.",
          type: "error",
        });
        return false;
      }
    }

    // Standalone / offline mode
    const text = activeDraft.plainText.trim();
    const submittedVisibility = getAllowedVisibility(
      activeEntryKind,
      activeVisibility,
    );

    if (editingEntry) {
      const originalEntry = entries.find(
        (entry) => entry.id === editingEntry.id,
      );
      if (!originalEntry) {
        setEditingEntry(null);
        return false;
      }

      const updatedEntry: Comment = {
        ...originalEntry,
        text,
        content: activeDraft,
        visibility: submittedVisibility,
        entryKind: submittedEntryKind,
        isQuestion: submittedEntryKind === "question",
        time: "Just now (edited)",
      };
      const update = (current: Comment[]) =>
        current.map((entry) =>
          entry.id === updatedEntry.id ? updatedEntry : entry,
        );

      setEntries(update);
      setPostedEntries((current) =>
        current.some((entry) => entry.id === updatedEntry.id)
          ? update(current)
          : [updatedEntry, ...current],
      );
      setEditingEntry(null);
      setEntryFilter(
        enabledKinds.length > 1 ? "all" : (enabledKinds[0] ?? "all"),
      );
      setNotice("");
      return true;
    }

    const entry: Comment = {
      id: Date.now(),
      name: authorName,
      time: "Just now",
      avatar: authorAvatar,
      text,
      content: activeDraft,
      visibility: submittedVisibility,
      entryKind: activeEntryKind,
      likes: 0,
      replies: 0,
      isQuestion: activeEntryKind === "question",
      isOwn: true,
    };

    setPostedEntries((current) => [entry, ...current]);
    setEntries((current) => [entry, ...current]);
    setDraft(createEmptyDiscussionDraft());
    setEntryFilter(
      enabledKinds.length > 1 ? "all" : (enabledKinds[0] ?? "all"),
    );

    setNotice("");
    return true;
  };

  const onLike = (id: string | number, liked?: boolean) => {
    if (isBackendMode) {
      const entry =
        combinedEntries.find((e) => getClientEntityId(e) === String(id)) ??
        backendNotes.find((n) => getClientEntityId(n) === String(id)) ??
        backendThreads.find((t) => getClientEntityId(t) === String(id)) ??
        entries.find((e) => getClientEntityId(e) === String(id));
      const serverId = entry ? getServerEntityId(entry) : undefined;
      if (!entry) return;
      const isNote =
        entry.entryKind === "note" ||
        backendNotes.some((n) => getClientEntityId(n) === String(id));
      const targetType: "note" | "thread" = isNote ? "note" : "thread";
      const currentLiked = Boolean(entry?.liked);
      const desiredLiked = typeof liked === "boolean" ? liked : !currentLiked;

      if (!serverId) {
        desiredStateCoordinator.setLiked({
          targetType,
          targetId: getClientEntityId(entry),
          pendingTarget: true,
          desiredLiked,
          currentBaseline: currentLiked,
          lessonContext:
            courseId && lessonId ? { courseId, lessonId } : undefined,
          queryClient,
        });
        return;
      }

      if (isNote) {
        desiredStateCoordinator.setLiked({
          targetType: "note",
          targetId: getClientEntityId(entry),
          serverId,
          desiredLiked,
          currentBaseline: currentLiked,
          lessonContext:
            courseId && lessonId ? { courseId, lessonId } : undefined,
          queryClient,
        });
        return;
      }

      desiredStateCoordinator.setLiked({
        targetType,
        targetId: getClientEntityId(entry),
        serverId,
        desiredLiked,
        currentBaseline: currentLiked,
        lessonContext:
          courseId && lessonId ? { courseId, lessonId } : undefined,
        queryClient,
      });
      return;
    }

    const update = (current: Comment[]) =>
      current.map((entry) =>
        entry.id === id
          ? {
              ...entry,
              likes: Math.max(0, entry.likes + (liked ? 1 : -1)),
              liked,
            }
          : entry,
      );
    setEntries(update);
    setPostedEntries(update);
  };

  const beginEditingEntry = (entry: Comment) => {
    if (entry.entryKind === "note" && !capabilities.allowNotes) {
      setNotice("Note editing is disabled for this course.");
      return;
    }
    if (isBackendMode && !getServerEntityId(entry)) {
      setNotice("This discussion entry is still being posted.");
      return;
    }
    const editKind = entry.entryKind === "note" ? "note" : "thread";
    if (
      optimisticEditCoordinator.isEditing(editKind, getClientEntityId(entry))
    ) {
      setNotice("This discussion entry is already being updated.");
      return;
    }
    const entryKind =
      entry.entryKind ?? (entry.isQuestion ? "question" : "comment");
    setEditingEntry({
      id: entry.id,
      draft: entry.content ?? createDiscussionDraft(entry.text),
      entryKind,
      visibility: getAllowedVisibility(entryKind, entry.visibility ?? "public"),
    });
    setNotice("");
  };

  const deleteEntry = (id: string | number) => {
    const entry = combinedEntries.find(
      (candidate) => getClientEntityId(candidate) === String(id),
    );
    const serverId = entry ? getServerEntityId(entry) : undefined;
    if (isBackendMode && !serverId) {
      setNotice("This discussion entry is still being posted.");
      return;
    }
    const isBackendNote = entry?.entryKind === "note";
    if (isBackendNote && !capabilities.allowNotes) {
      setNotice("Note deletion is disabled for this course.");
      return;
    }
    const clientId = entry ? getClientEntityId(entry) : String(id);
    const deletionKind = isBackendNote ? "note" : "thread";
    const interactionCountKind: LessonInteractionCountKind | undefined = entry
      ? isBackendNote
        ? "note"
        : entry.entryKind === "question" || entry.isQuestion
          ? "question"
          : "comment"
      : undefined;
    let countsChange: LessonInteractionCountChange | undefined;
    if (
      isBackendMode &&
      optimisticEditCoordinator.isEditing(deletionKind, clientId)
    ) {
      setNotice("This discussion entry is already being updated.");
      return;
    }

    if (isBackendMode) {
      const transaction = optimisticDeletionCoordinator.begin({
        kind: deletionKind,
        clientId,
        serverId: serverId!,
        queryClient,
        commit: () =>
          isBackendNote
            ? deleteNoteMutation.mutateAsync(serverId!)
            : deleteThreadMutation.mutateAsync(serverId!),
        onBegin: () => {
          if (!queryClient || !courseId || !lessonId || !interactionCountKind)
            return;
          countsChange = applyLessonInteractionCountDelta(queryClient, {
            courseId,
            lessonId,
            kind: interactionCountKind,
            delta: -1,
          });
        },
        onRollback: () => {
          if (!queryClient || !courseId || !lessonId || !countsChange) return;
          restoreLessonInteractionCounts(
            queryClient,
            courseId,
            lessonId,
            countsChange,
          );
        },
        onFailure: () =>
          setNotice(
            isBackendNote
              ? "Couldn't delete this note. Please try again."
              : entry?.entryKind === "question"
                ? "Couldn't delete this question. Please try again."
                : "Couldn't delete this comment. Please try again.",
          ),
      });
      if (!transaction) return;
      setEditingEntry((current) => (current?.id === id ? null : current));
      setNotice("");
      if (!isBackendNote && openThread?.id === clientId) {
        suppressThreadUrlSyncRef.current = true;
        pendingThreadAddressRef.current = null;
        setOpenThread(null);
        setSearchParams(
          (prev) => {
            if (!prev.has("thread")) return prev;
            const next = new URLSearchParams(prev);
            next.delete("thread");
            return next;
          },
          { replace: true, state: withKeepScroll(window.history.state?.usr) },
        );
      }
      return;
    }

    const remove = (current: Comment[]) =>
      current.filter((entry) => entry.id !== id);
    setEntries(remove);
    setPostedEntries(remove);
    setEditingEntry((current) => (current?.id === id ? null : current));
    setNotice("");
  };

  const addReply = (entryId: string | number, reply: CommentReply) => {
    if (isBackendMode) return;
    const update = (current: Comment[]) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const thread = [...(entry.thread ?? []), reply];
        return {
          ...entry,
          thread,
          replies: Math.max(entry.replies ?? 0, thread.length),
        };
      });
    setEntries(update);
    setPostedEntries(update);
  };

  const editReply = (
    entryId: string | number,
    replyId: string | number,
    replyDraft: DiscussionDraft,
  ) => {
    if (isBackendMode) return;
    const update = (current: Comment[]) =>
      current.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              thread: entry.thread?.map((reply) =>
                reply.id === replyId
                  ? {
                      ...reply,
                      text: replyDraft.plainText.trim(),
                      content: replyDraft,
                      time: "Just now (edited)",
                    }
                  : reply,
              ),
            }
          : entry,
      );
    setEntries(update);
    setPostedEntries(update);
  };

  const deleteReply = (entryId: string | number, replyId: string | number) => {
    if (isBackendMode) return;
    const update = (current: Comment[]) =>
      current.map((entry) => {
        if (entry.id !== entryId) return entry;
        const thread = (entry.thread ?? []).filter(
          (reply) => reply.id !== replyId,
        );
        return {
          ...entry,
          thread,
          replies: Math.max(0, (entry.replies ?? thread.length) - 1),
        };
      });
    setEntries(update);
    setPostedEntries(update);
  };

  const handleToggleAcceptReply = async (
    threadId: string | number,
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
  ) => {
    const thread = combinedEntries.find(
      (entry) => getClientEntityId(entry) === String(threadId),
    );
    const threadIdStr = thread ? getServerEntityId(thread) : undefined;
    const replyIdStr = String(replyId);
    if (isBackendMode) {
      const authoritativeReplyId = serverReplyId ?? replyIdStr;
      if (!threadIdStr || isClientEntityId(authoritativeReplyId)) return;
      desiredStateCoordinator.setAcceptedAnswer({
        threadId: threadIdStr,
        desiredAcceptedReplyId: accepted ? authoritativeReplyId : null,
        currentBaselineReplyId: thread?.acceptedAnswerId ?? null,
        lessonContext:
          courseId && lessonId ? { courseId, lessonId } : undefined,
        queryClient: queryClient ?? undefined,
        onFailure: (err: any) => {
          setNotice(err?.message || "Failed to update accepted answer.");
        },
      });
    } else {
      const nextAcceptedId = accepted ? String(replyId) : null;
      const update = (current: Comment[]) =>
        current.map((entry) => {
          if (entry.id !== threadId) return entry;
          return {
            ...entry,
            acceptedAnswerId: nextAcceptedId,
            isSolved: Boolean(nextAcceptedId),
            thread: (entry.thread ?? []).map((r) => ({
              ...r,
              isAccepted: accepted
                ? String(r.id) === String(replyId)
                : String(r.id) === String(replyId)
                  ? false
                  : Boolean(r.isAccepted),
            })),
          };
        });
      setEntries(update);
      setPostedEntries(update);
    }
  };

  const handleToggleLockThread = async (
    threadId: string | number,
    locked: boolean,
  ) => {
    const thread = combinedEntries.find(
      (entry) => getClientEntityId(entry) === String(threadId),
    );
    const threadIdStr = thread ? getServerEntityId(thread) : undefined;
    if (isBackendMode) {
      if (!threadIdStr) return;
      desiredStateCoordinator.setLocked({
        threadId: threadIdStr,
        desiredLocked: locked,
        currentBaseline: !locked,
        lessonContext:
          courseId && lessonId ? { courseId, lessonId } : undefined,
        queryClient: queryClient ?? undefined,
        onFailure: (err: any) => {
          setNotice(err?.message || "Failed to update discussion lock status.");
        },
      });
    } else {
      const update = (current: Comment[]) =>
        current.map((entry) =>
          entry.id === threadId ? { ...entry, isLocked: locked } : entry,
        );
      setEntries(update);
      setPostedEntries(update);
    }
  };

  const handleToggleBookmark = async (
    threadId: string | number,
    bookmarked: boolean,
  ): Promise<boolean> => {
    const thread = combinedEntries.find(
      (entry) => getClientEntityId(entry) === String(threadId),
    );
    const threadIdStr = thread ? getServerEntityId(thread) : undefined;
    if (isBackendMode) {
      if (!thread) return false;
      if (thread.entryKind === "note") {
        if (!threadIdStr) return false;
        if (queryClient) {
          updateNoteBookmarkInCache(
            queryClient,
            threadIdStr,
            bookmarked,
            threadIdStr,
          );
        }
        try {
          await learningInteractionsService.toggleNoteBookmark(threadIdStr);
          return bookmarked;
        } catch (err: any) {
          if (queryClient) {
            updateNoteBookmarkInCache(
              queryClient,
              threadIdStr,
              !bookmarked,
              threadIdStr,
            );
          }
          setNotice(err?.message || "Failed to update note bookmark.");
          return !bookmarked;
        }
      }
      desiredStateCoordinator.setBookmarked({
        threadId: threadIdStr ?? getClientEntityId(thread),
        pendingTarget: !threadIdStr,
        desiredBookmarked: bookmarked,
        currentBaseline: !bookmarked,
        lessonContext:
          courseId && lessonId ? { courseId, lessonId } : undefined,
        queryClient: queryClient ?? undefined,
      });
      return bookmarked;
    } else {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === threadId
            ? { ...entry, isBookmarked: bookmarked }
            : entry,
        ),
      );
      setPostedEntries((current) =>
        current.map((entry) =>
          entry.id === threadId
            ? { ...entry, isBookmarked: bookmarked }
            : entry,
        ),
      );
      return bookmarked;
    }
  };

  const handleToggleFollow = async (
    threadId: string | number,
    following: boolean,
  ): Promise<boolean> => {
    const thread = combinedEntries.find(
      (entry) => getClientEntityId(entry) === String(threadId),
    );
    const threadIdStr = thread ? getServerEntityId(thread) : undefined;
    if (isBackendMode) {
      if (!thread) return false;
      desiredStateCoordinator.setFollowed({
        threadId: threadIdStr ?? getClientEntityId(thread),
        pendingTarget: !threadIdStr,
        desiredFollowed: following,
        currentBaseline: !following,
        lessonContext:
          courseId && lessonId ? { courseId, lessonId } : undefined,
        queryClient: queryClient ?? undefined,
      });
      return following;
    } else {
      setEntries((current) =>
        current.map((entry) =>
          entry.id === threadId ? { ...entry, isFollowing: following } : entry,
        ),
      );
      setPostedEntries((current) =>
        current.map((entry) =>
          entry.id === threadId ? { ...entry, isFollowing: following } : entry,
        ),
      );
      return following;
    }
  };

  const handleOpenReport = (
    target:
      | {
          targetType: "thread" | "reply";
          targetId: string | number;
          authorName?: string;
          serverId?: string;
        }
      | (string | number),
  ) => {
    if (typeof target === "object") {
      const targetId =
        target.targetType === "thread"
          ? getServerEntityId(
              combinedEntries.find(
                (entry) => getClientEntityId(entry) === String(target.targetId),
              ) ?? { id: target.targetId },
            )
          : target.serverId;
      if (!targetId || isClientEntityId(targetId)) return;
      setReportingTarget({
        targetType: target.targetType,
        targetId,
        authorName: target.authorName,
      });
    } else {
      const entry = combinedEntries.find(
        (candidate) => getClientEntityId(candidate) === String(target),
      );
      const targetId = entry ? getServerEntityId(entry) : String(target);
      if (!targetId || targetId.startsWith("client-thread-")) return;
      setReportingTarget({
        targetType: "thread",
        targetId,
      });
    }
    setReportDialogOpen(true);
  };

  const handleCloseReport = () => {
    if (!createReportMutation.isPending) {
      setReportDialogOpen(false);
      setReportingTarget(null);
    }
  };

  const handleSubmitReport = async (
    payload: ReportSubmissionPayload,
  ): Promise<boolean> => {
    if (isBackendMode) {
      try {
        await createReportMutation.mutateAsync({
          targetType: payload.targetType,
          targetId: payload.targetId,
          courseId: courseId || undefined,
          reason: payload.reason,
          details: payload.details,
        });
        setReportDialogOpen(false);
        setReportingTarget(null);
        setNotice("Report received. Our moderation team will review it.");
        return true;
      } catch (err: any) {
        throw err;
      }
    } else {
      setReportDialogOpen(false);
      setReportingTarget(null);
      setNotice("Report received. Our moderation team will review it.");
      return true;
    }
  };

  return (
    <section className="learning-discussion" aria-label="Lesson discussion">
      <ToastNotification
        message={creationToast}
        type="error"
        onDismiss={() => setCreationToast(null)}
      />
      <SearchHighlightProvider value={feedSearch}>
        <ThreadSurface
          scrollMemoryKey={persistenceKey}
          lessonDescription={lessonDescription}
          isLessonDescriptionLoading={isLessonDescriptionLoading}
          mobileLessonHeader={mobileLessonHeader}
          draft={activeDraft}
          draftRestoreToken={draftRestoreToken}
          entryKind={activeEntryKind}
          visibility={activeVisibility}
          editingEntryId={editingEntry?.id ?? null}
          notice={notice}
          entryFilter={entryFilter}
          feedView={feedView}
          canFilterMine={Boolean(currentUser)}
          search={discussionSearch}
          isSearchActive={Boolean(feedSearch)}
          isSearchPending={unifiedDiscussions.isPlaceholderData}
          onSearchChange={setDiscussionSearch}
          entries={displayEntries}
          noteDeepLinkTargetId={
            noteDeepLinkReadyForFocus ? noteDeepLinkId : null
          }
          onNoteDeepLinkHandled={consumeNoteDeepLink}
          linkedThreadId={spotlightEntry ? spotlightThreadId : null}
          highlightedThreadId={highlightedThreadId}
          onThreadHighlightShown={clearHighlightedThread}
          discussionCount={discussionCount}
          discussionCountSource={discussionCountSource}
          draftIsTooLong={draftIsTooLong}
          draftAttachmentCount={draftAttachmentCount}
          canSubmitDraft={canSubmitDraft}
          attachments={composerAttachments}
          onAttachmentsChange={setComposerAttachments}
          isNotesLoading={
            isNotesLoading ||
            Boolean(
              isNoteDeepLinkPending &&
              isValidNoteDeepLink &&
              isDirectNoteLoading &&
              !noteDeepLinkTargetEntry,
            )
          }
          isNotesError={isNotesError}
          onRetryNotes={() => refetchNotes()}
          onLoadMore={loadMoreDiscussion}
          onRetryNextPage={loadMoreDiscussion}
          hasNextPage={isNoteDeepLinkPending ? false : hasNextDiscussionPage}
          isFetchingNextPage={isFetchingNextDiscussionPage}
          isNextPageError={
            isNoteDeepLinkPending
              ? false
              : unifiedDiscussions.isFetchNextPageError
          }
          isThreadsLoading={isThreadsLoading}
          isThreadDeepLinkPending={isThreadDeepLinkPending}
          isAllInitialLoading={isAllInitialLoading}
          isThreadsError={isThreadsError}
          onRetryThreads={() => refetchThreads()}
          mobileBottomNavigation={mobileBottomNavigation}
          mobileBottomNavigationHidden={mobileBottomNavigationHidden}
          capabilities={capabilities}
          isInteractionCapabilitiesLoading={isInteractionCapabilitiesLoading}
          isAllDisabled={isAllDisabled}
          availableFilters={availableFilters}
          enabledKinds={enabledKinds}
          promptText={promptText}
          authorAvatar={authorAvatar}
          viewerKnown={Boolean(currentUser)}
          lessonContentAccess={lessonContentAccess}
          lessonContentAccessReason={lessonContentAccessReason}
          canParticipate={canParticipate}
          participationState={participationState}
          participationActionLabel={participationActionLabel}
          onParticipationAction={onParticipationAction}
          loginToParticipate={loginToParticipate}
          onDraftChange={(value) => {
            if (editingEntry) {
              setEditingEntry((current) =>
                current ? { ...current, draft: value } : current,
              );
            } else {
              setDraft(value);
            }
            setNotice(
              countCharacters(value.plainText) >
                DISCUSSION_COMMENT_CHARACTER_LIMIT
                ? COMMENT_LENGTH_NOTICE
                : "",
            );
          }}
          onEntryKindChange={(value) => {
            if (editingEntry) return;
            setEntryKind(value);
            setVisibility((current) => getAllowedVisibility(value, current));
          }}
          onVisibilityChange={(value) => {
            const allowedVisibility = getAllowedVisibility(
              activeEntryKind,
              value,
            );
            if (editingEntry) {
              setEditingEntry((current) =>
                current
                  ? { ...current, visibility: allowedVisibility }
                  : current,
              );
            } else {
              setVisibility(allowedVisibility);
            }
          }}
          onSubmit={submitEntry}
          onCancelEdit={() => setEditingEntry(null)}
          onEntryFilterChange={setEntryFilter}
          onFeedViewChange={setFeedView}
          onLike={onLike}
          onEdit={beginEditingEntry}
          onDelete={deleteEntry}
          onReport={handleOpenReport}
          onOpenThread={(id, focusComposer = false) => {
            const entry = combinedEntries.find(
              (candidate) => getClientEntityId(candidate) === String(id),
            );
            if (entry?.entryKind === "note") return;
            if (!entry) return;
            const clientId = getClientEntityId(entry);
            const serverId = getServerEntityId(entry);
            expectThreadAddress(serverId);
            setOpenThread({
              id: clientId,
              focusComposer: canParticipate && focusComposer,
            });
            setSearchParams(
              (prev) => {
                const next = new URLSearchParams(prev);
                if (serverId) next.set("thread", serverId);
                else next.delete("thread");
                return next;
              },
              {
                replace: true,
                state: withKeepScroll(window.history.state?.usr),
              },
            );
          }}
          isBackendMode={isBackendMode}
          currentUserId={currentUser?.id}
          canModerate={canModerate}
          onToggleAcceptReply={handleToggleAcceptReply}
          onToggleLockThread={handleToggleLockThread}
          onToggleBookmark={handleToggleBookmark}
          onToggleFollow={handleToggleFollow}
          onSeekToTimestamp={onSeekToTimestamp}
          onCopyTextNotice={setNotice}
          onReplyEditFailure={() =>
            setNotice("Failed to update reply. Please try again.")
          }
          onDeleteFailure={setNotice}
          courseId={courseId}
        />
      </SearchHighlightProvider>
      {threadPanelMounted ? (
        <Suspense fallback={null}>
          <DiscussionThreadPanel
            open={threadPanelOpen}
            onCloseComplete={() => setThreadPanelMounted(false)}
            activeEntryId={openThread?.id ?? null}
            entries={threadEntries}
            isBackendMode={isBackendMode}
            currentUserId={currentUser?.id}
            canModerate={canModerate}
            currentUser={{ name: authorName, avatar: authorAvatar }}
            canParticipate={canParticipate}
            participationState={participationState}
            participationActionLabel={participationActionLabel}
            onParticipationAction={onParticipationAction}
            courseId={courseId}
            lessonId={lessonId}
            focusComposerOnOpen={Boolean(openThread?.focusComposer)}
            onOpenChange={(open) => {
              if (!open) {
                suppressThreadUrlSyncRef.current = true;
                pendingThreadAddressRef.current = null;
                setOpenThread(null);
                setSearchParams(
                  (prev) => {
                    if (!prev.has("thread")) return prev;
                    const next = new URLSearchParams(prev);
                    next.delete("thread");
                    return next;
                  },
                  {
                    replace: true,
                    state: withKeepScroll(window.history.state?.usr),
                  },
                );
              }
            }}
            onActiveEntryChange={(id) => {
              const entry = threadEntries.find(
                (candidate) => getClientEntityId(candidate) === String(id),
              );
              const serverId = entry ? getServerEntityId(entry) : undefined;
              expectThreadAddress(serverId);
              setOpenThread((current) =>
                current ? { id, focusComposer: false } : current,
              );
              setSearchParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (serverId) next.set("thread", serverId);
                  else next.delete("thread");
                  return next;
                },
                {
                  replace: true,
                  state: withKeepScroll(window.history.state?.usr),
                },
              );
            }}
            onLike={onLike}
            onAddReply={addReply}
            onEditEntry={beginEditingEntry}
            onDeleteEntry={deleteEntry}
            onEditReply={editReply}
            onDeleteReply={deleteReply}
            onReport={handleOpenReport}
            onToggleAcceptReply={handleToggleAcceptReply}
            onToggleLockThread={handleToggleLockThread}
            onToggleBookmark={handleToggleBookmark}
            onToggleFollow={handleToggleFollow}
            onSeekToTimestamp={onSeekToTimestamp}
            onCopyTextNotice={setNotice}
            onReplyCreateError={() =>
              setCreationToast({
                message: "Couldn't post your reply. Please try again.",
                type: "error",
              })
            }
            onReplyEditError={() =>
              setNotice("Failed to update reply. Please try again.")
            }
            onReplyDeleteError={() =>
              setNotice("Couldn't delete this reply. Please try again.")
            }
          />
        </Suspense>
      ) : null}
      <DiscussionReportDialog
        open={reportDialogOpen}
        target={reportingTarget}
        courseId={courseId}
        onClose={handleCloseReport}
        onSubmit={handleSubmitReport}
        isSubmitting={Boolean(createReportMutation?.isPending)}
      />
    </section>
  );
}

function DiscussionRouterBridge(props: DiscussionProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const pageData = useRouteLoaderData("root") as
    AcademyStaticPageData | null | undefined;
  return (
    <DiscussionInner
      {...props}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
      builtLessonPage={pageData?.lessonPage}
    />
  );
}

function DiscussionFallbackBridge(props: DiscussionProps) {
  const [searchParams, setSearchParams] = useState(() => new URLSearchParams());
  const updateParams: SetURLSearchParams = useCallback((nextInit) => {
    setSearchParams((prev) => {
      if (typeof nextInit === "function") {
        return nextInit(prev);
      }
      return nextInit ? new URLSearchParams(nextInit) : new URLSearchParams();
    });
  }, []);
  return (
    <DiscussionInner
      {...props}
      searchParams={searchParams}
      setSearchParams={updateParams}
    />
  );
}

export function Discussion(props: DiscussionProps) {
  const inRouter = useInRouterContext();
  if (inRouter) {
    return <DiscussionRouterBridge {...props} />;
  }
  return <DiscussionFallbackBridge {...props} />;
}
