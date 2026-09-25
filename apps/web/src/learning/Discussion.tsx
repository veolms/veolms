import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
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
  defaultRangeExtractor,
  useVirtualizer,
  useWindowVirtualizer,
} from "@tanstack/react-virtual";
import { useInRouterContext, useSearchParams } from "react-router";
import { createPortal } from "react-dom";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import { ThemedSelect } from "../ThemedSelect";
import { ToastNotification, type ToastMessage } from "../ToastNotification";
import { CommentCard } from "./CommentCard";
import type { Comment, CommentReply } from "./CommentCard";
import { CommentComposer } from "./CommentComposer";
import { DiscussionAvatar } from "./DiscussionAvatar";
import { getApplicationScrollElement } from "../shell/applicationScroll";
import {
  applyDiscussionFeed,
  DISCUSSION_FEED_SORT_OPTIONS,
  getDiscussionCountForFilter,
  type DiscussionEntryFilter,
  type DiscussionFeedSort,
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
import { DiscussionThreadPanel } from "./DiscussionThreadPanel";
import {
  DESCRIPTION_SURFACE_BASE,
  LessonDescription,
} from "./LessonDescription";
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  getDiscussionAttachmentCount,
  hasDiscussionDraftContent,
  isDiscussionContent,
  isStoredDiscussionDraft,
  type DiscussionDraft,
  type DiscussionEntryKind,
  type DiscussionVisibility,
} from "./discussion-editor/types";
import {
  NO_LEGACY_KEYS,
  useSessionStorageState,
} from "./useSessionStorageState";
import { useCurrentUser } from "../services/auth";
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

const CURRENT_USER = {
  name: "Ashi Singh",
  avatar: "",
};

const EMPTY_MOBILE_COMPOSER_DRAFT = createEmptyDiscussionDraft();

function getCachedInteractionItems<T>(
  data: unknown,
  key: "notes" | "threads",
): T[] {
  if (!data || typeof data !== "object") return [];
  const cache = data as Record<string, unknown>;
  const pages = Array.isArray(cache.pages) ? cache.pages : [cache];
  return pages.flatMap((page) => {
    if (!page || typeof page !== "object") return [];
    const items = (page as Record<string, unknown>)[key];
    return Array.isArray(items) ? (items as T[]) : [];
  });
}

function getThreadIdentityValues(entry: Comment): string[] {
  return Array.from(
    new Set(
      [
        entry.clientId,
        entry.serverId,
        String(entry.id),
        getServerEntityId(entry),
      ].filter((value): value is string => Boolean(value)),
    ),
  );
}

export function threadEntriesShareIdentity(
  first: Comment,
  second: Comment,
): boolean {
  const secondIdentityValues = new Set(getThreadIdentityValues(second));
  return getThreadIdentityValues(first).some((value) =>
    secondIdentityValues.has(value),
  );
}

export function mergeDirectThreadCommentIdentity(
  existing: Comment,
  incoming: Comment,
): Comment {
  const clientId = getClientEntityId(existing);
  return {
    ...incoming,
    id: clientId,
    clientId,
    serverId: getServerEntityId(incoming) ?? getServerEntityId(existing),
  };
}

const initialEntries: Comment[] = [
  {
    id: 4,
    name: "Rohit Sharma",
    time: "2 hours ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "Great explanation! The way you broke down the design process makes it so much easier to understand. Especially the part about user empathy — super insightful!",
    entryKind: "comment",
    likes: 24,
    replies: 2,
    repliesExpanded: true,
    thread: [
      {
        id: 401,
        name: "Ashi Singh",
        time: "1 hour ago",
        avatar: "/assets/sofia-avatar-160.webp",
        text: "Thank you so much, Rohit! Really glad it helped.",
        likes: 12,
      },
      {
        id: 402,
        name: "Karan Mehta",
        time: "45 minutes ago",
        avatar: "/assets/ethan-avatar-160.webp",
        text: "Totally agree! The empathy part clicked for me too.",
        likes: 5,
      },
    ],
  },
  {
    id: 3,
    name: "Neha Patel",
    time: "3 hours ago",
    avatar: "/assets/sofia-avatar-160.webp",
    text: "Can you share some real-world examples of this process?",
    entryKind: "question",
    likes: 18,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 301,
        name: "Ashi Singh",
        time: "2 hours ago",
        avatar: "/assets/sofia-avatar-160.webp",
        text: "Absolutely — I’ll add a few examples from product discovery and usability testing.",
        likes: 7,
      },
    ],
  },
  {
    id: 1,
    name: "Vivek Nair",
    time: "1 day ago",
    avatar: "/assets/ethan-avatar-160.webp",
    text: "How do you know when you have enough user interviews to start mapping patterns?",
    entryKind: "question",
    likes: 11,
    replies: 1,
    isQuestion: true,
    thread: [
      {
        id: 101,
        name: "Karan Mehta",
        time: "21 hours ago",
        avatar: "/assets/ethan-avatar-160.webp",
        text: "When the same themes repeat and new interviews stop changing the shape of the problem.",
        likes: 7,
      },
    ],
  },
];

type ComposerMode = "collapsed" | "desktop" | "mobile";

const DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT = 0.62;
const DISCUSSION_VIRTUAL_OVERSCAN = 5;
const DISCUSSION_VIRTUAL_ESTIMATE_SIZE = 240;

export const getDiscussionComposerCollapsedSnapPoint = (
  viewportHeight: number,
  playerBottom: number | undefined,
) => {
  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    playerBottom === undefined ||
    !Number.isFinite(playerBottom)
  ) {
    return DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT;
  }

  return Math.max(2, Math.round(viewportHeight - playerBottom));
};

export const getDiscussionComposerViewportGeometry = (
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
  playerBottom: number | undefined,
) => {
  const resolvedLayoutViewportHeight =
    Number.isFinite(layoutViewportHeight) && layoutViewportHeight > 0
      ? layoutViewportHeight
      : visualViewportHeight;
  const rawVisualViewportHeight =
    Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
      ? visualViewportHeight
      : resolvedLayoutViewportHeight;
  const resolvedVisualViewportHeight = Math.min(
    resolvedLayoutViewportHeight,
    rawVisualViewportHeight,
  );
  const resolvedVisualViewportOffsetTop = Math.min(
    Math.max(
      0,
      Number.isFinite(visualViewportOffsetTop) ? visualViewportOffsetTop : 0,
    ),
    Math.max(0, resolvedLayoutViewportHeight - resolvedVisualViewportHeight),
  );
  const visualViewportBottom =
    resolvedVisualViewportOffsetTop + resolvedVisualViewportHeight;

  return {
    collapsedSnapPoint: getDiscussionComposerCollapsedSnapPoint(
      visualViewportBottom,
      playerBottom,
    ),
    keyboardInset: Math.max(
      0,
      Math.round(resolvedLayoutViewportHeight - visualViewportBottom),
    ),
    visualViewportHeight: Math.max(2, Math.round(resolvedVisualViewportHeight)),
  };
};

export interface DiscussionProps {
  persistenceKey: string;
  courseSlug?: string;
  courseId?: string;
  lessonId?: string;
  mobileLessonHeader?: React.ReactNode;
  mobileBottomNavigation?: boolean;
  mobileBottomNavigationHidden?: boolean;
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  interactionCapabilities?: InteractionCapabilities;
  isInteractionCapabilitiesLoading?: boolean;
  isThreadDeepLinkReady?: boolean;
  noteDeepLinkId?: string | null;
  onSeekToTimestamp?: (seconds: number) => void;
}

const DEFAULT_CAPABILITIES: InteractionCapabilities = {
  allowComments: true,
  allowNotes: true,
  allowQa: true,
};

export const DISCUSSION_COMMENT_CHARACTER_LIMIT = 10_000;
const COMMENT_LENGTH_NOTICE = `Comments, Q&As, and notes can be up to ${DISCUSSION_COMMENT_CHARACTER_LIMIT.toLocaleString("en-US")} characters.`;
const initialDraft = createEmptyDiscussionDraft();
const countCharacters = (value: string) => Array.from(value).length;

