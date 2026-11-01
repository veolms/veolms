import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { LoadingSpinnerIcon } from "../../components/LoadingSpinner";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../../components/ui/drawer";
import { ExpandableSearch } from "../../ExpandableSearch";
import { ThemedSelect } from "../../ThemedSelect";
import { CommentCard } from "../CommentCard";
import type { Comment } from "../CommentCard";
import { CommentComposer } from "../CommentComposer";
import { getApplicationScrollElement } from "../../shell/applicationScroll";
import {
  DISCUSSION_FEED_SORT_OPTIONS,
  getDiscussionFeedViewOptions,
  type DiscussionEntryFilter,
  type DiscussionFeedView,
  type InteractionCapabilities,
} from "../discussionFeed";
import { DiscussionEmptyState } from "../DiscussionEmptyState";
import { DiscussionLoadError } from "../DiscussionLoadError";
import { LessonDescription } from "../LessonDescription";
import type {
  DiscussionDraft,
  DiscussionEntryKind,
  DiscussionVisibility,
} from "../discussion-editor/types";
import type { LocalComposerAttachment } from "../../services/learning-interactions/attachment-model";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletionRevision,
} from "../../services/learning-interactions/optimistic-deletion-coordinator";
import {
  getClientEntityId,
  getServerEntityId,
} from "../../services/learning-interactions/interaction-entities";
import {
  MobileCompactComposerPortal,
  CompactComposer,
} from "./CompactComposer";
import {
  type ComposerMode,
  DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT,
  getDiscussionComposerViewportGeometry,
  usePhoneComposerLayout,
} from "./composerGeometry";
import { DiscussionVirtualFeed } from "./virtualFeed";
import type {
  LessonContentAccessState,
  LessonParticipationState,
} from "./discussionTypes";
import { usePhoneDiscussionScrollMemory } from "./phoneScroll";

