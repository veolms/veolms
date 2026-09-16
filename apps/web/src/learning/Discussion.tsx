import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import {
  applyDiscussionFeed,
  DISCUSSION_FEED_SORT_OPTIONS,
  type DiscussionEntryFilter,
  type DiscussionFeedSort,
  type InteractionCapabilities,
} from "./discussionFeed";

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
  useLessonThreads,
  useThreadDetails,
  desiredStateCoordinator,
  useUpdateNote,
  useUpdateThread,
  useUserNotes,
} from "../services/learning-interactions";
import {
  createClientEntityId,
  revokeLocalAttachmentPreview,
  type LocalComposerAttachment,
} from "../services/learning-interactions/attachment-model";
import { optimisticEditCoordinator } from "../services/learning-interactions/optimistic-edit-coordinator";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletionRevision,
} from "../services/learning-interactions/optimistic-deletion-coordinator";
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
import { getApplicationScrollElement } from "../shell/applicationScroll";

const CURRENT_USER = {
  name: "Ashi Singh",
  avatar: "",
};

const EMPTY_MOBILE_COMPOSER_DRAFT = createEmptyDiscussionDraft();

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
  mobileBottomNavigation?: boolean;
  mobileBottomNavigationHidden?: boolean;
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  interactionCapabilities?: InteractionCapabilities;
  isInteractionCapabilitiesLoading?: boolean;
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
  mobileBottomNavigation = false,
  mobileBottomNavigationHidden = false,
  lessonDescription,
  isLessonDescriptionLoading = false,
  interactionCapabilities,
  isInteractionCapabilitiesLoading = false,
  searchParams,
  setSearchParams,
}: DiscussionInnerProps) {
  const capabilities = interactionCapabilities ?? DEFAULT_CAPABILITIES;
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
    !isInteractionCapabilitiesLoading && enabledKinds.length === 0;

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
    if (enabledKinds.length === 0) return [];
    if (enabledKinds.length === 1) {
      const singleKind = enabledKinds[0]!;
      const label =
        singleKind === "comment"
          ? "Comments"
          : singleKind === "note"
            ? "Notes"
            : "Q&As";
      return [[singleKind, label]] as const;
    }
    const filters: (readonly [DiscussionEntryFilter, string])[] = [
      ["all", "All"],
    ];
    if (capabilities.allowComments) filters.push(["comment", "Comments"]);
    if (capabilities.allowNotes) filters.push(["note", "Notes"]);
    if (capabilities.allowQa) filters.push(["question", "Q&As"]);
    return filters;
  }, [capabilities, enabledKinds]);

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

  const [entryKind, setEntryKind] =
    useState<DiscussionEntryKind>(firstAvailableKind);
  const [visibility, setVisibility] = useState<DiscussionVisibility>("public");
  const [entryFilter, setEntryFilter] = useState<DiscussionEntryFilter>(
    enabledKinds.length === 1 ? enabledKinds[0]! : "all",
  );
  const [feedSort, setFeedSort] = useState<DiscussionFeedSort>("newest");

  const threadQuery = useMemo(
    () => ({
      kind:
        entryFilter === "comment" || entryFilter === "question"
          ? entryFilter
          : "all" as const,
      status: "all" as const,
      sort: feedSort === "top" ? ("popular" as const) : ("latest" as const),
      ...(feedSort === "mine" ? { mine: true } : {}),
      limit: 20,
    }),
    [entryFilter, feedSort],
  );
  const notesQuery = useMemo(
    () => ({
      courseId: courseId ?? "",
      lessonId: lessonId ?? "",
      ...(feedSort === "mine" ? { mine: true } : {}),
      limit: 20,
    }),
    [courseId, feedSort, lessonId],
  );

  const {
    data: notesData,
    isLoading: isNotesLoading,
    isError: isNotesError,
    refetch: refetchNotes,
    fetchNextPage: fetchNextNotesPage,
    hasNextPage: hasNextNotesPage,
    isFetchingNextPage: isFetchingNextNotesPage,
  } = useUserNotes(
    notesQuery,
    {
      enabled: Boolean(
        courseId &&
          lessonId &&
          capabilities.allowNotes &&
          (entryFilter === "all" || entryFilter === "note"),
      ),
    },
  ) ?? {};

  const shouldFetchThreads = Boolean(
    courseId &&
    lessonId &&
    (capabilities.allowComments || capabilities.allowQa),
  );

  const {
    data: threadsData,
    isLoading: isThreadsLoading,
    isError: isThreadsError,
    refetch: refetchThreads,
    fetchNextPage: fetchNextThreadsPage,
    hasNextPage: hasNextThreadsPage,
    isFetchingNextPage: isFetchingNextThreadsPage,
  } = useLessonThreads(
    courseId ?? "",
    lessonId ?? "",
    threadQuery,
    {
      enabled: shouldFetchThreads && entryFilter !== "note",
    },
  ) ?? {};

  const createNoteMutation = useCreateNote();
  const updateNoteMutation = useUpdateNote();
  const deleteNoteMutation = useDeleteNote();

  const createThreadMutation = useCreateLessonThread(
    courseId ?? "",
    lessonId ?? "",
  );
  const updateThreadMutation = useUpdateThread();
  const deleteThreadMutation = useDeleteThread();
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

  const backendNotes = useMemo<Comment[]>(() => {
    const legacyNotesData = notesData as unknown as
      | {
          pages?: Array<{ notes: LearningNoteCacheItem[] }>;
          notes?: LearningNoteCacheItem[];
        }
      | undefined;
    const pages =
      legacyNotesData?.pages ??
      (legacyNotesData?.notes ? [{ notes: legacyNotesData.notes }] : []);
    if (
      !courseId ||
      !lessonId ||
      !capabilities.allowNotes ||
      pages.length === 0
    )
      return [];
    return pages.flatMap((page) =>
      page.notes.map((note) =>
        adaptLearningNoteToComment(
          note,
          authorName,
          authorAvatar,
          currentUser?.id,
        ),
      ),
    );
  }, [
    capabilities.allowNotes,
    courseId,
    lessonId,
    notesData,
    currentUser?.id,
    authorName,
    authorAvatar,
  ]);

  const isBackendMode = Boolean(
    courseId || courseSlug || isInteractionCapabilitiesLoading,
  );

  const rawThreadId = searchParams.get("thread");
  const threadIdFromUrl =
    rawThreadId && rawThreadId.trim().length > 0 ? rawThreadId.trim() : null;

  const {
    data: directThreadData,
    isLoading: isDirectThreadLoading,
    isError: isDirectThreadError,
  } = useThreadDetails(threadIdFromUrl ?? "", {
    enabled: Boolean(threadIdFromUrl && isBackendMode),
  });

  const directThreadComment = useMemo<Comment | null>(() => {
    if (!directThreadData || !isCommentOrQaThread(directThreadData))
      return null;
    return adaptLearningThreadToComment(directThreadData, currentUser?.id);
  }, [currentUser?.id, directThreadData]);

  const backendThreads = useMemo<Comment[]>(() => {
    const legacyThreadsData = threadsData as unknown as
      | {
          pages?: Array<{ threads: LearningThreadEntity[] }>;
          threads?: LearningThreadEntity[];
        }
      | undefined;
    const pages =
      legacyThreadsData?.pages ??
      (legacyThreadsData?.threads ? [{ threads: legacyThreadsData.threads }] : []);
    if (
      !courseId ||
      !lessonId ||
      (!capabilities.allowComments && !capabilities.allowQa) ||
      pages.length === 0
    ) {
      return [];
    }

    return pages.flatMap((page) =>
      page.threads
        .filter(isCommentOrQaThread)
        .map((thread) => adaptLearningThreadToComment(thread, currentUser?.id)),
    );
  }, [
    capabilities.allowComments,
    capabilities.allowQa,
    courseId,
    currentUser?.id,
    lessonId,
    threadsData,
  ]);

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
      (entryFilter !== "all" && enabledKinds.includes(entryFilter));

    if (!isCurrentFilterValid) {
      const fallback = enabledKinds.length > 1 ? "all" : enabledKinds[0]!;
      setEntryFilter(fallback);
    }
  }, [enabledKinds, entryFilter, isInteractionCapabilitiesLoading]);

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
      return [...backendNotes, ...backendThreads];
    }
    return [...backendNotes, ...entries];
  }, [backendNotes, backendThreads, entries, isBackendMode]);

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
        currentUserName: authorName,
        // All intentionally keeps the existing client-side mixed projection.
        // A globally ordered mixed cursor requires a backend unified-feed
        // contract and is deferred to that future migration.
        entries: isBackendMode ? dedupedBackendEntries : combinedEntries,
        filter: entryFilter,
        sort: feedSort,
        capabilities,
      }),
    [
      authorName,
      capabilities,
      combinedEntries,
      dedupedBackendEntries,
      entryFilter,
      feedSort,
      isBackendMode,
    ],
  );

  const loadMoreDiscussion = useCallback(async () => {
    if (entryFilter === "note") {
      if (hasNextNotesPage && !isFetchingNextNotesPage) {
        await fetchNextNotesPage();
      }
      return;
    }
    if (entryFilter === "all") {
      await Promise.all([
        hasNextThreadsPage && !isFetchingNextThreadsPage
          ? fetchNextThreadsPage()
          : undefined,
        hasNextNotesPage && !isFetchingNextNotesPage
          ? fetchNextNotesPage()
          : undefined,
      ]);
      return;
    }
    if (hasNextThreadsPage && !isFetchingNextThreadsPage) {
      await fetchNextThreadsPage();
    }
  }, [
    entryFilter,
    fetchNextNotesPage,
    fetchNextThreadsPage,
    hasNextNotesPage,
    hasNextThreadsPage,
    isFetchingNextNotesPage,
    isFetchingNextThreadsPage,
  ]);

  const hasNextDiscussionPage =
    isBackendMode &&
    (entryFilter === "note"
      ? Boolean(hasNextNotesPage)
      : entryFilter === "all"
        ? Boolean(hasNextThreadsPage || hasNextNotesPage)
        : Boolean(hasNextThreadsPage));
  const isFetchingNextDiscussionPage =
    isFetchingNextThreadsPage || isFetchingNextNotesPage;
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

  const lastHandledErrorThreadRef = useRef<string | null>(null);
  const suppressThreadUrlSyncRef = useRef(false);

  useEffect(() => {
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
    openThread,
    setSearchParams,
    threadEntries,
    threadIdFromUrl,
  ]);

  useEffect(() => {
    if (!threadIdFromUrl || !isBackendMode) {
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

    if (activeEntryKind === "note") {
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
        activeEntryKind,
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
        entryKind: activeEntryKind,
        isQuestion: activeEntryKind === "question",
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
        targetId: serverId,
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
    const clientId = entry ? getClientEntityId(entry) : String(id);
    const deletionKind = isBackendNote ? "note" : "thread";
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
        setSearchParams((prev) => {
          if (!prev.has("thread")) return prev;
          const next = new URLSearchParams(prev);
          next.delete("thread");
          return next;
        });
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
        draft={activeDraft}
        entryKind={activeEntryKind}
        visibility={activeVisibility}
        editingEntryId={editingEntry?.id ?? null}
        notice={notice}
        entryFilter={entryFilter}
        feedSort={feedSort}
        entries={filteredEntries}
        draftIsTooLong={draftIsTooLong}
        draftAttachmentCount={draftAttachmentCount}
        canSubmitDraft={canSubmitDraft}
        attachments={composerAttachments}
        onAttachmentsChange={setComposerAttachments}
        isNotesLoading={isNotesLoading}
        isNotesError={isNotesError}
        onRetryNotes={() => refetchNotes()}
        onLoadMore={loadMoreDiscussion}
        hasNextPage={hasNextDiscussionPage}
        isFetchingNextPage={isFetchingNextDiscussionPage}
        isThreadsLoading={isThreadsLoading}
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
          if (editingEntry) {
            setEditingEntry((current) =>
              current
                ? {
                    ...current,
                    entryKind: value,
                    visibility: getAllowedVisibility(value, current.visibility),
                  }
                : current,
            );
          } else {
            setEntryKind(value);
            setVisibility((current) => getAllowedVisibility(value, current));
          }
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
          setSearchParams((prev) => {
            const next = new URLSearchParams(prev);
            if (serverId) next.set("thread", serverId);
            else next.delete("thread");
            return next;
          });
        }}
        isBackendMode={isBackendMode}
        currentUserId={currentUser?.id}
        userRole={currentUserRole}
        onToggleAcceptReply={handleToggleAcceptReply}
        onToggleLockThread={handleToggleLockThread}
        onToggleBookmark={handleToggleBookmark}
        onToggleFollow={handleToggleFollow}
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
            setSearchParams((prev) => {
              if (!prev.has("thread")) return prev;
              const next = new URLSearchParams(prev);
              next.delete("thread");
              return next;
            });
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
  draft: DiscussionDraft;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: string | number | null;
  notice: string;
  entryFilter: DiscussionEntryFilter;
  feedSort: DiscussionFeedSort;
  entries: Comment[];
  draftIsTooLong: boolean;
  draftAttachmentCount: number;
  canSubmitDraft: boolean;
  isSubmitting?: boolean;
  isNotesLoading?: boolean;
  isNotesError?: boolean;
  onRetryNotes?: () => void;
  onLoadMore?: () => Promise<void>;
  hasNextPage?: boolean;
  isFetchingNextPage?: boolean;
  isThreadsLoading?: boolean;
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
  onReplyEditFailure?: () => void;
  onDeleteFailure?: (message: string) => void;
  courseId?: string;
}

export function shouldShowDiscussionEnd({
  isBackendMode,
  entryFilter,
  entryCount,
  hasNextPage,
  isNotesLoading,
  isThreadsLoading,
}: {
  isBackendMode: boolean;
  entryFilter: DiscussionEntryFilter;
  entryCount: number;
  hasNextPage: boolean;
  isNotesLoading: boolean;
  isThreadsLoading: boolean;
}): boolean {
  if (!isBackendMode || entryCount === 0 || hasNextPage) return false;
  if (entryFilter === "all") {
    return !isNotesLoading && !isThreadsLoading;
  }
  return entryFilter === "note" ? !isNotesLoading : !isThreadsLoading;
}

type DiscussionVirtualizer = {
  getTotalSize: () => number;
  getVirtualItems: () => Array<{ index: number; start: number }>;
  measureElement: (element: HTMLDivElement | null) => void;
};

type DiscussionVirtualFeedProps = {
  entries: Comment[];
  protectedEntryIndices: ReadonlySet<number>;
  renderEntry: (entry: Comment) => React.ReactNode;
  layoutKey?: string;
};

export function getDiscussionVirtualFeedScrollMargin(
  feed: HTMLElement | null,
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
  scrollMargin = 0,
  virtualizer,
}: DiscussionVirtualFeedProps & {
  feedRef?: React.Ref<HTMLDivElement>;
  scrollMargin?: number;
  virtualizer: DiscussionVirtualizer;
}) {
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      data-discussion-virtual-feed
      data-entry-count={entries.length}
      ref={feedRef}
      style={{ height: `${virtualizer.getTotalSize()}px` }}
      className="relative w-full"
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

function DiscussionScrollportVirtualFeed(
  props: DiscussionVirtualFeedProps,
) {
  const rangeExtractor = useDiscussionRangeExtractor(
    props.entries,
    props.protectedEntryIndices,
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  const syncScrollMargin = useCallback(() => {
    const nextScrollMargin = getDiscussionVirtualFeedScrollMargin(
      feedRef.current,
      getApplicationScrollElement(),
    );
    setScrollMargin((current) =>
      Math.abs(current - nextScrollMargin) > 1 ? nextScrollMargin : current,
    );
  }, []);

  useLayoutEffect(() => {
    syncScrollMargin();
    window.addEventListener("resize", syncScrollMargin);
    return () => window.removeEventListener("resize", syncScrollMargin);
  }, [props.entries.length, props.layoutKey, syncScrollMargin]);

  const virtualizer = useVirtualizer({
    count: props.entries.length,
    getScrollElement: getApplicationScrollElement,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    scrollMargin,
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor,
  });

  return (
    <DiscussionVirtualFeedRows
      {...props}
      feedRef={feedRef}
      scrollMargin={scrollMargin}
      virtualizer={{
        ...virtualizer,
        measureElement: (element) =>
          virtualizer.measureElement(element),
      }}
    />
  );
}

function DiscussionWindowVirtualFeed(props: DiscussionVirtualFeedProps) {
  const rangeExtractor = useDiscussionRangeExtractor(
    props.entries,
    props.protectedEntryIndices,
  );
  const feedRef = useRef<HTMLDivElement>(null);
  const [scrollMargin, setScrollMargin] = useState(0);

  useLayoutEffect(() => {
    const syncWindowScrollMargin = () => {
      const feed = feedRef.current;
      if (!feed) return;
      const nextMargin = getDiscussionVirtualFeedScrollMargin(feed, null);
      setScrollMargin((current) =>
        Math.abs(current - nextMargin) > 1 ? nextMargin : current,
      );
    };

    syncWindowScrollMargin();
    window.addEventListener("resize", syncWindowScrollMargin);
    return () => window.removeEventListener("resize", syncWindowScrollMargin);
  }, [props.entries.length, props.layoutKey]);

  const virtualizer = useWindowVirtualizer({
    count: props.entries.length,
    estimateSize: () => DISCUSSION_VIRTUAL_ESTIMATE_SIZE,
    getItemKey: (index) => getClientEntityId(props.entries[index]!),
    scrollMargin,
    initialRect: { width: 1024, height: 768 },
    overscan: DISCUSSION_VIRTUAL_OVERSCAN,
    rangeExtractor,
  });

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

function DiscussionVirtualFeed({
  useWindowScroll,
  ...props
}: DiscussionVirtualFeedProps & { useWindowScroll: boolean }) {
  return useWindowScroll ? (
    <DiscussionWindowVirtualFeed {...props} />
  ) : (
    <DiscussionScrollportVirtualFeed {...props} />
  );
}

function ThreadSurface({
  lessonDescription,
  isLessonDescriptionLoading = false,
  draft,
  entryKind,
  visibility,
  editingEntryId,
  notice,
  entryFilter,
  feedSort,
  entries,
  draftIsTooLong,
  draftAttachmentCount,
  canSubmitDraft,
  isSubmitting = false,
  isNotesLoading = false,
  isNotesError = false,
  onRetryNotes,
  onLoadMore,
  hasNextPage = false,
  isFetchingNextPage = false,
  isThreadsLoading = false,
  isThreadsError = false,
  onRetryThreads,
  mobileBottomNavigation,
  mobileBottomNavigationHidden,
  capabilities,
  isInteractionCapabilitiesLoading = false,
  isAllDisabled,
  availableFilters,
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
  onReplyEditFailure,
  onDeleteFailure,
  courseId,
}: ThreadSurfaceProps) {
  const isPhone = usePhoneComposerLayout();
  const deletionRevision = useOptimisticDeletionRevision();
  const composerHostRef = useRef<HTMLDivElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
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
        root: document.getElementById("courses-main-scrollport"),
        rootMargin: "600px 0px",
      },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, onLoadMore]);

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

      if (deletion?.phase === "undoable" || isRootEditing || hasUndoableChild) {
        indices.add(index);
      }
    });

    return indices;
  }, [deletionRevision, editingEntryId, entries]);

  const usesWindowScroll = isPhone || getApplicationScrollElement() === null;
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
        courseId={courseId}
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
      onToggleLockThread,
      userRole,
    ],
  );

  if (isInteractionCapabilitiesLoading) {
    return (
      <div>
        <LessonDescription
          description={lessonDescription}
          isLoading={isLessonDescriptionLoading}
        />
        <div
          className="mt-4 flex flex-col gap-3"
          data-testid="learner-interactions-loading"
        >
          <div className="h-10 w-full animate-pulse rounded-md bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
          <div className="flex gap-2">
            <div className="h-8 w-16 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
            <div className="h-8 w-24 animate-pulse rounded-lg bg-[color-mix(in_srgb,var(--surface)_70%,transparent)]" />
          </div>
        </div>
      </div>
    );
  }

  if (isAllDisabled) {
    return (
      <div>
        <LessonDescription
          description={lessonDescription}
          isLoading={isLessonDescriptionLoading}
        />
        <div
          className="py-8 text-center"
          data-testid="learner-interactions-disabled-message"
        >
          <p className="text-sm font-medium text-(--muted)">
            Learner interactions are disabled for this course.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <LessonDescription
        description={lessonDescription}
        isLoading={isLessonDescriptionLoading}
      />
      {!isPhone && (
        <div
          ref={composerHostRef}
          data-comment-composer-container
          className="mt-3 scroll-mt-4 sm:mt-4"
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

      {availableFilters.length > 0 && (
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
      )}

      <div
        className="mt-3.5 flex min-w-0 items-end max-[640px]:mt-2.5"
        data-discussion-feed-toolbar
      >
        <p className="min-w-0 truncate text-lg leading-none font-semibold tracking-[-0.02em] text-(--text)">
          Discussions
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

      <div
        className={`mt-2.5 ${isPhone ? "pb-36" : "pb-4"}`}
        data-discussion-feed-list
      >
        {entryFilter === "note" && isNotesLoading ? (
          <div
            className="py-12 text-center"
            data-testid="learning-notes-loading"
          >
            <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
            <p className="text-sm font-medium text-(--muted)">Loading notes…</p>
          </div>
        ) : entryFilter === "note" && isNotesError ? (
          <div className="py-12 text-center" data-testid="learning-notes-error">
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
        ) : entryFilter !== "note" &&
          isThreadsLoading &&
          entries.length === 0 ? (
          <div
            className="py-12 text-center"
            data-testid="learning-threads-loading"
          >
            <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
            <p className="text-sm font-medium text-(--muted)">
              Loading discussions…
            </p>
          </div>
        ) : entryFilter !== "note" && isThreadsError && entries.length === 0 ? (
          <div
            className="py-12 text-center"
            data-testid="learning-threads-error"
          >
            <p className="font-semibold text-(--text)">
              Failed to load discussions
            </p>
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
              useWindowScroll={usesWindowScroll}
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
            {shouldShowDiscussionEnd({
              isBackendMode,
              entryFilter,
              entryCount: entries.length,
              hasNextPage,
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
                  No{" "}
                  {entryFilter === "all"
                    ? "entries"
                    : getFilterName(entryFilter)}{" "}
                  yet
                </p>
                {availableFilters.some(([val]) => val === "all") && (
                  <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--muted)">
                    Choose All to return to the full lesson discussion.
                  </p>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {isPhone && composerMode !== "mobile" && (
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

      {isPhone && (
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