interface EditingEntry {
  id: string | number;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
}

interface OpenDiscussionThread {
  id: string | number;
  focusComposer: boolean;
}

const isDiscussionEntryKind = (value: unknown): value is DiscussionEntryKind =>
  value === "comment" || value === "question" || value === "note";

const isDiscussionVisibility = (
  value: unknown,
): value is DiscussionVisibility =>
  value === "public" || value === "private" || value === "unlisted";

const getAllowedVisibility = (
  entryKind: DiscussionEntryKind,
  visibility: DiscussionVisibility,
): DiscussionVisibility =>
  entryKind !== "note" && visibility === "private" ? "public" : visibility;

const NOTE_DEEP_LINK_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidNoteDeepLinkId(value: string | null): value is string {
  return Boolean(value && NOTE_DEEP_LINK_ID_PATTERN.test(value));
}

const isStoredEntries = (value: unknown): value is Comment[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      Boolean(entry) &&
      typeof entry === "object" &&
      (typeof (entry as Comment).id === "number" ||
        typeof (entry as Comment).id === "string") &&
      typeof (entry as Comment).name === "string" &&
      typeof (entry as Comment).time === "string" &&
      typeof (entry as Comment).avatar === "string" &&
      typeof (entry as Comment).text === "string" &&
      typeof (entry as Comment).likes === "number" &&
      (typeof (entry as Comment).entryKind === "undefined" ||
        isDiscussionEntryKind((entry as Comment).entryKind)) &&
      (typeof (entry as Comment).content === "undefined" ||
        isDiscussionContent((entry as Comment).content)) &&
      (typeof (entry as Comment).visibility === "undefined" ||
        isDiscussionVisibility((entry as Comment).visibility)) &&
      (typeof (entry as Comment).liked === "undefined" ||
        typeof (entry as Comment).liked === "boolean") &&
      (typeof (entry as Comment).isBookmarked === "undefined" ||
        typeof (entry as Comment).isBookmarked === "boolean") &&
      (typeof (entry as Comment).isFollowing === "undefined" ||
        typeof (entry as Comment).isFollowing === "boolean") &&
      (typeof (entry as Comment).isOwn === "undefined" ||
        typeof (entry as Comment).isOwn === "boolean"),
  );

type SetURLSearchParams = (
  nextInit?: URLSearchParams | ((prev: URLSearchParams) => URLSearchParams),
  navigateOpts?: { replace?: boolean },
) => void;

interface DiscussionInnerProps extends DiscussionProps {
  searchParams: URLSearchParams;
  setSearchParams: SetURLSearchParams;
}