interface ThreadSurfaceProps {
  /** Names this lesson's discussion when its scroll position is remembered. */
  scrollMemoryKey?: string;
  lessonDescription?: string | null;
  isLessonDescriptionLoading?: boolean;
  mobileLessonHeader?: React.ReactNode;
  draft: DiscussionDraft;
  /** Changes when a failed post's draft is put back into the composer. */
  draftRestoreToken?: number;
  entryKind: DiscussionEntryKind;
  visibility: DiscussionVisibility;
  editingEntryId: string | number | null;
  notice: string;
  entryFilter: DiscussionEntryFilter;
  feedView: DiscussionFeedView;
  /** The learner is signed in, so the feed can be narrowed to their own. */
  canFilterMine: boolean;
  /** What is typed into the discussion search, as typed. */
  search: string;
  /** The list being shown is the search's results. */
  isSearchActive: boolean;
  /** The list is still the last one, kept while the search's loads. */
  isSearchPending?: boolean;
  onSearchChange: (value: string) => void;
  entries: Comment[];
  noteDeepLinkTargetId?: string | null;
  onNoteDeepLinkHandled?: (noteId: string) => void;
  /** The thread a link led to; its card keeps a highlight in the list. */
  linkedThreadId?: string | null;
  /** The same thread while its highlight has still to play. */
  highlightedThreadId?: string | null;
  onThreadHighlightShown?: () => void;
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
  lessonContentAccess: LessonContentAccessState;
  lessonContentAccessReason?: "login" | "access" | null;
  canParticipate: boolean;
  participationState: LessonParticipationState;
  participationActionLabel?: string;
  onParticipationAction?: () => void;
  loginToParticipate?: boolean;
  /**
   * The session has said who the viewer is (their picture is known). Until
   * then a browser that remembers a session shows the picture this tab
   * remembers.
   */
  viewerKnown?: boolean;
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
  onFeedViewChange: (view: DiscussionFeedView) => void;
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
  /** May lock any thread and accept any answer (see Discussion). */
  canModerate?: boolean;
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
  onCopyTextNotice?: (message: string) => void;
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
  if (!isBackendMode || entryCount === 0 || hasNextPage || isNextPageError) {
    return false;
  }
  if (entryFilter === "all") {
    return !isNotesLoading && !isThreadsLoading;
  }
  return entryFilter === "note" ? !isNotesLoading : !isThreadsLoading;
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

/**
 * What only the desktop arrangement has (the composer above the list). The
 * page knows it is on a phone only once it runs (see
 * `usePhoneComposerLayout`, the same 640px); a page built ahead of time is
 * drawn in the desktop arrangement, so at phone width these are hidden
 * until the phone's takes its place, and nothing moves when it does.
 */
const DESKTOP_ONLY = "max-[640px]:hidden";

/** What pressing the composer does, for someone who may not post yet. */
function getParticipationLabel(actionLabel?: string) {
  return actionLabel === "Get access"
    ? "Get access to join the discussion"
    : "Log in to join the discussion";
}

export function ThreadSurface({
  scrollMemoryKey,
  lessonDescription,
  isLessonDescriptionLoading = false,
  mobileLessonHeader,
  draft,
  draftRestoreToken = 0,
  entryKind,
  visibility,
  editingEntryId,
  notice,
  entryFilter,
  feedView,
  canFilterMine,
  search,
  isSearchActive,
  isSearchPending = false,
  onSearchChange,
  entries,
  noteDeepLinkTargetId = null,
  onNoteDeepLinkHandled,
  linkedThreadId = null,
  highlightedThreadId = null,
  onThreadHighlightShown,
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
  lessonContentAccess,
  lessonContentAccessReason = null,
  canParticipate,
  participationState,
  participationActionLabel,
  onParticipationAction,
  loginToParticipate = false,
  viewerKnown = false,
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
  onFeedViewChange,
  onLike,
  onEdit,
  onDelete,
  onReport,
  onOpenThread,
  isBackendMode = false,
  currentUserId,
  canModerate,
  onToggleAcceptReply,
  onToggleLockThread,
  onToggleBookmark,
  onToggleFollow,
  onSeekToTimestamp,
  onCopyTextNotice,
  onReplyEditFailure,
  onDeleteFailure,
  courseId,
}: ThreadSurfaceProps) {
  const isPhone = usePhoneComposerLayout();
  // On a phone the search is a button until it is pressed.
  const [searchOpen, setSearchOpen] = useState(false);
  const deletionRevision = useOptimisticDeletionRevision();
  const composerHostRef = useRef<HTMLDivElement>(null);
  const feedSentinelRef = useRef<HTMLDivElement>(null);
  // On a phone the lesson's description and comments scroll together with
  // the video above them, so what scrolls is the lesson column holding both,
  // not this surface's own area.
  const discussionViewportRef = useRef<HTMLElement | null>(null);
  const attachDiscussionViewport = useCallback(
    (viewport: HTMLDivElement | null) => {
      discussionViewportRef.current =
        viewport?.closest<HTMLElement>(".learning-workspace__lesson-column") ??
        viewport;
    },
    [],
  );
  usePhoneDiscussionScrollMemory({
    viewportRef: discussionViewportRef,
    memoryKey: scrollMemoryKey,
    // A linked comment decides where the page goes instead.
    enabled: isPhone && lessonContentAccess === "granted" && !linkedThreadId,
    contentReady:
      !isInteractionCapabilitiesLoading &&
      !isLessonDescriptionLoading &&
      !isAllInitialLoading &&
      !isThreadsLoading,
  });
  // Description expansion moves the feed origin; refresh virtual scroll margin.
  const [descriptionLayoutRevision, setDescriptionLayoutRevision] = useState(0);
  const compactComposerScrollHidden =
    mobileBottomNavigation && mobileBottomNavigationHidden;
  const [composerMode, setComposerMode] = useState<ComposerMode>("collapsed");
  // Everyone sees the composer, from the first paint on, whether or not
  // they may post here: pressing it opens it for someone who may, asks a
  // visitor to log in and someone without access to get it (the course's
  // page). Pressed before the server has said which, it waits for the
  // answer. A visitor's has the guest's mark; it is in the prerendered page
  // and hidden from the first paint in a browser that remembers a session,
  // where one with the remembered picture is shown instead.
  const guestComposerShown =
    loginToParticipate &&
    !canParticipate &&
    enabledKinds.length > 0 &&
    Boolean(onParticipationAction);
  const viewerComposerShown =
    !canParticipate &&
    enabledKinds.length > 0 &&
    Boolean(onParticipationAction);
  const openLoginToParticipate = () => onParticipationAction?.();
  const [openWhenKnown, setOpenWhenKnown] = useState(false);
  // Assigned below, once the phone's composer can be opened.
  const openMobileComposerRef = useRef<() => void>(() => undefined);
  const askToParticipate = () => {
    if (participationState === "pending") setOpenWhenKnown(true);
    else onParticipationAction?.();
  };
  useEffect(() => {
    if (!openWhenKnown || participationState === "pending") return;
    setOpenWhenKnown(false);
    if (!canParticipate) {
      onParticipationAction?.();
    } else if (isPhone) {
      openMobileComposerRef.current();
    } else {
      setComposerMode("desktop");
    }
  }, [
    canParticipate,
    isPhone,
    onParticipationAction,
    openWhenKnown,
    participationState,
  ]);
  // The empty list offers to start what its filter shows: a question under
  // Q&As, a note under Notes. It offers nothing to someone who cannot post
  // here, or cannot post that kind.
  const emptyStateKind = entryFilter === "all" ? null : entryFilter;
  const canStartFromEmptyState =
    canParticipate &&
    enabledKinds.length > 0 &&
    (emptyStateKind === null || enabledKinds.includes(emptyStateKind));
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
  openMobileComposerRef.current = openMobileComposer;

  const startFromEmptyState = () => {
    if (emptyStateKind) onEntryKindChange(emptyStateKind);
    if (isPhone) openMobileComposer();
    else setComposerMode("desktop");
  };

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

  const newEntryDocumentId =
    draftRestoreToken === 0
      ? "discussion-new"
      : `discussion-new-restored-${draftRestoreToken}`;

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
    if (!sentinel || !onLoadMore || !hasNextPage || isFetchingNextPage) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deletionRevision is not read here: it changes when the deletion coordinator read above does
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
        canModerate={canModerate}
        onToggleAcceptReply={onToggleAcceptReply}
        onToggleLockThread={onToggleLockThread}
        onToggleBookmark={onToggleBookmark}
        onToggleFollow={onToggleFollow}
        onSeekToTimestamp={onSeekToTimestamp}
        onCopyTextNotice={onCopyTextNotice}
        courseId={courseId}
        canParticipate={canParticipate}
        constrainToContainer
        canEdit={
          canParticipate &&
          (entry.entryKind !== "note" || capabilities.allowNotes)
        }
        canDelete={
          canParticipate &&
          (entry.entryKind !== "note" || capabilities.allowNotes)
        }
        isDeepLinkTarget={Boolean(
          noteDeepLinkTargetId &&
          entry.entryKind === "note" &&
          getServerEntityId(entry) === noteDeepLinkTargetId,
        )}
        showHighlightedLabel={Boolean(
          linkedThreadId &&
          entry.entryKind !== "note" &&
          getServerEntityId(entry) === linkedThreadId,
        )}
        isHighlighted={Boolean(
          highlightedThreadId &&
          entry.entryKind !== "note" &&
          getServerEntityId(entry) === highlightedThreadId,
        )}
        onHighlightShown={onThreadHighlightShown}
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
      onCopyTextNotice,
      onToggleLockThread,
      capabilities.allowNotes,
      canParticipate,
      noteDeepLinkTargetId,
      linkedThreadId,
      highlightedThreadId,
      onThreadHighlightShown,
      canModerate,
    ],
  );

  const discussionDescription = (
    <LessonDescription
      description={lessonDescription}
      isLoading={isLessonDescriptionLoading}
      onSeekToTimestamp={onSeekToTimestamp}
      onExpandedChange={() =>
        setDescriptionLayoutRevision((revision) => revision + 1)
      }
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

  const lessonAccessMessage =
    lessonContentAccess === "denied"
      ? lessonContentAccessReason === "login"
        ? "Log in to read this lesson's discussions."
        : lessonContentAccessReason === "access"
          ? "Get access to this course to read this lesson's discussions."
          : "This lesson's discussions are not available yet."
      : "Checking lesson access before loading discussions.";

  // While the lesson itself is still loading there is nothing to check yet:
  // the discussion shows its usual loading state, not an access message.
  const isWaitingForLesson =
    lessonContentAccess === "pending" && isInteractionCapabilitiesLoading;

  if (lessonContentAccess !== "granted" && !isWaitingForLesson) {
    const accessStateMessage = (
      <div
        className="flex min-h-48 flex-col items-center justify-center py-12 text-center"
        data-testid={
          lessonContentAccess === "denied"
            ? "learning-discussion-access-denied"
            : "learning-discussion-access-pending"
        }
        role={lessonContentAccess === "pending" ? "status" : undefined}
        aria-label={
          lessonContentAccess === "pending" ? "Loading discussion" : undefined
        }
      >
        {lessonContentAccess === "pending" ? (
          <LoadingSpinnerIcon size={24} />
        ) : null}
        <p className="mt-3 text-sm font-medium text-(--muted)">
          {lessonAccessMessage}
        </p>
      </div>
    );

    if (isPhone) {
      return (
        <div className="mt-2.5 flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={attachDiscussionViewport}
            data-discussion-scroll-viewport
            className="flex min-w-0 max-w-full flex-1 flex-col touch-pan-y"
          >
            <div
              data-discussion-scroll-header
              className="min-w-0 max-w-full shrink-0"
            >
              {mobileLessonHeader}
              {discussionDescription}
            </div>
            {accessStateMessage}
          </div>
        </div>
      );
    }

    return (
      <div>
        {discussionDescription}
        {accessStateMessage}
      </div>
    );
  }

  if (isAllDisabled) {
    if (isPhone) {
      return (
        <div className="mt-2.5 flex min-h-0 min-w-0 flex-1 flex-col">
          <div
            ref={attachDiscussionViewport}
            data-discussion-scroll-viewport
            className="flex min-w-0 max-w-full flex-1 flex-col touch-pan-y"
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

  // The kinds to show, and beside them the search: a field at the row's end
  // on a wider screen, a button on a phone that opens the field over the
  // kinds. A page built ahead of time is drawn in the wider arrangement, so
  // at phone width its field is hidden until the phone's button takes over.
  const discussionFilters =
    availableFilters.length > 0 ? (
      <div className="mt-3 flex w-full min-w-0 items-start gap-2 sm:mt-5">
        <ExpandableSearch
          inputId="discussion-search-input"
          label="Search discussions"
          placeholder="Search discussions..."
          value={search}
          onValueChange={onSearchChange}
          open={searchOpen}
          onOpenChange={setSearchOpen}
          persistentDesktop={!isPhone}
          forcePersistentDesktop
          size="compact"
          shortcut={false}
          clearOnBack
          closeOnEmptyBlur
          backLabel="Back from discussion search"
          shellClassName={isPhone ? "" : "max-[640px]:hidden"}
          triggerIconSize={19}
        >
          <div
            role="group"
            aria-label="Filter discussion entries"
            className="learning-discussion__filter-group flex min-w-0 flex-1 gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
        </ExpandableSearch>
      </div>
    ) : null;
  const discussionToolbar = (
    <div
      className="mt-3.5 flex min-w-0 items-end max-[640px]:mt-2.5"
      data-discussion-feed-toolbar
    >
      <p className="min-w-0 truncate text-lg leading-none font-semibold tracking-[-0.02em] text-(--text)">
        {/* The count is of everyone's; it is not said beside only the
            learner's own (the menu beside it then says "My Comments" and
            so on). Nor is it said over a search's results, which it does
            not count. */}
        {isSearchActive ? (
          "Results"
        ) : feedView === "mine" ? (
          "Discussions"
        ) : (
          <>
            {/* The number has a slot two figures wide from the start, a
                shimmer until it is known, so neither it nor the words after
                it move when it arrives. A single figure stands in its
                middle, and the words follow closer than a space would put
                them, so a short number does not stand apart from them. */}
            <span className="mr-[0.22em] inline-block min-w-[2ch] text-center tabular-nums">
              {discussionCount === undefined ? (
                // Two unseen figures hold the line at the height the number
                // will give it; the shimmer is laid over them, a little
                // taller, without taking any room of its own.
                <span aria-hidden="true" className="relative">
                  <span className="invisible">00</span>
                  <span className="absolute -inset-x-[0.06em] -inset-y-[0.1em] animate-pulse rounded-full bg-[color-mix(in_srgb,var(--text)_14%,transparent)] motion-reduce:animate-none" />
                </span>
              ) : (
                discussionCount
              )}
            </span>
            Discussions
          </>
        )}
      </p>
      <span
        className="shrink-0 text-lg leading-none text-(--text-secondary)"
        aria-hidden="true"
        data-discussion-feed-separator
      >
        {"\u00A0\u00A0·\u00A0\u00A0"}
      </span>
      <ThemedSelect
        value={feedView}
        onValueChange={onFeedViewChange}
        ariaLabel="Sort discussions"
        options={
          canFilterMine
            ? getDiscussionFeedViewOptions(entryFilter)
            : DISCUSSION_FEED_SORT_OPTIONS
        }
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

  // A comment a link points at arrives before the lesson and the rest of
  // the list, and shows above their loading state instead of waiting.
  const linkedEntry = linkedThreadId
    ? entries.find((entry) => getServerEntityId(entry) === linkedThreadId)
    : undefined;
  const discussionLoadingWithLinkedEntry = linkedEntry ? (
    <>
      {renderEntry(linkedEntry)}
      {discussionLoadingContent}
    </>
  ) : (
    discussionLoadingContent
  );

  const discussionContent = isInteractionCapabilitiesLoading ? (
    discussionLoadingWithLinkedEntry
  ) : isThreadDeepLinkPending ? (
    <div
      className="flex min-h-0 flex-1 flex-col items-center justify-center py-12 text-center"
      data-testid="learning-thread-deep-link-loading"
      role="status"
      aria-label="Loading discussion"
    >
      <LoadingSpinnerIcon size={24} />
    </div>
  ) : isAllInitialLoading ? (
    discussionLoadingWithLinkedEntry
  ) : // A failed list keeps its message while it is asked for again (see
  // `DiscussionLoadError`), so it is checked before the loading state.
  entryFilter === "note" && isNotesError && entries.length === 0 ? (
    <DiscussionLoadError
      subject="your notes"
      testId="learning-notes-error"
      onRetry={onRetryNotes}
      retrying={isNotesLoading}
    />
  ) : entryFilter === "note" && isNotesLoading && entries.length === 0 ? (
    discussionLoadingContent
  ) : entryFilter !== "note" && isThreadsError && entries.length === 0 ? (
    <DiscussionLoadError
      subject="the discussion"
      testId="learning-threads-error"
      onRetry={onRetryThreads}
      retrying={isThreadsLoading}
    />
  ) : entryFilter !== "note" && isThreadsLoading && entries.length === 0 ? (
    discussionLoadingContent
  ) : (
    <>
      <DiscussionVirtualFeed
        entries={entries}
        protectedEntryIndices={protectedEntryIndices}
        renderEntry={renderEntry}
        layoutKey={`${composerMode}:${entryFilter}:${isLessonDescriptionLoading}:${descriptionLayoutRevision}`}
        viewportRef={discussionViewportRef}
        isPhone={isPhone}
        stale={isSearchPending}
      />
      {isBackendMode && hasNextPage && (
        <div ref={feedSentinelRef} className="h-1" aria-hidden="true" />
      )}
      {isBackendMode && isFetchingNextPage && (
        <div
          className="grid place-items-center py-4"
          data-testid="learning-feed-loading-more"
          role="status"
          aria-label="Loading more discussions"
        >
          <LoadingSpinnerIcon size={18} />
        </div>
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
        <DiscussionEmptyState
          filter={entryFilter}
          mine={feedView === "mine"}
          searching={isSearchActive}
          canReturnToAll={
            entryFilter !== "all" &&
            availableFilters.some(([val]) => val === "all")
          }
          onStart={canStartFromEmptyState ? startFromEmptyState : undefined}
        />
      )}
    </>
  );

  // With a linked comment the list keeps at least a screen of height, while
  // it loads and after: the comment can then be brought to the middle of the
  // screen before the rest of the list exists, and the page does not lose
  // that scroll position in the instant the placeholders are swapped out.
  const sizedDiscussionContent = linkedThreadId ? (
    <div className="min-h-dvh">{discussionContent}</div>
  ) : (
    discussionContent
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {!isPhone && discussionDescription}
      {/* The composer is always there (see `viewerComposerShown`). */}
      {!isPhone && enabledKinds.length > 0 && canParticipate && (
        <div
          ref={composerHostRef}
          data-comment-composer-container
          className={`${
            hasDescriptionSurface ? "mt-3 scroll-mt-4 sm:mt-4" : "scroll-mt-4"
          } ${DESKTOP_ONLY}`}
        >
          {canParticipate && composerMode === "desktop" ? (
            <CommentComposer
              draft={draft}
              avatar={authorAvatar}
              documentId={
                editingEntryId === null
                  ? newEntryDocumentId
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
      {!isPhone && viewerComposerShown && (
        <div
          data-comment-composer-container
          className={`${
            hasDescriptionSurface ? "mt-3 scroll-mt-4 sm:mt-4" : "scroll-mt-4"
          } ${DESKTOP_ONLY} ${loginToParticipate ? "hidden [:root[data-session-hint=signed-in]_&]:block" : ""}`}
        >
          <CompactComposer
            draft={draft}
            attachmentCount={0}
            promptText={promptText}
            avatar={authorAvatar}
            rememberedViewer={!viewerKnown}
            label={
              participationState === "pending"
                ? "Open discussion composer"
                : getParticipationLabel(participationActionLabel)
            }
            onOpen={askToParticipate}
          />
        </div>
      )}
      {!isPhone && guestComposerShown && (
        <div
          data-comment-composer-container
          className={`${
            hasDescriptionSurface ? "mt-3 scroll-mt-4 sm:mt-4" : "scroll-mt-4"
          } ${DESKTOP_ONLY} [:root[data-session-hint=signed-in]_&]:hidden!`}
        >
          <CompactComposer
            draft={draft}
            attachmentCount={0}
            promptText={promptText}
            avatar={null}
            label="Log in to join the discussion"
            opensOnTyping
            guest
            onOpen={openLoginToParticipate}
          />
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
            ? // No gap above the list on a phone: it carries the space
              // as its own padding.
              "flex min-h-0 min-w-0 flex-1 flex-col"
            : "mt-2.5 min-w-0 max-w-full max-[640px]:mt-0"
        }
        data-discussion-feed-list
      >
        {isPhone ? (
          <div
            ref={attachDiscussionViewport}
            data-discussion-scroll-viewport
            // This area runs out through the lesson panel's side padding and
            // pads itself by the same amount, so its content stays where it
            // was while a highlighted comment's tint can reach the screen
            // edges instead of being clipped at the padding. It does not
            // scroll itself: the lesson column around the video does (see
            // attachDiscussionViewport).
            className="-mx-(--learning-lesson-content-inset) flex min-w-0 flex-1 flex-col touch-pan-y overflow-x-clip px-(--learning-lesson-content-inset) pt-2.5 pb-5.5"
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
            {sizedDiscussionContent}
            {/* Someone who cannot post gets no composer and no prompt in its
                place. The list still ends clear of the bottom navigation. */}
            {isPhone &&
            !canParticipate &&
            !viewerComposerShown &&
            mobileBottomNavigation ? (
              <div
                aria-hidden="true"
                className="h-[calc(58px+var(--app-viewport-safe-area-bottom))] shrink-0"
              />
            ) : null}
          </div>
        ) : (
          <div className="min-w-0 max-w-full">{sizedDiscussionContent}</div>
        )}
      </div>

      {isPhone &&
        enabledKinds.length > 0 &&
        canParticipate &&
        composerMode !== "mobile" && (
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
      {isPhone && viewerComposerShown && !loginToParticipate && (
        <MobileCompactComposerPortal
          draft={draft}
          attachmentCount={0}
          promptText={promptText}
          avatar={authorAvatar}
          label={
            participationState === "pending"
              ? "Open discussion composer"
              : getParticipationLabel(participationActionLabel)
          }
          mobileBottomNavigation={mobileBottomNavigation}
          scrollHidden={compactComposerScrollHidden}
          onOpen={askToParticipate}
        />
      )}
      {isPhone && guestComposerShown && (
        <MobileCompactComposerPortal
          draft={draft}
          attachmentCount={0}
          promptText={promptText}
          avatar={null}
          label="Log in to join the discussion"
          opensOnTyping
          guest
          mobileBottomNavigation={mobileBottomNavigation}
          scrollHidden={compactComposerScrollHidden}
          onOpen={openLoginToParticipate}
        />
      )}

      {isPhone && enabledKinds.length > 0 && canParticipate && (
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
                  ? newEntryDocumentId
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