function DiscussionInner({
  persistenceKey,
  courseSlug,
  courseId,
  lessonId,
  mobileLessonHeader,
  mobileBottomNavigation = false,
  mobileBottomNavigationHidden = false,
  lessonDescription,
  isLessonDescriptionLoading = false,
  interactionCapabilities,
  isInteractionCapabilitiesLoading = false,
  isThreadDeepLinkReady = true,
  noteDeepLinkId = null,
  onSeekToTimestamp,
  searchParams,
  setSearchParams,
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
  const [feedSort, setFeedSort] = useState<DiscussionFeedSort>("newest");

  const { data: interactionCounts } = useLessonInteractionCounts(
    courseId,
    lessonId,
    {
      enabled: !isInteractionCapabilitiesLoading && enabledKinds.length > 0,
    },
  );
  const discussionCount = interactionCounts
    ? getDiscussionCountForFilter(interactionCounts, entryFilter)
    : undefined;

  const threadQuery = useMemo(
    () => ({
      kind:
        entryFilter === "comment" || entryFilter === "question"
          ? entryFilter
          : "all" as const,
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

  const {
    data: notesData,
  } = useUserNotes(
    notesQuery,
    {
      // The unified lesson-discussions query is the only remote feed source.
      // This query remains mounted as a cache observer for existing optimistic
      // interaction projections.
      enabled: false,
    },
  ) ?? {};

  const {
    data: directNoteData,
    isLoading: isDirectNoteLoading,
    isError: isDirectNoteError,
  } = useNoteDetails(noteDeepLinkId ?? undefined, {
    enabled: Boolean(
      isValidNoteDeepLink &&
        isThreadDeepLinkReady &&
        courseId &&
        lessonId,
    ),
  });

  const shouldFetchThreads = Boolean(
    courseId &&
    lessonId &&
    (capabilities.allowComments || capabilities.allowQa),
  );

  const {
    data: threadsData,
  } = useLessonThreads(
    courseId ?? "",
    lessonId ?? "",
    threadQuery,
    {
      // See the notes observer above. Keeping this cache observer active lets
      // existing creation/edit/like/delete projections stay reactive.
      enabled: false,
    },
  ) ?? {};

  const unifiedDiscussionQuery = useMemo(
    () => ({
      kind:
        entryFilter === "comment" ||
        entryFilter === "question" ||
        entryFilter === "note"
          ? entryFilter
          : ("all" as const),
      sort: feedSort === "top" ? ("top" as const) : ("newest" as const),
    }),
    [entryFilter, feedSort],
  );
  const unifiedDiscussions = useLessonDiscussions(
    courseId ?? "",
    lessonId ?? "",
    unifiedDiscussionQuery,
    {
      enabled: Boolean(
        courseId &&
          lessonId &&
          !isInteractionCapabilitiesLoading &&
          (enabledKinds.length > 0 || hasNoteDeepLink),
      ),
    },
  );
  const unifiedDiscussionItems = useMemo<LessonDiscussionItem[]>(
    () =>
      unifiedDiscussions.data?.pages.flatMap((page) => page.items) ?? [],
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
    [deletionRevision, unifiedDiscussionItems],
  );
  useEffect(() => {
    unifiedRemoteBaseRef.current.clear();
  }, [courseId, currentUser?.id, lessonId]);
  const isNotesLoading =
    unifiedDiscussions.isLoading &&
    (entryFilter === "all" || entryFilter === "note");
  const isThreadsLoading =
    unifiedDiscussions.isLoading && entryFilter !== "note";
  const isNotesError =
    unifiedDiscussions.isError &&
    (entryFilter === "all" || entryFilter === "note");
  const isThreadsError =
    unifiedDiscussions.isError && entryFilter !== "note";
  const refetchNotes = unifiedDiscussions.refetch;
  const refetchThreads = unifiedDiscussions.refetch;

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

  const currentUserRole = useMemo(() => {
    if (!currentUser?.roles) return "Student";
    const lowerRoles = currentUser.roles.map((r) => r.toLowerCase());
    if (lowerRoles.includes("admin")) return "Admin";
    if (
      lowerRoles.includes("instructor") ||
      lowerRoles.includes("creator") ||
      lowerRoles.includes("teacher")
    ) {
      return "Instructor";
    }
    return "Student";
  }, [currentUser?.roles]);

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
        (item.sourceType === "thread" ? item.thread : item.note) as unknown as Readonly<
          Record<string, unknown>
        >,
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
          (!serverId || isClientEntityId(getClientEntityId(note))) ||
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
          !notes.some(
            (note) => getServerEntityId(note) === item.entityId,
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
  const threadIdFromUrl =
    rawThreadId && rawThreadId.trim().length > 0 ? rawThreadId.trim() : null;
  const initialThreadDeepLinkId = useState<string | null>(
    () => threadIdFromUrl,
  )[0];

  const {
    data: directThreadData,
    isLoading: isDirectThreadLoading,
    isError: isDirectThreadError,
  } = useThreadDetails(threadIdFromUrl ?? "", {
    enabled: Boolean(
      threadIdFromUrl &&
      isBackendMode &&
      isThreadDeepLinkReady &&
      courseId &&
      lessonId,
    ),
  });

  const directThreadComment = useMemo<Comment | null>(() => {
    if (!directThreadData || !isCommentOrQaThread(directThreadData))
      return null;
    return withSourceAwareIdentity(
      adaptLearningThreadToComment(directThreadData, currentUser?.id),
      "thread",
      directThreadData.id,
    );
  }, [currentUser?.id, directThreadData]);

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
        const adapted = adaptLearningThreadToComment(thread, currentUser?.id);
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
      orderUnifiedDiscussionEntries(visibleUnifiedDiscussionItems, [
        ...backendNotes,
        ...backendThreads,
      ]),
    [backendNotes, backendThreads, visibleUnifiedDiscussionItems],
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
    if (
      !hasNoteDeepLink ||
      !isThreadDeepLinkReady ||
      !courseId ||
      !lessonId
    ) {
      return;
    }
    setEntryFilter("note");
  }, [
    courseId,
    hasNoteDeepLink,
    isThreadDeepLinkReady,
    lessonId,
  ]);

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

  const filteredEntries = useMemo(
    () =>
      applyDiscussionFeed({
        entries: isBackendMode ? dedupedBackendEntries : combinedEntries,
        filter: entryFilter,
        sort: feedSort,
        capabilities: feedCapabilities,
        preserveOrder: isBackendMode,
      }),
    [
      combinedEntries,
      dedupedBackendEntries,
      entryFilter,
      feedCapabilities,
      feedSort,
      isBackendMode,
    ],
  );

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
        ? backendNotes.find(
            (entry) => getServerEntityId(entry) === noteDeepLinkId,
          ) ?? null
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
  const isNoteDeepLinkPending = Boolean(
    noteDeepLinkId && !noteDeepLinkHandled,
  );
  const displayEntries = isNoteDeepLinkPending
    ? visibleEntries.filter(
        (entry) => getServerEntityId(entry) === noteDeepLinkId,
      )
    : visibleEntries;
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
          if (
            prev.get("noteId") !== handledNoteId ||
            !prev.has("thread")
          ) {
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
  }, [
    entryFilter,
    filteredEntries,
    unifiedDiscussions,
  ]);

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
    initialThreadDeepLinkId &&
      threadIdFromUrl === initialThreadDeepLinkId,
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
            { replace: true },
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
          { replace: true },
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
          { replace: true },
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

      try {
        const request = createNoteMutation.mutateAsync(notePayload);
        setDraft(createEmptyDiscussionDraft());
        setComposerAttachments([]);
        setNotice("");
        onLocallyAccepted?.();
        await request;
        return true;
      } catch (error) {
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
      setDraft(createEmptyDiscussionDraft());
      setComposerAttachments([]);

      try {
        const request = createThreadMutation.mutateAsync(createPayload);
        onLocallyAccepted?.();
        await request;
        setNotice("");
        return true;
      } catch (error) {
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
    const interactionCountKind: LessonInteractionCountKind | undefined =
      entry
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
          if (!queryClient || !courseId || !lessonId || !countsChange)
            return;
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
        setOpenThread(null);
        setSearchParams(
          (prev) => {
            if (!prev.has("thread")) return prev;
            const next = new URLSearchParams(prev);
            next.delete("thread");
            return next;
          },
          { replace: true },
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
          if (queryClient) {
            void queryClient.invalidateQueries({
              queryKey: ["learning-notes"],
            });
            void queryClient.invalidateQueries({
              queryKey: ["learning-course-notes-overview"],
            });
          }
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
      <ThreadSurface
        lessonDescription={lessonDescription}
        isLessonDescriptionLoading={isLessonDescriptionLoading}
        mobileLessonHeader={mobileLessonHeader}
        draft={activeDraft}
        entryKind={activeEntryKind}
        visibility={activeVisibility}
        editingEntryId={editingEntry?.id ?? null}
        notice={notice}
        entryFilter={entryFilter}
        feedSort={feedSort}
        entries={displayEntries}
        noteDeepLinkTargetId={
          noteDeepLinkReadyForFocus ? noteDeepLinkId : null
        }
        onNoteDeepLinkHandled={consumeNoteDeepLink}
        discussionCount={discussionCount}
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
              current ? { ...current, visibility: allowedVisibility } : current,
            );
          } else {
            setVisibility(allowedVisibility);
          }
        }}
        onSubmit={submitEntry}
        onCancelEdit={() => setEditingEntry(null)}
        onEntryFilterChange={setEntryFilter}
        onFeedSortChange={setFeedSort}
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
          setOpenThread({ id: clientId, focusComposer });
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              if (serverId) next.set("thread", serverId);
              else next.delete("thread");
              return next;
            },
            { replace: true },
          );
        }}
        isBackendMode={isBackendMode}
        currentUserId={currentUser?.id}
        userRole={currentUserRole}
        onToggleAcceptReply={handleToggleAcceptReply}
        onToggleLockThread={handleToggleLockThread}
        onToggleBookmark={handleToggleBookmark}
        onToggleFollow={handleToggleFollow}
        onSeekToTimestamp={onSeekToTimestamp}
        onReplyEditFailure={() =>
          setNotice("Failed to update reply. Please try again.")
        }
        onDeleteFailure={setNotice}
        courseId={courseId}
      />
      <DiscussionThreadPanel
        open={
          openThread !== null &&
          threadEntries.some(
            (entry) => getClientEntityId(entry) === String(openThread.id),
          )
        }
        activeEntryId={openThread?.id ?? null}
        entries={threadEntries}
        isBackendMode={isBackendMode}
        currentUserId={currentUser?.id}
        userRole={currentUserRole}
        currentUser={{ name: authorName, avatar: authorAvatar }}
        courseId={courseId}
        focusComposerOnOpen={Boolean(openThread?.focusComposer)}
        onOpenChange={(open) => {
          if (!open) {
            suppressThreadUrlSyncRef.current = true;
            setOpenThread(null);
            setSearchParams(
              (prev) => {
                if (!prev.has("thread")) return prev;
                const next = new URLSearchParams(prev);
                next.delete("thread");
                return next;
              },
              { replace: true },
            );
          }
        }}
        onActiveEntryChange={(id) => {
          setOpenThread((current) =>
            current ? { id, focusComposer: false } : current,
          );
          setSearchParams(
            (prev) => {
              const next = new URLSearchParams(prev);
              const entry = threadEntries.find(
                (candidate) => getClientEntityId(candidate) === String(id),
              );
              const serverId = entry ? getServerEntityId(entry) : undefined;
              if (serverId) next.set("thread", serverId);
              else next.delete("thread");
              return next;
            },
            { replace: true },
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
  return (
    <DiscussionInner
      {...props}
      searchParams={searchParams}
      setSearchParams={setSearchParams}
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

interface ThreadSurfaceProps {
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  mobileLessonHeader?: React.ReactNode;
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: string | number | null;
  notice: string;
  entryFilter: DiscussionEntryFilter;
  feedSort: DiscussionFeedSort;
  entries: Comment[];
  noteDeepLinkTargetId?: string | null;
  onNoteDeepLinkHandled?: (noteId: string) => void;
  discussionCount?: number;
  draftIsTooLong: boolean;
  draftAttachmentCount: number;
  canSubmitDraft: boolean;
  isSubmitting?: boolean;
  isNotesLoading?: boolean;
  isNotesError?: boolean;
  onRetryNotes?: () => void;
  onLoadMore?: () => Promise<void>;
  onRetryNextPage?: () => Promise<void>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isNextPageError?: boolean;
  isThreadsLoading?: boolean;
  isThreadDeepLinkPending?: boolean;
  isAllInitialLoading?: boolean;
  isThreadsError?: boolean;
  onRetryThreads?: () => void;
  mobileBottomNavigation: boolean;
  mobileBottomNavigationHidden: boolean;
  capabilities: InteractionCapabilities;
  isInteractionCapabilitiesLoading?: boolean;
  isAllDisabled: boolean;
  availableFilters: readonly (readonly [DiscussionEntryFilter, string])[];
  enabledKinds: DiscussionEntryKind[];
  promptText: string;
  authorAvatar?: string | null;
  attachments?: LocalComposerAttachment[];
  onAttachmentsChange?: (attachments: LocalComposerAttachment[]) => void;
  onDraftChange: (value: DiscussionDraft) => void;
  onEntryKindChange: (value: DiscussionEntryKind) => void;
  onVisibilityChange: (value: DiscussionVisibility) => void;
  onSubmit: (onLocallyAccepted?: () => void) => Promise<boolean> | void;
  onCancelEdit: () => void;
  onEntryFilterChange: (filter: DiscussionEntryFilter) => void;
  onFeedSortChange: (sort: DiscussionFeedSort) => void;
  onLike: (id: string | number, liked: boolean) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (id: string | number) => void;
  onReport: (
    target:
      | {
          targetType: "thread" | "reply";
          targetId: string | number;
          authorName?: string;
          serverId?: string;
        }
      | (string | number),
  ) => void;
  onOpenThread: (id: string | number, focusComposer?: boolean) => void;
  isBackendMode?: boolean;
  currentUserId?: string;
  userRole?: string;
  onToggleAcceptReply?: (
    threadId: string | number,
    replyId: string | number,
    accepted: boolean,
  ) => void;
  onToggleLockThread?: (threadId: string | number, locked: boolean) => void;
  onToggleBookmark?: (
    threadId: string | number,
    bookmarked: boolean,
  ) => Promise<boolean> | void;
  onToggleFollow?: (
    threadId: string | number,
    following: boolean,
  ) => Promise<boolean> | void;
  onSeekToTimestamp?: (seconds: number) => void;
  onReplyEditFailure?: () => void;
  onDeleteFailure?: (message: string) => void;
  courseId?: string;
}

export function shouldShowDiscussionEnd({
  isBackendMode,
  entryFilter,
  entryCount,
  hasNextPage,
  isNextPageError,
  isNotesLoading,
  isThreadsLoading,
}: {
  isBackendMode: boolean;
  entryFilter: DiscussionEntryFilter;
  entryCount: number;
  hasNextPage: boolean;
  isNextPageError?: boolean;
  isNotesLoading: boolean;
  isThreadsLoading: boolean;
}): boolean {
  if (
    !isBackendMode ||
    entryCount === 0 ||
    hasNextPage ||
    isNextPageError
  ) {
    return false;
  }
  if (entryFilter === "all") {
    return !isNotesLoading && !isThreadsLoading;
  }
  return entryFilter === "note" ? !isNotesLoading : !isThreadsLoading;
}

type DiscussionVirtualItem = {
  index: number;
  start: number;
  size: number;
  end: number;
};

type DiscussionVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => DiscussionVirtualItem[];
  scrollOffset: number | null;
  measureElement: (element: HTMLDivElement | null) => void;
};

type DiscussionVirtualFeedProps = {
  entries: Comment[];
  protectedEntryIndices: ReadonlySet<number>;
  renderEntry: (entry: Comment) => React.ReactNode;
  layoutKey?: string;
};

function useDiscussionRangeExtractor(
  entries: Comment[],
  protectedEntryIndices: ReadonlySet<number>,
) {
  return useCallback(
    (range: Parameters<typeof defaultRangeExtractor>[0]) => {
      const indices = new Set(defaultRangeExtractor(range));
      protectedEntryIndices.forEach((index) => {
        if (index >= 0 && index < entries.length) indices.add(index);
      });
      return Array.from(indices).sort((left, right) => left - right);
    },
    [entries.length, protectedEntryIndices],
  );
}

function DiscussionVirtualFeedRows({
  feedRef,
  entries,
  renderEntry,
  virtualizer,
  scrollMargin = 0,
}: DiscussionVirtualFeedProps & {
  feedRef?: React.Ref<HTMLDivElement>;
  virtualizer: DiscussionVirtualizer;
  scrollMargin?: number;
}) {
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      data-discussion-virtual-feed
      data-entry-count={entries.length}
      ref={feedRef}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
      className="relative w-full shrink-0"
    >
      {virtualItems.map((virtualItem) => {
        const entry = entries[virtualItem.index];
        if (!entry) return null;
        return (
          <div
            key={getClientEntityId(entry)}
            data-index={virtualItem.index}
            data-client-id={getClientEntityId(entry)}
            ref={virtualizer.measureElement}
            className={
              virtualItem.index < entries.length - 1 ? "pb-1" : ""
            }
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              width: "100%",
              transform: `translateY(${virtualItem.start - scrollMargin}px)`,
            }}
          >
            {renderEntry(entry)}
          </div>
        );
      })}
    </div>
  );
}

function DiscussionViewportVirtualFeed({
  viewportRef,
  ...props
}: DiscussionVirtualFeedProps & {
  viewportRef: React.RefObject<HTMLDivElement | null>;
}) {
  const rangeExtractor = useDiscussionRangeExtractor(
    props.entries,
    props.protectedEntryIndices,
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const phoneScrollMargin = useDiscussionPhoneVirtualFeedScrollMargin(
    feedRef,
    viewportRef,
  );

  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: () => viewportRef.current,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor,
    scrollMargin: phoneScrollMargin,
  });

  return (
    <>
      <DiscussionVirtualFeedRows
        {...props}
        feedRef={feedRef}
        virtualizer={{
          ...virtualizer,
          measureElement: (element) =>
            virtualizer.measureElement(element),
        }}
        scrollMargin={phoneScrollMargin}
      />
    </>
  );
}

function getDiscussionVirtualFeedScrollMargin(
  feed: HTMLDivElement | null,
  scrollport: HTMLElement | null,
): number {
  if (!feed || typeof window === "undefined") return 0;

  const feedRect = feed.getBoundingClientRect();
  if (scrollport) {
    return (
      feedRect.top -
      scrollport.getBoundingClientRect().top +
      scrollport.scrollTop
    );
  }

  return feedRect.top + window.scrollY;
}

function useDiscussionPhoneVirtualFeedScrollMargin(
  feedRef: React.RefObject<HTMLDivElement | null>,
  viewportRef: React.RefObject<HTMLDivElement | null>,
) {
  const [phoneScrollMargin, setPhoneScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const scrollport = viewportRef.current;
    const header = scrollport?.querySelector<HTMLElement>(
      "[data-discussion-scroll-header]",
    );
    if (!scrollport || !header) return undefined;

    const syncScrollMargin = () => {
      const nextScrollMargin = getDiscussionVirtualFeedScrollMargin(
        feedRef.current,
        scrollport,
      );
      setPhoneScrollMargin((current) =>
        Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
      );
    };

    syncScrollMargin();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", syncScrollMargin);
      return () => window.removeEventListener("resize", syncScrollMargin);
    }

    const resizeObserver = new ResizeObserver(syncScrollMargin);
    resizeObserver.observe(header);
    return () => {
      resizeObserver.disconnect();
    };
  }, [feedRef, viewportRef]);

  return phoneScrollMargin;
}

function useDiscussionScrollMode() {
  const [useWindowScroll, setUseWindowScroll] = useState(true);

  useLayoutEffect(() => {
    const syncScrollMode = () => {
      setUseWindowScroll(getApplicationScrollElement() === null);
    };

    syncScrollMode();
    window.addEventListener("resize", syncScrollMode);
    return () => window.removeEventListener("resize", syncScrollMode);
  }, []);

  return useWindowScroll;
}

function useDiscussionVirtualFeedScrollMargin(
  feedRef: React.RefObject<HTMLDivElement | null>,
  useWindowScroll: boolean,
  layoutKey: string | undefined,
  itemCount: number,
) {
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncScrollMargin = () => {
      const nextScrollMargin = getDiscussionVirtualFeedScrollMargin(
        feedRef.current,
        useWindowScroll ? null : getApplicationScrollElement(),
      );
      setScrollMargin((current) =>
        Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
      );
    };

    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [feedRef, itemCount, layoutKey, useWindowScroll]);

  return scrollMargin;
}

function DiscussionWindowVirtualFeed(props: DiscussionVirtualFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useDiscussionVirtualFeedScrollMargin(
    feedRef,
    true,
    props.layoutKey,
    props.entries.length,
  );
  const virtualizer = useWindowVirtualizer({
    count: props.entries.length,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor: useDiscussionRangeExtractor(
      props.entries,
      props.protectedEntryIndices,
    ),
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [props.layoutKey, virtualizer]);

  return (
    <DiscussionVirtualFeedRows
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={{
        ...virtualizer,
        measureElement: (element) => virtualizer.measureElement(element),
      }}
    />
  );
}

function DiscussionScrollportVirtualFeed(props: DiscussionVirtualFeedProps) {
  const feedRef = useRef<HTMLDivElement>(null);
  const scrollMargin = useDiscussionVirtualFeedScrollMargin(
    feedRef,
    false,
    props.layoutKey,
    props.entries.length,
  );
  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: getApplicationScrollElement,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor: useDiscussionRangeExtractor(
      props.entries,
      props.protectedEntryIndices,
    ),
    scrollMargin,
  });

  useEffect(() => {
    virtualizer.measure();
  }, [props.layoutKey, virtualizer]);

  return (
    <DiscussionVirtualFeedRows
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={{
        ...virtualizer,
        measureElement: (element) => virtualizer.measureElement(element),
      }}
    />
  );
}

function DiscussionDesktopVirtualFeed(props: DiscussionVirtualFeedProps) {
  const useWindowScroll = useDiscussionScrollMode();

  if (useWindowScroll) return <DiscussionWindowVirtualFeed {...props} />;
  return <DiscussionScrollportVirtualFeed {...props} />;
}

function DiscussionVirtualFeed({
  viewportRef,
  isPhone,
  ...props
}: DiscussionVirtualFeedProps & {
  viewportRef: React.RefObject<HTMLDivElement | null>;
  isPhone: boolean;
}) {
  if (isPhone) {
    return <DiscussionViewportVirtualFeed viewportRef={viewportRef} {...props} />;
  }

  return <DiscussionDesktopVirtualFeed {...props} />;
}

type DiscussionLoadingRowVariant = "short" | "long";

function DiscussionLoadingRow({
  variant,
}: {
  variant: DiscussionLoadingRowVariant;
}) {
  const hasSecondTextLine = variant === "long";

  return (
    <div className="relative py-4" aria-hidden="true">
      <div className="relative flex gap-3">
        <div className="size-10 shrink-0 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <div className="h-3.5 w-24 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
            <div className="h-3 w-16 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_9%,transparent)]" />
          </div>

          <div className="mt-1.5 space-y-2">
            <div
              className={`h-3.5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)] ${hasSecondTextLine ? "w-full" : "w-4/5"}`}
            />
            {hasSecondTextLine && (
              <div className="h-3.5 w-3/5 animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_12%,transparent)]" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ThreadSurface({
  lessonDescription,
  isLessonDescriptionLoading = false,
  mobileLessonHeader,
  draft,
  entryKind,
  visibility,
  editingEntryId,
  notice,
  entryFilter,
  feedSort,
  entries,
  noteDeepLinkTargetId = null,
  onNoteDeepLinkHandled,
  discussionCount,
  draftIsTooLong,
  draftAttachmentCount,
  canSubmitDraft,
  isSubmitting = false,
  isNotesLoading = false,
  isNotesError = false,
  onRetryNotes,
  onLoadMore,
  onRetryNextPage,
  hasNextPage = false,
  isFetchingNextPage = false,
  isNextPageError = false,
  isThreadsLoading = false,
  isThreadDeepLinkPending = false,
  isAllInitialLoading = false,
  isThreadsError = false,
  onRetryThreads,
  mobileBottomNavigation,
  mobileBottomNavigationHidden,
  capabilities,
  isInteractionCapabilitiesLoading = false,
  isAllDisabled,
  availableFilters,
  enabledKinds,
  promptText,
  authorAvatar,
  attachments,
  onAttachmentsChange,
  onDraftChange,
  onEntryKindChange,
  onVisibilityChange,
  onSubmit,
  onCancelEdit,
  onEntryFilterChange,
  onFeedSortChange,
  onLike,
  onEdit,
  onDelete,
  onReport,
  onOpenThread,
  isBackendMode = false,
  currentUserId,
  userRole,
  onToggleAcceptReply,
  onToggleLockThread,
  onToggleBookmark,
  onToggleFollow,
  onSeekToTimestamp,
  onReplyEditFailure,
  onDeleteFailure,
  courseId,
}: ThreadSurfaceProps) {
  const isPhone = usePhoneComposerLayout();
  const deletionRevision = useOptimisticDeletionRevision();
  const composerHostRef = useRef<HTMLDivElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  const discussionViewportRef = useRef<HTMLDivElement>(null);
  const compactComposerScrollHidden =
    mobileBottomNavigation && mobileBottomNavigationHidden;
  const [composerMode, setComposerMode] = useState<ComposerMode>("collapsed");
  const [
    mobileComposerCollapsedSnapPoint,
    setMobileComposerCollapsedSnapPoint,
  ] = useState<number>(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const [mobileComposerSnapPoint, setMobileComposerSnapPoint] = useState<
    number | null
  >(DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT);
  const [mobileComposerKeyboardInset, setMobileComposerKeyboardInset] =
    useState(0);
  const [mobileComposerViewportHeight, setMobileComposerViewportHeight] =
    useState<number | null>(null);
  const mobileComposerSnapPoints = useMemo(
    () => [mobileComposerCollapsedSnapPoint, 1],
    [mobileComposerCollapsedSnapPoint],
  );

  useLayoutEffect(() => {
    if (!isPhone) return undefined;
    const root = document.documentElement;
    root.dataset.learningMobileComposerReady = "true";
    return () => {
      delete root.dataset.learningMobileComposerReady;
    };
  }, [isPhone]);

  const getMobileComposerViewportGeometry = useCallback(() => {
    const playerBottom = document
      .querySelector<HTMLElement>(".learning-workspace__player-wrap")
      ?.getBoundingClientRect().bottom;
    const visualViewport = window.visualViewport;
    return getDiscussionComposerViewportGeometry(
      document.documentElement.clientHeight || window.innerHeight,
      visualViewport?.height ?? window.innerHeight,
      visualViewport?.offsetTop ?? 0,
      playerBottom,
    );
  }, []);

  const closeComposer = useCallback(() => {
    setComposerMode("collapsed");
    if (editingEntryId !== null) onCancelEdit();
  }, [editingEntryId, onCancelEdit]);

  const openMobileComposer = useCallback(() => {
    const geometry = getMobileComposerViewportGeometry();
    setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerSnapPoint(geometry.collapsedSnapPoint);
    setMobileComposerKeyboardInset(geometry.keyboardInset);
    setMobileComposerViewportHeight(geometry.visualViewportHeight);
    setComposerMode("mobile");
  }, [getMobileComposerViewportGeometry]);

  useEffect(() => {
    setComposerMode((current: ComposerMode) => {
      if (isPhone && current === "desktop") return "collapsed";
      if (!isPhone && current === "mobile") return "collapsed";
      return current;
    });
  }, [isPhone]);

  useEffect(() => {
    if (editingEntryId === null) return undefined;
    if (isPhone) {
      openMobileComposer();
      return undefined;
    }

    setComposerMode("desktop");
    const frame = window.requestAnimationFrame(() => {
      const reduceMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      composerHostRef.current?.scrollIntoView?.({
        behavior: reduceMotion ? "auto" : "smooth",
        block: "start",
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [editingEntryId, isPhone, openMobileComposer]);

  useEffect(() => {
    if (!isPhone || composerMode !== "mobile") {
      setMobileComposerKeyboardInset(0);
      setMobileComposerViewportHeight(null);
      return undefined;
    }

    const syncGeometry = () => {
      const geometry = getMobileComposerViewportGeometry();
      setMobileComposerCollapsedSnapPoint(geometry.collapsedSnapPoint);
      setMobileComposerSnapPoint((current: number | null) =>
        current === 1 ? 1 : geometry.collapsedSnapPoint,
      );
      setMobileComposerKeyboardInset(geometry.keyboardInset);
      setMobileComposerViewportHeight(geometry.visualViewportHeight);
    };

    syncGeometry();
    let frameId = 0;
    const scheduleSnapPointSync = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(syncGeometry);
    };

    window.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("resize", scheduleSnapPointSync);
    window.visualViewport?.addEventListener("scroll", scheduleSnapPointSync);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", scheduleSnapPointSync);
      window.visualViewport?.removeEventListener(
        "resize",
        scheduleSnapPointSync,
      );
      window.visualViewport?.removeEventListener(
        "scroll",
        scheduleSnapPointSync,
      );
    };
  }, [composerMode, getMobileComposerViewportGeometry, isPhone]);

  useEffect(() => {
    if (composerMode === "collapsed") return undefined;

    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("[data-comment-composer-container]")
      ) {
        return;
      }
      if (document.querySelector('[role="listbox"]')) return;
      closeComposer();
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer, true);
    return () =>
      document.removeEventListener("pointerdown", closeOnOutsidePointer, true);
  }, [closeComposer, composerMode]);

  const submitAndCollapse = async (onLocallyAccepted?: () => void) => {
    if (!canSubmitDraft) return false;
    let acceptedLocally = false;
    const result = await onSubmit(() => {
      acceptedLocally = true;
      setComposerMode("collapsed");
      onLocallyAccepted?.();
    });
    const succeeded = result !== false;
    if (succeeded && !acceptedLocally) {
      setComposerMode("collapsed");
    }
    return succeeded;
  };

  useEffect(() => {
    const sentinel = feedSentinelRef.current;
    if (
      !sentinel ||
      !onLoadMore ||
      !hasNextPage ||
      isFetchingNextPage
    ) {
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void onLoadMore();
        }
      },
      {
        root: isPhone
          ? discussionViewportRef.current
          : getApplicationScrollElement(),
        rootMargin: "600px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, isPhone, onLoadMore]);

  const protectedEntryIndices = useMemo(() => {
    const indices = new Set<number>();

    entries.forEach((entry, index) => {
      const clientId = getClientEntityId(entry);
      const serverId = getServerEntityId(entry);
      const deletionKind = entry.entryKind === "note" ? "note" : "thread";
      const deletion = optimisticDeletionCoordinator.get(
        deletionKind,
        clientId,
        serverId,
      );
      const isRootEditing =
        editingEntryId !== null && String(editingEntryId) === clientId;
      const hasUndoableChild =
        deletionKind === "thread" &&
        optimisticDeletionCoordinator.hasUndoableReplyForParent(
          clientId,
          serverId,
        );

      if (
        deletion?.phase === "undoable" ||
        isRootEditing ||
        hasUndoableChild ||
        (noteDeepLinkTargetId && serverId === noteDeepLinkTargetId)
      ) {
        indices.add(index);
      }
    });

    return indices;
  }, [deletionRevision, editingEntryId, entries, noteDeepLinkTargetId]);

  const focusedNoteDeepLinkRef = useRef<string | null>(null);

  useLayoutEffect(() => {
    if (
      !noteDeepLinkTargetId ||
      entryFilter !== "note" ||
      focusedNoteDeepLinkRef.current === noteDeepLinkTargetId
    ) {
      return;
    }

    const target = Array.from(
      document.querySelectorAll<HTMLElement>("[data-note-id]"),
    ).find((element) => element.dataset.noteId === noteDeepLinkTargetId);
    if (!target) return;

    focusedNoteDeepLinkRef.current = noteDeepLinkTargetId;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    target.focus({ preventScroll: true });
    onNoteDeepLinkHandled?.(noteDeepLinkTargetId);
  }, [entryFilter, noteDeepLinkTargetId, onNoteDeepLinkHandled]);

  const renderEntry = useCallback(
    (entry: Comment) => (
      <CommentCard
        comment={entry}
        onLike={onLike}
        onEdit={onEdit}
        onDelete={onDelete}
        onEditFailure={onReplyEditFailure}
        onDeleteFailure={onDeleteFailure}
        onReport={onReport}
        onOpenThread={onOpenThread}
        isBackendMode={isBackendMode}
        currentUserId={currentUserId}
        userRole={userRole}
        onToggleAcceptReply={onToggleAcceptReply}
        onToggleLockThread={onToggleLockThread}
        onToggleBookmark={onToggleBookmark}
        onToggleFollow={onToggleFollow}
        onSeekToTimestamp={onSeekToTimestamp}
        courseId={courseId}
        constrainToContainer
        canEdit={entry.entryKind !== "note" || capabilities.allowNotes}
        canDelete={entry.entryKind !== "note" || capabilities.allowNotes}
        isDeepLinkTarget={
          Boolean(
            noteDeepLinkTargetId &&
              entry.entryKind === "note" &&
              getServerEntityId(entry) === noteDeepLinkTargetId,
          )
        }
      />
    ),
    [
      courseId,
      currentUserId,
      isBackendMode,
      onDelete,
      onDeleteFailure,
      onEdit,
      onLike,
      onOpenThread,
      onReplyEditFailure,
      onReport,
      onToggleAcceptReply,
      onToggleBookmark,
      onToggleFollow,
      onSeekToTimestamp,
      onToggleLockThread,
      capabilities.allowNotes,
      noteDeepLinkTargetId,
      userRole,
    ],
  );

  const discussionDescription = (
    <LessonDescription
      description={lessonDescription}
      isLoading={isLessonDescriptionLoading}
      onSeekToTimestamp={onSeekToTimestamp}
    />
  );
  const hasDescriptionSurface =
    isLessonDescriptionLoading || Boolean(lessonDescription?.trim());

  const disabledMessage = (
    <div
      className="py-8 text-center"
      data-testid="learner-interactions-disabled-message"
    >
      <p className="text-sm font-medium text-(--muted)">
        Learner interactions are disabled for this course.
      </p>
    </div>
  );

  if (isAllDisabled) {
    if (isPhone) {
      return (
        <div className="mt-2.5 flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={discussionViewportRef}
            data-discussion-scroll-viewport
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col touch-pan-y overflow-x-hidden overflow-y-auto"
            style={{
              minHeight: 0,
              maxWidth: "100%",
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehaviorX: "none",
              overscrollBehaviorY: "none",
              touchAction: "pan-y",
            }}
          >
            <div
              data-discussion-scroll-header
              className="min-w-0 max-w-full shrink-0"
            >
              {mobileLessonHeader}
              {discussionDescription}
            </div>
            {disabledMessage}
          </div>
        </div>
      );
    }

    return (
      <div>
        <LessonDescription
          description={lessonDescription}
          isLoading={isLessonDescriptionLoading}
          onSeekToTimestamp={onSeekToTimestamp}
        />
        {disabledMessage}
      </div>
    );
  }

  const discussionFilters = availableFilters.length > 0 ? (
    <div
      role="group"
      aria-label="Filter discussion entries"
      className="learning-discussion__filter-group mt-3 flex w-full min-w-0 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] sm:mt-5 [&::-webkit-scrollbar]:hidden"
    >
      {availableFilters.map(([value, label]) => (
        <button
          key={value}
          type="button"
          aria-pressed={entryFilter === value}
          onClick={() => onEntryFilterChange(value)}
          className={`learning-discussion__filter-button h-8 shrink-0 rounded-lg px-2.5 font-semibold transition-[background-color,color,box-shadow] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:px-3 ${entryFilter === value ? "bg-(--text) text-(--canvas) shadow-[0_6px_18px_color-mix(in_srgb,var(--canvas)_28%,transparent)]" : "bg-[color-mix(in_srgb,var(--surface)_54%,transparent)] text-(--text-secondary) shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_12%,transparent)] hover:bg-(--hover) hover:text-(--text)"}`}
        >
          {label}
        </button>
      ))}
    </div>
  ) : null;
  const discussionToolbar = (
    <div
      className="mt-3.5 flex min-w-0 items-end max-[640px]:mt-2.5"
      data-discussion-feed-toolbar
    >
      <p className="min-w-0 truncate text-lg leading-none font-semibold tracking-[-0.02em] text-(--text)">
        {discussionCount === undefined
          ? "Discussions"
          : `${discussionCount} Discussions`}
      </p>
      <span
        className="shrink-0 text-lg leading-none text-(--text-secondary)"
        aria-hidden="true"
        data-discussion-feed-separator
      >
        {"\u00A0\u00A0·\u00A0\u00A0"}
      </span>
      <ThemedSelect
        value={feedSort}
        onValueChange={onFeedSortChange}
        ariaLabel="Sort discussions"
        options={DISCUSSION_FEED_SORT_OPTIONS}
        triggerClassName="h-auto! w-auto! max-w-full shrink-0! items-end! justify-start! gap-1! border-0! bg-transparent! p-0! shadow-none! text-[13px] leading-none! font-medium whitespace-nowrap text-(--text-secondary)! hover:bg-transparent! hover:text-(--text)! data-[state=open]:bg-transparent! data-[state=open]:shadow-none!"
      />
    </div>
  );

  const discussionLoadingContent = (
    <div
      className="mt-4 flex min-h-0 flex-1 flex-col gap-3"
      data-testid="learner-interactions-loading"
    >
      <DiscussionLoadingRow variant="short" />
      <DiscussionLoadingRow variant="long" />
      <DiscussionLoadingRow variant="short" />
    </div>
  );

  const discussionContent = isInteractionCapabilitiesLoading ? (
    discussionLoadingContent
  ) : isThreadDeepLinkPending ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-thread-deep-link-loading"
      role="status"
    >
      <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
      <p className="text-sm font-medium text-(--muted)">
        Loading discussion…
      </p>
    </div>
  ) : isAllInitialLoading ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-all-loading"
    >
      <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
      <p className="text-sm font-medium text-(--muted)">
        Loading discussions…
      </p>
    </div>
  ) : entryFilter === "note" && isNotesLoading && entries.length === 0 ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-notes-loading"
    >
      <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
      <p className="text-sm font-medium text-(--muted)">Loading notes…</p>
    </div>
  ) : entryFilter === "note" && isNotesError && entries.length === 0 ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-notes-error"
    >
      <p className="font-semibold text-(--text)">Failed to load notes</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
        There was a problem loading your notes for this lesson.
      </p>
      {onRetryNotes && (
        <button
          type="button"
          onClick={onRetryNotes}
          className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
        >
          Retry
        </button>
      )}
    </div>
  ) : entryFilter !== "note" && isThreadsLoading && entries.length === 0 ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-threads-loading"
    >
      <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
      <p className="text-sm font-medium text-(--muted)">
        Loading discussions…
      </p>
    </div>
  ) : entryFilter !== "note" && isThreadsError && entries.length === 0 ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-threads-error"
    >
      <p className="font-semibold text-(--text)">Failed to load discussions</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
        There was a problem loading the discussion for this lesson.
      </p>
      {onRetryThreads && (
        <button
          type="button"
          onClick={onRetryThreads}
          className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
        >
          Retry
        </button>
      )}
    </div>
  ) : (
    <>
      <DiscussionVirtualFeed
        entries={entries}
        protectedEntryIndices={protectedEntryIndices}
        renderEntry={renderEntry}
        layoutKey={`${composerMode}:${entryFilter}:${isLessonDescriptionLoading}`}
        viewportRef={discussionViewportRef}
        isPhone={isPhone}
      />
      {isBackendMode && hasNextPage && (
        <div ref={feedSentinelRef} className="h-1" aria-hidden="true" />
      )}
      {isBackendMode && isFetchingNextPage && (
        <p
          className="py-4 text-center text-sm text-(--muted)"
          data-testid="learning-feed-loading-more"
        >
          Loading more…
        </p>
      )}
      {isBackendMode && isNextPageError && entries.length > 0 && (
        <div
          className="flex flex-col items-center gap-2 py-4 text-center"
          data-testid="learning-feed-load-more-error"
        >
          <p className="text-sm text-(--muted)">
            There was a problem loading more discussions.
          </p>
          {onRetryNextPage && (
            <button
              type="button"
              onClick={() => void onRetryNextPage()}
              disabled={isFetchingNextPage}
              className="inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Retry loading more
            </button>
          )}
        </div>
      )}
      {shouldShowDiscussionEnd({
        isBackendMode,
        entryFilter,
        entryCount: entries.length,
        hasNextPage,
        isNextPageError,
        isNotesLoading,
        isThreadsLoading,
      }) && (
        <p
          className="py-4 text-center text-xs text-(--muted)"
          data-testid="learning-feed-end"
        >
          You’ve reached the end.
        </p>
      )}
      {entries.length === 0 && (
        <div className="py-12 text-center">
          <p className="font-semibold text-(--text)">
            No {entryFilter === "all" ? "entries" : getFilterName(entryFilter)} yet
          </p>
          {availableFilters.some(([val]) => val === "all") && (
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
              Choose All to return to the full lesson discussion.
            </p>
          )}
        </div>
      )}
    </>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!isPhone && discussionDescription}
      {!isPhone && enabledKinds.length > 0 && (
        <div
          ref={composerHostRef}
          data-comment-composer-container
          className={
            hasDescriptionSurface
              ? "mt-3 scroll-mt-4 sm:mt-4"
              : "scroll-mt-4"
          }
        >
          {composerMode === "desktop" ? (
            <CommentComposer
              draft={draft}
              avatar={authorAvatar}
              documentId={
                editingEntryId === null
                  ? "discussion-new"
                  : `discussion-edit-${editingEntryId}`
              }
              entryKind={entryKind}
              visibility={visibility}
              capabilities={capabilities}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              isSubmitting={isSubmitting}
              editing={editingEntryId !== null}
              autoFocus
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
              onClose={closeComposer}
              courseId={courseId}
            />
          ) : (
            <CompactComposer
              draft={draft}
              attachmentCount={draftAttachmentCount}
              promptText={promptText}
              avatar={authorAvatar}
              onOpen={() => setComposerMode("desktop")}
            />
          )}
        </div>
      )}

      <p role="status" className="sr-only">
        {notice}
      </p>

      {!isPhone && discussionFilters}
      {!isPhone && discussionToolbar}

      <div
        className={
          isPhone
            ? "mt-2.5 flex min-h-0 min-w-0 flex-1 flex-col"
            : "mt-2.5 min-w-0 max-w-full"
        }
        data-discussion-feed-list
      >
        {isPhone ? (
          <div
            ref={discussionViewportRef}
            data-discussion-scroll-viewport
            className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col touch-pan-y overflow-x-hidden overflow-y-auto"
            style={{
              minHeight: 0,
              maxWidth: "100%",
              overflowX: "hidden",
              overflowY: "auto",
              overscrollBehaviorX: "none",
              overscrollBehaviorY: "none",
              touchAction: "pan-y",
            }}
          >
            <div
              data-discussion-scroll-header
              className="min-w-0 max-w-full shrink-0"
            >
              {mobileLessonHeader}
              {discussionDescription}
              {discussionFilters}
              {discussionToolbar}
            </div>
            {discussionContent}
          </div>
        ) : (
          <div className="min-w-0 max-w-full">{discussionContent}</div>
        )}
      </div>

      {isPhone && enabledKinds.length > 0 && composerMode !== "mobile" && (
        <MobileCompactComposerPortal
          draft={draft}
          attachmentCount={draftAttachmentCount}
          promptText={promptText}
          avatar={authorAvatar}
          mobileBottomNavigation={mobileBottomNavigation}
          scrollHidden={compactComposerScrollHidden}
          onOpen={openMobileComposer}
        />
      )}

      {isPhone && enabledKinds.length > 0 && (
        <Drawer
          open={composerMode === "mobile"}
          onOpenChange={(open) => {
            if (open) openMobileComposer();
            else closeComposer();
          }}
          modal={false}
          snapPoints={mobileComposerSnapPoints}
          snapPoint={mobileComposerSnapPoint}
          onSnapPointChange={(snapPoint) => {
            if (typeof snapPoint === "number" || snapPoint === null) {
              setMobileComposerSnapPoint(snapPoint);
            }
          }}
          snapToSequentialPoints
          showSwipeHandle
          swipeDirection="down"
          swipeHandleClassName="pt-2.5 after:w-18 after:bg-[color-mix(in_srgb,var(--text)_34%,transparent)]"
        >
          <DrawerContent
            data-comment-composer-container
            style={
              {
                "--drawer-content-height": mobileComposerViewportHeight
                  ? `${mobileComposerViewportHeight}px`
                  : "100dvh",
                "--drawer-content-max-height": mobileComposerViewportHeight
                  ? `${mobileComposerViewportHeight}px`
                  : "100dvh",
                bottom: `${mobileComposerKeyboardInset}px`,
                paddingBottom:
                  mobileComposerKeyboardInset > 0
                    ? "0px"
                    : "var(--app-safe-area-bottom)",
              } as React.CSSProperties
            }
            aria-label={
              editingEntryId === null
                ? "Create a discussion entry"
                : "Edit a discussion entry"
            }
            className="learning-comment-composer-drawer overflow-hidden rounded-t-[22px]! bg-[color-mix(in_srgb,var(--surface)_94%,var(--canvas))] px-0 pt-0 shadow-[0_-20px_56px_rgba(0,0,0,0.42)] data-expanded:rounded-none!"
          >
            <DrawerTitle className="sr-only">
              {editingEntryId === null
                ? "Create a discussion entry"
                : "Edit a discussion entry"}
            </DrawerTitle>
            <DrawerDescription className="sr-only">
              Write a comment, Q&A, or note for this lesson.
            </DrawerDescription>
            <CommentComposer
              draft={draft}
              avatar={authorAvatar}
              documentId={
                editingEntryId === null
                  ? "discussion-new"
                  : `discussion-edit-${editingEntryId}`
              }
              entryKind={entryKind}
              visibility={visibility}
              capabilities={capabilities}
              invalid={draftIsTooLong}
              canSubmit={canSubmitDraft}
              isSubmitting={isSubmitting}
              editing={editingEntryId !== null}
              autoFocus
              presentation="drawer"
              attachments={attachments}
              onAttachmentsChange={onAttachmentsChange}
              onDraftChange={onDraftChange}
              onEntryKindChange={onEntryKindChange}
              onVisibilityChange={onVisibilityChange}
              onSubmit={submitAndCollapse}
              onClose={closeComposer}
              courseId={courseId}
            />
          </DrawerContent>
        </Drawer>
      )}
    </div>
  );
}

interface CompactComposerProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  avatar?: string | null;
  disabled?: boolean;
  onOpen: () => void;
}

const COMPACT_COMPOSER_SURFACE = `${DESCRIPTION_SURFACE_BASE} rounded-md transition-[background-color,box-shadow] hover:bg-[color-mix(in_srgb,var(--surface)_96%,var(--hover))]`;

const MOBILE_COMPOSER_SURFACE_BASE =
  "border-t border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-transparent backdrop-blur-xl px-3 pt-2 pb-[max(8px,var(--app-safe-area-bottom))]";

interface MobileCompactComposerPortalProps {
  draft: DiscussionDraft;
  attachmentCount: number;
  promptText?: string;
  avatar?: string | null;
  mobileBottomNavigation: boolean;
  scrollHidden: boolean;
  onOpen: () => void;
}

function MobileCompactComposerPortal({
  draft,
  attachmentCount,
  promptText,
  avatar,
  mobileBottomNavigation,
  scrollHidden,
  onOpen,
}: MobileCompactComposerPortalProps) {
  const layerTarget = document.querySelector<HTMLElement>(
    "[data-learning-motion-stage]",
  );

  return createPortal(
    <div
      data-learning-mobile-composer-layer
      className={`pointer-events-none fixed inset-x-0 z-130 box-border min-w-0 max-w-full overflow-x-clip transition-[transform,opacity] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none ${
        mobileBottomNavigation
          ? "bottom-[calc(58px+var(--app-viewport-safe-area-bottom))]"
          : "bottom-0"
      }`}
      style={{
        opacity: "var(--learning-player-content-opacity, 1)",
        transform:
          "translate3d(0, var(--learning-player-content-offset-y, 0px), 0)",
        transitionDuration:
          "var(--learning-player-content-motion-duration, 0ms)",
      }}
    >
      <div
        data-learning-mobile-composer-surface
        data-testid="mobile-discussion-composer"
        data-scroll-hidden={scrollHidden}
        aria-hidden={scrollHidden}
        className={`pointer-events-auto relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE} transition-[transform,opacity,visibility] will-change-transform motion-reduce:transition-none ${scrollHidden ? "pointer-events-none invisible translate-y-[calc(100%+58px+var(--app-viewport-safe-area-bottom)+4px)] opacity-0 duration-180 ease-[cubic-bezier(0.4,0,1,1)]" : "visible translate-y-0 opacity-100 duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"}`}
      >
        <CompactComposer
          draft={draft}
          attachmentCount={attachmentCount}
          promptText={promptText}
          avatar={avatar}
          onOpen={onOpen}
        />
      </div>
    </div>,
    layerTarget ?? document.body,
  );
}

export function PrerenderedMobileCommentComposer() {
  return (
    <div
      data-learning-mobile-composer-prerender
      aria-hidden="true"
      className="pointer-events-none fixed inset-x-0 bottom-[calc(58px+var(--app-viewport-safe-area-bottom))] z-130 box-border hidden min-w-0 max-w-full overflow-x-clip [[data-navigation-layout=compact]_&]:block [[data-learning-mobile-composer-ready=true]_&]:hidden!"
    >
      <div
        className={`relative box-border min-w-0 max-w-full overflow-x-clip ${MOBILE_COMPOSER_SURFACE_BASE}`}
      >
        <CompactComposer
          draft={EMPTY_MOBILE_COMPOSER_DRAFT}
          attachmentCount={0}
          avatar={null}
          disabled
          onOpen={() => undefined}
        />
      </div>
    </div>
  );
}

function CompactComposer({
  draft,
  attachmentCount,
  promptText = "Write something…",
  avatar,
  disabled = false,
  onOpen,
}: CompactComposerProps) {
  const preview =
    draft.plainText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean) ?? "";
  const attachmentPreview = `${attachmentCount} ${attachmentCount === 1 ? "attachment" : "attachments"}`;

  return (
    <div
      role="button"
      data-compact-comment-composer
      aria-label="Open discussion composer"
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      onClick={disabled ? undefined : onOpen}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen();
        }
      }}
      className={`flex w-full cursor-pointer items-center gap-2 p-1.5 text-left ${COMPACT_COMPOSER_SURFACE} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)${disabled ? " pointer-events-none opacity-60" : ""}`}
    >
      <DiscussionAvatar
        src={avatar}
        className="pointer-events-none size-9"
      />
      <span className="learning-discussion__composer-prompt min-w-0 flex-1 truncate px-2 py-1.5 text-(--muted)">
        {preview || (attachmentCount > 0 ? attachmentPreview : promptText)}
      </span>
    </div>
  );
}

function usePhoneComposerLayout() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);

  return isPhone;
}

const getFilterName = (filter: Exclude<DiscussionEntryFilter, "all">) => {
  if (filter === "question") return "Q&As";
  if (filter === "note") return "notes";
  return "comments";
};
