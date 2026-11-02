import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { BellSimpleIcon as BellSimple } from "@phosphor-icons/react/BellSimple";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { ArrowsInIcon as ArrowsIn } from "@phosphor-icons/react/ArrowsIn";
import { ArrowsOutIcon as ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { LockOpenIcon as LockOpen } from "@phosphor-icons/react/LockOpen";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { flushSync } from "react-dom";
import { QueryClientContext } from "@tanstack/react-query";
import { Swiper, SwiperSlide } from "swiper/react";
import type { Swiper as SwiperInstance } from "swiper/types";
import "swiper/css";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from "../components/ui/drawer";
import {
  CommentActionMenu,
  InlineEditForm,
  shareDiscussionEntry,
  type Comment,
  type CommentReply,
} from "./CommentCard";
import {
  useCreateReply,
  useDeleteReply,
  useThreadReplies,
  useUpdateReply,
  desiredStateCoordinator,
} from "../services/learning-interactions";
import {
  createClientEntityId,
  toInteractionAttachment,
  type LocalComposerAttachment,
} from "../services/learning-interactions/attachment-model";
import {
  optimisticDeletionCoordinator,
  useOptimisticDeletion,
} from "../services/learning-interactions/optimistic-deletion-coordinator";
import { optimisticEditCoordinator } from "../services/learning-interactions/optimistic-edit-coordinator";
import { interactionCreationCoordinator } from "../services/learning-interactions/interaction-creation-coordinator";
import {
  getClientEntityId,
  getServerEntityId,
} from "../services/learning-interactions/interaction-entities";
import {
  flattenReplyPages,
  getReplyTotalCount,
} from "../services/learning-interactions/reply-pagination";
import { adaptLearningReplyToCommentReply } from "./learning-replies.adapter";
import { UndoDeleteButton } from "./useUndoableDeletion";
import { useThreadSwipeAxisLock } from "./useThreadSwipeAxisLock";
import {
  DiscussionAttachmentsList,
  type DiscussionAttachmentItem,
} from "./discussion-attachments";
import { DiscussionAvatar } from "./DiscussionAvatar";
import { ProfileLink } from "../profiles/ProfileLink";
import {
  DiscussionEditor,
  preloadDiscussionEditor,
} from "./discussion-editor/DiscussionEditor";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import {
  createDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "./discussion-editor/types";
import { SurfaceTopRightAccentGlow } from "./SurfaceTopRightAccentGlow";
import { ThreadReplyComposer } from "./ThreadReplyComposer";
import type { LessonParticipationState } from "./Discussion";
import { TimeAgo } from "../components/TimeAgo";
import { cheerLike } from "../components/likeFeedback";

const THREAD_PANEL_MIN_HEIGHT = 360;
const THREAD_PANEL_PHONE_QUERY = "(max-width: 639px)";
const THREAD_PANEL_MOBILE_SNAP_RATIO = 0.72;
const THREAD_PANEL_SLIDE_DURATION = 320;
// The panel reports when it has finished opening. This is the wait before it
// is taken as open anyway, for the case where that report never comes.
const THREAD_PANEL_OPEN_SETTLE_TIMEOUT = 1000;
// How many frames in a row the lesson's sides may stay put before the panel
// stops checking them at the start of every frame.
const THREAD_PANEL_FOLLOW_REST_FRAMES = 12;
const THREAD_PANEL_INITIAL_VIEWPORT: ViewportBounds = {
  top: 0,
  height: 768,
  width: 1024,
};
const useThreadPanelLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;

interface DiscussionThreadPanelProps {
  open: boolean;
  activeEntryId: string | number | null;
  entries: Comment[];
  isBackendMode?: boolean;
  currentUserId?: string;
  /** May lock any thread and accept any answer (see Discussion). */
  canModerate?: boolean;
  currentUser?: {
    name: string;
    avatar: string;
  };
  canParticipate?: boolean;
  participationState?: LessonParticipationState;
  participationActionLabel?: string;
  onParticipationAction?: () => void;
  focusComposerOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  /** The panel has finished sliding shut and is no longer on screen. */
  onCloseComplete?: () => void;
  onActiveEntryChange: (entryId: string | number) => void;
  onLike: (id: string | number, liked: boolean) => void;
  onAddReply: (entryId: string | number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: string | number) => void;
  onEditReply: (
    entryId: string | number,
    replyId: string | number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: string | number, replyId: string | number) => void;
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
  onToggleAcceptReply?: (
    threadId: string | number,
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
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
  onReplyCreateError?: () => void;
  onReplyEditError?: () => void;
  onReplyDeleteError?: () => void;
  courseId?: string;
  lessonId?: string;
}

export function DiscussionThreadPanel({
  open,
  activeEntryId: latestActiveEntryId,
  entries: latestEntries,
  isBackendMode = false,
  currentUserId,
  canModerate,
  currentUser,
  canParticipate = true,
  participationState = "granted",
  participationActionLabel,
  onParticipationAction,
  focusComposerOnOpen = false,
  onOpenChange,
  onCloseComplete,
  onActiveEntryChange,
  onLike,
  onAddReply,
  onEditEntry,
  onDeleteEntry,
  onEditReply,
  onDeleteReply,
  onReport,
  onToggleAcceptReply,
  onToggleLockThread,
  onToggleBookmark,
  onToggleFollow,
  onSeekToTimestamp,
  onCopyTextNotice,
  onReplyCreateError,
  onReplyEditError,
  onReplyDeleteError,
  courseId,
  lessonId,
}: DiscussionThreadPanelProps) {
  const isPhone = useThreadPanelPhoneLayout();
  const drawerKey = isPhone
    ? "phone-discussion-thread"
    : "desktop-discussion-thread";
  // A drawer that is already open on its first render is shown without its
  // opening transition. So each drawer starts closed and is opened once it
  // is in place, which is what makes the panel slide in.
  const [placedDrawerKey, setPlacedDrawerKey] = useState<string | null>(null);
  const drawerOpen = open && placedDrawerKey === drawerKey;
  // While the panel slides shut it keeps showing the thread it had open; by
  // then the page has already cleared its selection.
  const [shown, setShown] = useState({
    entries: latestEntries,
    activeEntryId: latestActiveEntryId,
  });
  if (
    open &&
    (shown.entries !== latestEntries ||
      shown.activeEntryId !== latestActiveEntryId)
  ) {
    setShown({ entries: latestEntries, activeEntryId: latestActiveEntryId });
  }
  const entries = open ? latestEntries : shown.entries;
  const activeEntryId = open ? latestActiveEntryId : shown.activeEntryId;
  // Set once the panel has finished sliding in. Until then it renders only
  // what its first frame shows (the open thread, without the reply editor),
  // so it starts moving as soon as it is asked for.
  const [openSettled, setOpenSettled] = useState(false);
  const viewport = useVisualViewportBounds();
  const surfaceBounds = useThreadPanelSurfaceBounds(viewport);
  const swiperRef = useRef<SwiperInstance | null>(null);
  const handleSwiperReady = useCallback((swiper: SwiperInstance) => {
    swiperRef.current = swiper;
  }, []);
  const heightResizeRef = useRef<PanelHeightResize | null>(null);
  const wasOpenRef = useRef(false);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [resizingHeight, setResizingHeight] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const mobileCollapsedSnapPoint = Math.min(
    viewport.height,
    Math.max(320, Math.round(viewport.height * THREAD_PANEL_MOBILE_SNAP_RATIO)),
  );
  const [mobileSnapPoint, setMobileSnapPoint] = useState<number | null>(
    mobileCollapsedSnapPoint,
  );
  const mobileSnapPoints = useMemo(
    () => [mobileCollapsedSnapPoint, 1],
    [mobileCollapsedSnapPoint],
  );
  const mobileVisibleHeight =
    mobileSnapPoint === 1
      ? viewport.height
      : Math.min(
          viewport.height,
          typeof mobileSnapPoint === "number"
            ? mobileSnapPoint
            : mobileCollapsedSnapPoint,
        );
  const [composerFocusRequest, setComposerFocusRequest] = useState<{
    id: number;
    entryId: string | number | null;
  }>({ id: 0, entryId: null });
  const foundIndex = entries.findIndex((entry) =>
    matchesEntryIdentity(entry, activeEntryId),
  );
  const activeIndex = foundIndex >= 0 ? foundIndex : 0;
  const requestComposerFocus = useCallback((entryId: string | number) => {
    setComposerFocusRequest((current) => ({
      id: current.id + 1,
      entryId,
    }));
  }, []);
  const handleComposerFocusHandled = useCallback(
    (entryId: string | number, requestId: number) => {
      setComposerFocusRequest((current) =>
        current.id === requestId && current.entryId === entryId
          ? { ...current, entryId: null }
          : current,
      );
    },
    [],
  );

  useThreadPanelLayoutEffect(() => {
    setPlacedDrawerKey(drawerKey);
  }, [drawerKey]);

  const hasOpenedRef = useRef(false);
  useEffect(() => {
    if (drawerOpen) hasOpenedRef.current = true;
    // Asked to close before it ever opened: there is no slide to wait for.
    else if (!open && !hasOpenedRef.current) onCloseComplete?.();
  }, [drawerOpen, onCloseComplete, open]);

  useEffect(() => {
    if (!drawerOpen || openSettled) return;
    const timer = window.setTimeout(
      () => setOpenSettled(true),
      THREAD_PANEL_OPEN_SETTLE_TIMEOUT,
    );
    return () => window.clearTimeout(timer);
  }, [drawerOpen, openSettled]);

  useEffect(() => {
    // Fetched while the panel slides in, so the reply editor is ready to be
    // put in place when it stops.
    if (canParticipate) preloadDiscussionEditor();
  }, [canParticipate]);

  const clampPanelHeight = useCallback(
    (height: number) => {
      const availableHeight = Math.max(1, surfaceBounds.app.height);
      const minimumHeight = Math.min(THREAD_PANEL_MIN_HEIGHT, availableHeight);
      return Math.min(availableHeight, Math.max(minimumHeight, height));
    },
    [surfaceBounds.app.height],
  );

  useEffect(() => {
    if (!open) {
      wasOpenRef.current = false;
      return;
    }

    const isOpening = !wasOpenRef.current;
    const animateBetweenThreads =
      !isOpening &&
      !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    swiperRef.current?.slideTo(
      activeIndex,
      animateBetweenThreads ? THREAD_PANEL_SLIDE_DURATION : 0,
    );
    wasOpenRef.current = true;
    if (
      activeEntryId !== null &&
      foundIndex >= 0 &&
      (isOpening || focusComposerOnOpen || !isPhone)
    ) {
      requestComposerFocus(activeEntryId);
    }
  }, [
    activeEntryId,
    activeIndex,
    focusComposerOnOpen,
    isPhone,
    open,
    requestComposerFocus,
  ]);

  useEffect(() => {
    if (isPhone) return;
    setPanelHeight((current) =>
      current === null ? null : clampPanelHeight(current),
    );
  }, [clampPanelHeight, isPhone]);

  useEffect(() => {
    if (!open || !isPhone) return;
    setExpanded(false);
    setMobileSnapPoint(mobileCollapsedSnapPoint);
  }, [isPhone, mobileCollapsedSnapPoint, open]);

  const commitPanelHeight = useCallback(
    (height: number) => setPanelHeight(clampPanelHeight(height)),
    [clampPanelHeight],
  );

  const beginHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isPhone || expanded) return;
    event.preventDefault();
    heightResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: clampPanelHeight(panelHeight ?? surfaceBounds.lesson.height),
    };
    setResizingHeight(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = heightResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setPanelHeight(
      clampPanelHeight(resize.startHeight + (resize.startY - event.clientY)),
    );
  };

  const endHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = heightResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const nextHeight = clampPanelHeight(
      resize.startHeight + (resize.startY - event.clientY),
    );
    heightResizeRef.current = null;
    setResizingHeight(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitPanelHeight(nextHeight);
  };

  const activeSurface = expanded ? surfaceBounds.app : surfaceBounds.lesson;
  // The panel is as wide as the lesson it belongs to, touching both of its
  // edges (or as wide as the whole page while expanded). Only its height is
  // the reader's to set.
  const resolvedPanelWidth = isPhone ? viewport.width : activeSurface.width;
  const resolvedPanelHeight = isPhone
    ? viewport.height
    : expanded
      ? activeSurface.height
      : clampPanelHeight(panelHeight ?? surfaceBounds.lesson.height);
  const appLeft = surfaceBounds.app.right - surfaceBounds.app.width;
  const clipRight = expanded
    ? surfaceBounds.app.right
    : surfaceBounds.lesson.right;
  const clipBottom = surfaceBounds.app.top + surfaceBounds.app.height;
  const viewportInsetTop = Math.max(0, surfaceBounds.app.top);
  const viewportInsetRight = Math.max(0, viewport.width - clipRight);
  const viewportInsetBottom = Math.max(0, viewport.height - clipBottom);
  const viewportInsetLeft = Math.max(0, appLeft);
  const panelViewportStyle = isPhone
    ? undefined
    : ({
        top: `${viewportInsetTop}px`,
        right: "auto",
        bottom: "auto",
        left: `${viewportInsetLeft}px`,
        width: `${Math.max(0, viewport.width - viewportInsetLeft - viewportInsetRight)}px`,
        height: `${Math.max(0, viewport.height - viewportInsetTop - viewportInsetBottom)}px`,
        overflow: "hidden",
      } as CSSProperties);
  const panelStyle = isPhone
    ? ({
        "--drawer-content-width": `${viewport.width}px`,
        "--drawer-content-height": `${viewport.height}px`,
        "--drawer-content-max-height": `${viewport.height}px`,
        top: "auto",
        left: "0px",
        right: "auto",
        bottom: "0px",
      } as CSSProperties)
    : ({
        position: "absolute",
        "--drawer-content-width": `${resolvedPanelWidth}px`,
        "--drawer-content-height": `${resolvedPanelHeight}px`,
        "--drawer-content-max-height": `${surfaceBounds.app.height}px`,
        top: expanded ? "0px" : "auto",
        left: "auto",
        right: "0px",
        bottom: expanded ? "auto" : "0px",
      } as ThreadPanelStyle);

  return (
    <Drawer
      key={drawerKey}
      open={drawerOpen}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        setOpenSettled(nextOpen);
        if (!nextOpen) {
          setExpanded(false);
          setPanelHeight(null);
          setMobileSnapPoint(mobileCollapsedSnapPoint);
          onCloseComplete?.();
        }
      }}
      snapPoints={isPhone ? mobileSnapPoints : undefined}
      snapPoint={isPhone ? mobileSnapPoint : undefined}
      onSnapPointChange={
        isPhone
          ? (snapPoint) => {
              if (typeof snapPoint === "number" || snapPoint === null) {
                setMobileSnapPoint(snapPoint);
              }
            }
          : undefined
      }
      snapToSequentialPoints={isPhone}
      showSwipeHandle={isPhone}
      swipeDirection={isPhone ? "down" : "right"}
      swipeHandleClassName="absolute inset-x-0 top-0 z-30 pt-2.5 after:w-18 after:bg-[color-mix(in_srgb,var(--text)_42%,transparent)] after:shadow-[0_1px_3px_rgba(0,0,0,0.35)]"
      modal={false}
      disablePointerDismissal
    >
      <DrawerContent
        aria-label="Discussion thread"
        initialFocus={false}
        style={panelStyle}
        viewportStyle={panelViewportStyle}
        data-base-ui-swipe-ignore={isPhone ? undefined : ""}
        data-panel-expanded={expanded || undefined}
        data-panel-resizing={resizingHeight ? "true" : undefined}
        className={`m-0! overflow-hidden border-0! [--drawer-bleed-background:color-mix(in_srgb,var(--app-shell)_92%,transparent)] [--stack-scale:1]! bg-[color-mix(in_srgb,var(--app-shell)_92%,transparent)] shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-[calc(var(--sidebar-floating-base-blur,6px)+var(--sidebar-backdrop-blur,8px))] backdrop-saturate-[1.2] data-[panel-resizing=true]:transition-none! data-expanded:rounded-none! data-[swipe-axis=x]:flex-col! data-[swipe-direction=right]:rounded-none! sm:border! sm:border-[color-mix(in_srgb,var(--text)_14%,transparent)] sm:shadow-[0_30px_90px_rgba(0,0,0,0.55),0_0_0_1px_color-mix(in_srgb,var(--text)_5%,transparent)] sm:data-[swipe-direction=right]:rounded-xl! motion-reduce:transition-none! ${
          isPhone
            ? ""
            : "transform-none! translate-x-0! transition-[translate]! duration-300! ease-out! will-change-[translate] data-starting-style:translate-x-[calc(100%+2px)]! data-ending-style:translate-x-[calc(100%+2px)]! data-ending-style:duration-240! data-ending-style:ease-out!"
        }`}
      >
        <SurfaceTopRightAccentGlow />

        {!isPhone && !expanded && (
          <div
            data-base-ui-swipe-ignore=""
            data-learning-swipe-ignore=""
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize discussion thread height"
            aria-valuemin={Math.min(
              THREAD_PANEL_MIN_HEIGHT,
              surfaceBounds.app.height,
            )}
            aria-valuemax={Math.round(surfaceBounds.app.height)}
            aria-valuenow={Math.round(resolvedPanelHeight)}
            tabIndex={0}
            title="Resize discussion thread height"
            className="group/resize-top absolute inset-x-0 top-0 z-30 flex h-5 cursor-ns-resize touch-none items-start justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
                return;
              }
              if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
                return;
              }
              event.preventDefault();
              commitPanelHeight(
                resolvedPanelHeight + (event.key === "ArrowUp" ? 24 : -24),
              );
            }}
            onPointerDown={beginHeightResize}
            onPointerMove={moveHeightResize}
            onPointerUp={endHeightResize}
            onPointerCancel={endHeightResize}
          >
            <span className="mt-0 h-0.5 w-[calc(100%-30px)] rounded-full bg-[linear-gradient(90deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)] opacity-0 shadow-[0_0_0_transparent] transition-[height,opacity,box-shadow] duration-160 group-hover/resize-top:h-0.75 group-hover/resize-top:opacity-100 group-hover/resize-top:shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_42%,transparent)]" />
          </div>
        )}

        <header className="relative z-10 flex h-auto shrink-0 items-center gap-0 px-4 pt-3.5 pb-1.75 sm:h-14 sm:py-0">
          {!isPhone && (
            <>
              <button
                type="button"
                aria-label="Close discussion thread"
                onClick={() => onOpenChange(false)}
                className="grid size-10 shrink-0 place-items-center rounded-lg text-(--text-secondary) transition-colors hover:bg-(--hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
              >
                <ArrowLeft size={22} weight="bold" aria-hidden="true" />
              </button>
              <span
                aria-hidden="true"
                data-thread-panel-divider
                className="ml-0.75 mr-3 h-7 w-px bg-[color-mix(in_srgb,var(--text)_10%,transparent)]"
              />
            </>
          )}
          <DrawerTitle className="mr-auto text-lg font-bold">
            Discussion thread
          </DrawerTitle>
          <DrawerDescription className="sr-only">
            Read the selected lesson discussion and write a reply.
          </DrawerDescription>
          {!isPhone && (
            <button
              type="button"
              data-thread-panel-size-toggle
              aria-label={
                expanded
                  ? "Restore discussion thread"
                  : "Expand discussion thread"
              }
              aria-pressed={expanded}
              onClick={() => setExpanded((current) => !current)}
              className="ml-auto grid size-10 shrink-0 place-items-center rounded-lg text-(--text-secondary) transition-[background-color,color,transform] hover:bg-(--hover) hover:text-(--text) active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            >
              {expanded ? (
                <ArrowsIn
                  data-thread-panel-size-icon="restore"
                  size={22}
                  weight="bold"
                  aria-hidden="true"
                />
              ) : (
                <ArrowsOut
                  data-thread-panel-size-icon="expand"
                  size={22}
                  weight="bold"
                  aria-hidden="true"
                />
              )}
            </button>
          )}
        </header>

        <div
          {...(isPhone
            ? {}
            : {
                "data-base-ui-swipe-ignore": "",
                "data-learning-swipe-ignore": "",
              })}
          role="region"
          aria-label="Swipe between discussion threads"
          style={
            isPhone
              ? {
                  flex: "none",
                  height: `${Math.max(1, mobileVisibleHeight - 56)}px`,
                }
              : undefined
          }
          className="relative z-10 min-h-0 flex-1 touch-pan-y"
        >
          <ThreadPanelSlides
            entries={entries}
            activeEntryId={activeEntryId}
            activeIndex={activeIndex}
            openSettled={openSettled}
            composerFocusRequest={composerFocusRequest}
            onSwiperReady={handleSwiperReady}
            onOpenChange={onOpenChange}
            onActiveEntryChange={onActiveEntryChange}
            onFocusComposer={requestComposerFocus}
            onComposerFocusHandled={handleComposerFocusHandled}
            isBackendMode={isBackendMode}
            currentUserId={currentUserId}
            canModerate={canModerate}
            currentUser={currentUser}
            canParticipate={canParticipate}
            participationState={participationState}
            participationActionLabel={participationActionLabel}
            onParticipationAction={onParticipationAction}
            onLike={onLike}
            onAddReply={onAddReply}
            onEditEntry={onEditEntry}
            onDeleteEntry={onDeleteEntry}
            onEditReply={onEditReply}
            onDeleteReply={onDeleteReply}
            onReport={onReport}
            onToggleAcceptReply={onToggleAcceptReply}
            onToggleLockThread={onToggleLockThread}
            onToggleBookmark={onToggleBookmark}
            onToggleFollow={onToggleFollow}
            onSeekToTimestamp={onSeekToTimestamp}
            onCopyTextNotice={onCopyTextNotice}
            onReplyCreateError={onReplyCreateError}
            onReplyEditError={onReplyEditError}
            onReplyDeleteError={onReplyDeleteError}
            courseId={courseId}
            lessonId={lessonId}
          />
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface ThreadPanelSlidesProps extends Omit<
  ThreadSlideProps,
  "entry" | "active" | "focusRequest" | "editorReady"
> {
  entries: Comment[];
  activeEntryId: string | number | null;
  activeIndex: number;
  /** The panel has finished sliding in. */
  openSettled: boolean;
  composerFocusRequest: { id: number; entryId: string | number | null };
  onSwiperReady: (swiper: SwiperInstance) => void;
  onOpenChange: (open: boolean) => void;
  onActiveEntryChange: (entryId: string | number) => void;
}

/**
 * The threads of the lesson, one slide each. They are kept apart from the
 * panel around them so that a change to the panel alone (its height while it
 * is dragged taller, its width while the sidebar or the course content beside
 * the lesson is resized) does not render the threads again.
 */
const ThreadPanelSlides = memo(function ThreadPanelSlides({
  entries,
  activeEntryId,
  activeIndex,
  openSettled,
  composerFocusRequest,
  onSwiperReady,
  onOpenChange,
  onActiveEntryChange,
  onEditEntry,
  onDeleteEntry,
  ...slideProps
}: ThreadPanelSlidesProps) {
  // Every thread has a slide, but only the ones that can be on screen are
  // filled in: the open thread, the two a swipe can reach, and the one just
  // left, which is still in view while the next slides in.
  const [slideTrail, setSlideTrail] = useState({
    current: activeIndex,
    previous: activeIndex,
  });
  if (slideTrail.current !== activeIndex) {
    setSlideTrail({ current: activeIndex, previous: slideTrail.current });
  }
  const [swiper, setSwiper] = useState<SwiperInstance | null>(null);
  useThreadSwipeAxisLock(swiper);
  const isSlideFilled = (index: number) =>
    index === activeIndex ||
    (openSettled &&
      (Math.abs(index - activeIndex) === 1 || index === slideTrail.previous));

  return (
    <Swiper
      className="h-full"
      slidesPerView={1}
      initialSlide={activeIndex}
      speed={THREAD_PANEL_SLIDE_DURATION}
      resistanceRatio={0.72}
      allowTouchMove
      nested
      threshold={12}
      touchAngle={35}
      touchStartPreventDefault={false}
      touchMoveStopPropagation
      noSwiping
      noSwipingSelector="button,a,input,textarea,select,[contenteditable=true],[role=menu],[data-discussion-atomic-editor],.swiper-no-swiping"
      onSwiper={(instance) => {
        onSwiperReady(instance);
        setSwiper(instance);
        instance.slideTo(activeIndex, 0);
      }}
      // The open thread (and the address) change once the slide has come to
      // rest. Changing them as the finger lifts rendered the page in the
      // touchend task and again near the end of the slide, so the slide
      // stalled when released and jumped the last stretch.
      onSlideChangeTransitionEnd={(swiper) => {
        const entry = entries[swiper.activeIndex];
        if (entry) onActiveEntryChange(getClientEntityId(entry));
      }}
    >
      {entries.map((entry, index) => (
        <SwiperSlide key={getClientEntityId(entry)} className="h-full!">
          {isSlideFilled(index) ? (
            <ThreadSlide
              {...slideProps}
              entry={entry}
              active={matchesEntryIdentity(entry, activeEntryId)}
              focusRequest={
                String(composerFocusRequest.entryId) ===
                getClientEntityId(entry)
                  ? composerFocusRequest.id
                  : 0
              }
              editorReady={openSettled}
              onEditEntry={(comment) => {
                onOpenChange(false);
                onEditEntry(comment);
              }}
              onDeleteEntry={(id) => {
                onDeleteEntry(id);
                onOpenChange(false);
              }}
            />
          ) : null}
        </SwiperSlide>
      ))}
    </Swiper>
  );
});

interface ThreadSlideProps {
  entry: Comment;
  active: boolean;
  isBackendMode?: boolean;
  currentUserId?: string;
  /** May lock any thread and accept any answer (see Discussion). */
  canModerate?: boolean;
  currentUser?: {
    name: string;
    avatar: string;
  };
  canParticipate?: boolean;
  participationState?: LessonParticipationState;
  participationActionLabel?: string;
  onParticipationAction?: () => void;
  focusRequest: number;
  /** The panel has stopped moving, so the reply editor can be put in. */
  editorReady: boolean;
  onFocusComposer: (entryId: string | number) => void;
  onComposerFocusHandled: (entryId: string | number, requestId: number) => void;
  onLike: (id: string | number, liked: boolean) => void;
  onAddReply: (entryId: string | number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: string | number) => void;
  onEditReply: (
    entryId: string | number,
    replyId: string | number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: string | number, replyId: string | number) => void;
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
  onToggleAcceptReply?: (
    threadId: string | number,
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
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
  onReplyCreateError?: () => void;
  onReplyEditError?: () => void;
  onReplyDeleteError?: () => void;
  courseId?: string;
  lessonId?: string;
}

function ThreadSlide({
  entry,
  active,
  isBackendMode = false,
  currentUserId,
  canModerate,
  currentUser,
  canParticipate = true,
  participationState = "granted",
  participationActionLabel,
  onParticipationAction,
  focusRequest,
  editorReady,
  onFocusComposer,
  onComposerFocusHandled,
  onLike,
  onAddReply,
  onEditEntry,
  onDeleteEntry,
  onEditReply,
  onDeleteReply,
  onReport,
  onToggleAcceptReply,
  onToggleLockThread,
  onToggleBookmark,
  onToggleFollow,
  onSeekToTimestamp,
  onCopyTextNotice,
  onReplyCreateError,
  onReplyEditError,
  onReplyDeleteError,
  courseId,
  lessonId,
}: ThreadSlideProps) {
  const isQuestion =
    entry.entryKind === "question" || Boolean(entry.isQuestion);
  const canLock = canParticipate && Boolean(entry.isOwn || canModerate);
  const canAcceptAnswer =
    canParticipate && isQuestion && Boolean(entry.isOwn || canModerate);

  const clientId = getClientEntityId(entry);
  const serverId = getServerEntityId(entry);
  const isBackend = Boolean(isBackendMode && serverId);
  const threadId = serverId;
  const replyParentId = isBackendMode ? (serverId ?? clientId) : undefined;
  const queryClient = useContext(QueryClientContext);

  const {
    data: repliesData,
    isLoading: isRepliesLoading,
    isError: isRepliesError,
    refetch: refetchReplies,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetchNextPageError,
  } = useThreadReplies(replyParentId, undefined, {
    enabled: isBackend && active,
  });
  const replyScrollportRef = useRef<HTMLDivElement>(null);
  const replyLoadMoreRef = useRef<HTMLDivElement>(null);
  const fetchingNextPageRef = useRef(false);

  useEffect(() => {
    const root = replyScrollportRef.current;
    const sentinel = replyLoadMoreRef.current;
    if (
      !active ||
      !isBackend ||
      !hasNextPage ||
      isFetchingNextPage ||
      isFetchNextPageError ||
      !root ||
      !sentinel ||
      typeof IntersectionObserver === "undefined"
    ) {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries.some((entry) => entry.isIntersecting) &&
          !fetchingNextPageRef.current
        ) {
          fetchingNextPageRef.current = true;
          void fetchNextPage().finally(() => {
            fetchingNextPageRef.current = false;
          });
        }
      },
      { root, rootMargin: "300px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [
    active,
    fetchNextPage,
    hasNextPage,
    isBackend,
    isFetchNextPageError,
    isFetchingNextPage,
  ]);

  const createReplyMutation = useCreateReply(
    threadId,
    courseId && lessonId ? { courseId, lessonId } : undefined,
  );
  const updateReplyMutation = useUpdateReply(threadId);
  const deleteReplyMutation = useDeleteReply(threadId);

  const replies = useMemo<CommentReply[]>(() => {
    if (!isBackendMode) {
      return entry.thread ?? [];
    }
    return flattenReplyPages(repliesData, replyParentId ?? "").map((reply) =>
      adaptLearningReplyToCommentReply(reply),
    );
  }, [isBackendMode, entry.thread, repliesData, replyParentId]);

  const handleAddReply = async (
    draft: DiscussionDraft,
    attachments?: LocalComposerAttachment[],
    onCreateFailure?: () => void,
  ): Promise<boolean> => {
    if (isBackendMode) {
      const localAttachments = [...(attachments ?? [])];
      const replyClientId = createClientEntityId("reply");
      const payload = {
        content: draft.markdown || draft.plainText.trim(),
      };
      interactionCreationCoordinator.beginReplyCreation({
        queryClient,
        parentClientId: clientId,
        parentServerId: serverId,
        payload,
        clientId: replyClientId,
        attachments: localAttachments.map(toInteractionAttachment),
        localAttachments,
        dispatch: (parentServerId, replyPayload) =>
          createReplyMutation.mutateAsync({
            ...replyPayload,
            __serverThreadId: parentServerId,
            __clientId: replyClientId,
            __localAttachments: localAttachments,
          }),
        onFailure: () => {
          onCreateFailure?.();
          onReplyCreateError?.();
        },
      });
      return true;
    }
    onAddReply(entry.id, {
      id: Date.now(),
      name: currentUser?.name || "Ashi Singh",
      time: "Just now",
      avatar: currentUser?.avatar || "",
      text: draft.plainText.trim(),
      content: draft,
      likes: 0,
      isOwn: true,
    });
    return true;
  };

  const handleEditReply = async (
    replyId: string | number,
    draft: DiscussionDraft,
  ): Promise<boolean> => {
    if (isBackend) {
      const reply = replies.find(
        (candidate) => getClientEntityId(candidate) === String(replyId),
      );
      const serverReplyId = reply ? getServerEntityId(reply) : undefined;
      if (!reply || !serverReplyId) return false;
      try {
        const request = updateReplyMutation.mutateAsync({
          replyId: serverReplyId,
          payload: {
            content: draft.markdown || draft.plainText.trim(),
          },
          __optimistic: {
            clientId: getClientEntityId(reply),
            serverId: serverReplyId,
            baseline: {
              content: reply.content?.markdown ?? reply.text,
              plainText: reply.content?.plainText ?? reply.text,
            },
            optimistic: {
              content: draft.markdown || draft.plainText.trim(),
              plainText: draft.plainText,
            },
          },
        });
        void request.catch(() => onReplyEditError?.());
        return true;
      } catch {
        return false;
      }
    } else {
      onEditReply(entry.id, replyId, draft);
      return true;
    }
  };

  const handleDeleteReply = async (
    replyId: string | number,
  ): Promise<boolean> => {
    if (isBackend) {
      const reply = replies.find(
        (candidate) => getClientEntityId(candidate) === String(replyId),
      );
      const serverReplyId = reply ? getServerEntityId(reply) : undefined;
      const replyClientId = reply ? getClientEntityId(reply) : undefined;
      if (
        !serverReplyId ||
        !replyClientId ||
        optimisticEditCoordinator.isEditing("reply", replyClientId)
      ) {
        return false;
      }
      return Boolean(
        optimisticDeletionCoordinator.begin({
          kind: "reply",
          clientId: replyClientId,
          serverId: serverReplyId,
          parentClientId: clientId,
          parentServerId: serverId,
          parentRepliesCount: getReplyTotalCount(repliesData) ?? entry.replies,
          queryClient,
          commit: () => deleteReplyMutation.mutateAsync(serverReplyId),
          onFailure: () => onReplyDeleteError?.(),
        }),
      );
    } else {
      onDeleteReply(entry.id, replyId);
      return true;
    }
  };

  const handleLikeReply = (replyId: string | number) => {
    if (isBackendMode) {
      const reply = replies.find(
        (candidate) =>
          String(candidate.clientId ?? candidate.id) === String(replyId),
      );
      if (!reply) return;
      const replyClientId = String(reply.clientId ?? reply.id);
      const replyServerId = getServerEntityId(reply);
      const currentLiked = Boolean(reply.liked);
      const nextLiked = !currentLiked;
      desiredStateCoordinator.setLiked({
        targetType: "reply",
        targetId: replyClientId,
        serverId: replyServerId,
        threadId: threadId ?? clientId,
        desiredLiked: nextLiked,
        currentBaseline: currentLiked,
        queryClient,
        pendingTarget: !replyServerId,
      });
    } else {
      const reply = replies.find((r) => r.id === replyId);
      if (reply) {
        reply.liked = !reply.liked;
        reply.likes = Math.max(0, reply.likes + (reply.liked ? 1 : -1));
      }
    }
  };

  const focusComposer = () => onFocusComposer(entry.id);
  // Guests get the same reply box as everyone else; reaching for it asks
  // them to log in (or get access) instead of opening the editor.
  const needsParticipationAccess = !entry.isLocked && !canParticipate;
  const participationPromptText = getParticipationPromptText(
    participationState,
    participationActionLabel,
  );

  return (
    <div
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4"
    >
      <div
        ref={replyScrollportRef}
        className="learning-comment-formatting-scrollport min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
      >
        <ThreadRootEntry
          entry={entry}
          isBackendMode={isBackendMode}
          canParticipate={canParticipate}
          canLock={canLock}
          onToggleLock={() => onToggleLockThread?.(entry.id, !entry.isLocked)}
          onToggleBookmark={canParticipate ? onToggleBookmark : undefined}
          onToggleFollow={canParticipate ? onToggleFollow : undefined}
          onSeekToTimestamp={onSeekToTimestamp}
          onCopyTextNotice={onCopyTextNotice}
          onLike={onLike}
          onReply={entry.isLocked ? () => {} : focusComposer}
          onEdit={() => onEditEntry(entry)}
          onDelete={() => onDeleteEntry(entry.id)}
          onReport={() =>
            onReport({
              targetType: "thread",
              targetId: entry.id,
              authorName: entry.name,
            })
          }
        />

        <div className="mx-auto max-w-4xl">
          {!active ? null : isBackend && isRepliesLoading && !repliesData ? (
            <div
              className="grid min-h-36 place-items-center py-12"
              data-testid="learning-replies-loading"
              role="status"
              aria-label="Loading replies"
            >
              <LoadingSpinnerIcon size={24} />
            </div>
          ) : isBackend && isRepliesError && !repliesData ? (
            <div
              className="py-12 text-center"
              data-testid="learning-replies-error"
            >
              <p className="font-semibold text-(--text)">
                Failed to load replies
              </p>
              <p className="mx-auto mt-1 max-w-md text-sm text-(--muted)">
                There was a problem loading replies for this discussion.
              </p>
              <button
                type="button"
                onClick={() => refetchReplies()}
                className="mt-3 inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
              >
                Retry
              </button>
            </div>
          ) : replies.length > 0 ? (
            replies.map((reply) => (
              <ThreadReplyEntry
                key={reply.clientId ?? reply.id}
                parentId={clientId}
                reply={reply}
                isBackendMode={isBackendMode}
                isQuestion={isQuestion}
                canAcceptAnswer={canAcceptAnswer}
                onToggleAcceptReply={(replyId, accepted) =>
                  onToggleAcceptReply?.(
                    entry.id,
                    replyId,
                    accepted,
                    getServerEntityId(reply),
                  )
                }
                onReply={entry.isLocked ? () => {} : focusComposer}
                onEdit={handleEditReply}
                onDelete={handleDeleteReply}
                onLikeReply={handleLikeReply}
                onReport={onReport}
                onSeekToTimestamp={onSeekToTimestamp}
                onCopyTextNotice={onCopyTextNotice}
                courseId={courseId}
                canParticipate={canParticipate}
              />
            ))
          ) : (
            <div
              className="px-4 py-12 text-center sm:py-16"
              data-testid="learning-replies-empty"
            >
              <div className="mx-auto grid size-11 place-items-center rounded-full bg-[color-mix(in_srgb,var(--accent)_11%,transparent)] text-(--accent-ink,var(--accent))">
                <ChatCenteredDots size={22} aria-hidden="true" />
              </div>
              <p className="mt-3 text-sm font-semibold text-(--text)">
                Start the conversation
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm leading-6 text-(--muted)">
                {needsParticipationAccess
                  ? participationPromptText
                  : `Be the first to reply to ${entry.name}.`}
              </p>
            </div>
          )}
          {isBackend && hasNextPage && (
            <div ref={replyLoadMoreRef} className="flex justify-center py-4">
              {isFetchNextPageError ? (
                <button
                  type="button"
                  onClick={() => void fetchNextPage()}
                  className="inline-flex items-center rounded-lg bg-(--surface) px-3 py-1.5 text-xs font-semibold text-(--text) shadow-sm ring-1 ring-inset ring-[color-mix(in_srgb,var(--text)_14%,transparent)] hover:bg-(--hover)"
                >
                  Retry loading replies
                </button>
              ) : isFetchingNextPage ? (
                <span
                  className="grid place-items-center py-2"
                  role="status"
                  aria-label="Loading more replies"
                >
                  <LoadingSpinnerIcon size={16} />
                </span>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {active &&
        (entry.isLocked ? (
          <div
            data-testid="thread-locked-notice"
            className="-mx-4 -mb-4 mt-0 flex items-center justify-center gap-2 rounded-t-xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] px-4 py-3.5 text-xs font-semibold text-(--muted) border-t border-[color-mix(in_srgb,var(--text)_10%,transparent)] sm:mx-0 sm:mb-0 sm:rounded-xl"
          >
            <Lock size={16} weight="bold" />
            <span>This conversation is locked. Replies are disabled.</span>
          </div>
        ) : (
          <ThreadReplyComposer
            entry={entry}
            currentUser={currentUser}
            focusRequest={focusRequest}
            editorReady={editorReady}
            onRequestFocus={focusComposer}
            onFocusHandled={onComposerFocusHandled}
            onSubmit={handleAddReply}
            courseId={courseId}
            onGuestIntent={
              canParticipate
                ? undefined
                : participationState === "pending" || !onParticipationAction
                  ? ignoreGuestIntent
                  : onParticipationAction
            }
          />
        ))}
    </div>
  );
}

function getParticipationPromptText(
  participationState: LessonParticipationState,
  participationActionLabel?: string,
) {
  if (participationState === "pending") return "Checking access…";
  return participationActionLabel === "Get access"
    ? "Get access to join the discussion."
    : "Log in to join the discussion.";
}

function ignoreGuestIntent() {}

function ThreadRootEntry({
  entry,
  isBackendMode = false,
  canParticipate = true,
  canLock = false,
  onToggleLock,
  onToggleBookmark,
  onToggleFollow,
  onSeekToTimestamp,
  onCopyTextNotice,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  entry: Comment;
  isBackendMode?: boolean;
  canParticipate?: boolean;
  canLock?: boolean;
  onToggleLock?: () => void;
  onToggleBookmark?: (
    threadId: string | number,
    bookmarked: boolean,
  ) => Promise<boolean> | void;
  onToggleFollow?: (
    threadId: string | number,
    following: boolean,
  ) => Promise<boolean> | void;
  onLike: (id: string | number, liked: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
  onSeekToTimestamp?: (seconds: number) => void;
  onCopyTextNotice?: (message: string) => void;
}) {
  const isEntryLiked = Boolean(entry.liked);
  const isNote = entry.entryKind === "note" || (entry as any).kind === "note";
  const serverId = getServerEntityId(entry);
  const clientId = getClientEntityId(entry);
  const isEditing = optimisticEditCoordinator.isEditing("thread", clientId);

  const replyCount = Math.max(entry.replies ?? 0, entry.thread?.length ?? 0);

  return (
    <article className="mx-auto mb-1 max-w-4xl pt-3 pb-4">
      <div className="flex gap-3 sm:gap-3.5">
        <ProfileLink username={entry.authorUsername} variant="picture">
          <DiscussionAvatar src={entry.avatar} className="size-10 sm:size-11" />
        </ProfileLink>
        <div className="min-w-0 flex-1">
          <div className="relative flex items-start gap-2 pr-9">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                <ProfileLink username={entry.authorUsername} variant="name">
                  {entry.name}
                </ProfileLink>
              </h2>
              {entry.role === "Instructor" && (
                <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Instructor
                </span>
              )}
              {entry.isLocked && (
                <span
                  data-testid="thread-locked-badge"
                  className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400"
                >
                  <Lock size={14} weight="fill" />
                  Locked
                </span>
              )}
              {!isNote && Boolean(entry.isBookmarked) && (
                <span
                  data-testid="thread-bookmarked-badge"
                  className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-(--text-secondary)"
                  title="Bookmarked"
                >
                  <BookmarkSimple size={12} weight="bold" aria-hidden="true" />
                  <span>Bookmarked</span>
                </span>
              )}
              {!isNote && Boolean(entry.isFollowing) && (
                <span
                  data-testid="thread-following-badge"
                  className="inline-flex items-center gap-1 rounded-md bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-1.5 py-0.5 text-[11px] font-medium text-(--text-secondary)"
                  title="Following"
                >
                  <BellSimple size={12} weight="bold" aria-hidden="true" />
                  <span>Following</span>
                </span>
              )}
              <span aria-hidden="true" className="text-(--muted)">
                ·
              </span>
              <TimeAgo
                value={entry.createdAt}
                label={entry.time}
                className="text-xs text-(--muted) sm:text-sm"
              />
            </div>
            <CommentActionMenu
              name={entry.name}
              kind={
                entry.entryKind ?? (entry.isQuestion ? "question" : "comment")
              }
              textToCopy={entry.content?.markdown ?? entry.text}
              onCopyTextNotice={onCopyTextNotice}
              isOwn={Boolean(entry.isOwn)}
              canEdit={
                canParticipate &&
                (!isBackendMode || (Boolean(serverId) && !isEditing))
              }
              canDelete={
                canParticipate &&
                (!isBackendMode || (Boolean(serverId) && !isEditing))
              }
              canLock={canLock}
              isLocked={Boolean(entry.isLocked)}
              onToggleLock={onToggleLock}
              isBookmarked={Boolean(entry.isBookmarked)}
              onToggleBookmark={
                onToggleBookmark
                  ? () => {
                      void Promise.resolve(
                        onToggleBookmark(entry.id, !entry.isBookmarked),
                      ).catch(() => {});
                    }
                  : undefined
              }
              isFollowing={Boolean(entry.isFollowing)}
              onToggleFollow={
                onToggleFollow
                  ? () => {
                      void Promise.resolve(
                        onToggleFollow(entry.id, !entry.isFollowing),
                      ).catch(() => {});
                    }
                  : undefined
              }
              onEdit={onEdit}
              onShare={() =>
                serverId
                  ? shareDiscussionEntry(serverId, entry.name, entry.text)
                  : undefined
              }
              onDelete={onDelete}
              onReport={onReport}
              className="absolute -top-1 right-0 z-20 shrink-0"
            />
          </div>
          <DiscussionMarkdown
            content={entry.content ?? createDiscussionDraft(entry.text)}
            label={`Discussion entry by ${entry.name}`}
            linkedAttachments={entry.attachments}
            enableInlineTimestamps={Boolean(onSeekToTimestamp)}
            onSeekToTimestamp={onSeekToTimestamp}
            preserveSoftBreaks
            className="mt-0.5 max-w-3xl pr-9 sm:pr-10"
          />
          {entry.attachments && entry.attachments.length > 0 ? (
            <DiscussionAttachmentsList attachments={entry.attachments} />
          ) : entry.attachment ? (
            <div className="mt-3 flex w-fit max-w-full items-center gap-3 rounded-lg bg-[color-mix(in_srgb,var(--canvas)_36%,transparent)] px-3 py-2 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--text)_10%,transparent)]">
              <FileText size={24} className="shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-(--text)">
                  {entry.attachment.name}
                </p>
                <p className="text-xs text-(--muted)">
                  {entry.attachment.meta}
                </p>
              </div>
            </div>
          ) : null}
          <div className="mt-2 flex min-h-9 items-center gap-3 text-xs text-(--muted) sm:text-sm">
            {canParticipate && (
              <button
                type="button"
                aria-pressed={isEntryLiked}
                aria-label={isEntryLiked ? "Unlike" : "Like"}
                onClick={(event) => {
                  if (!isEntryLiked) cheerLike(event.currentTarget);
                  onLike(entry.id, !isEntryLiked);
                }}
                className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${isEntryLiked ? "text-(--accent-ink,var(--accent))" : ""}`}
              >
                <span
                  data-like-icon
                  className="relative inline-grid place-items-center"
                >
                  <ThumbsUp
                    size={19}
                    weight={isEntryLiked ? "fill" : "regular"}
                  />
                </span>
                {entry.likes}
              </button>
            )}
            {canParticipate && !entry.isLocked && (
              <button
                type="button"
                data-reply-action
                onClick={onReply}
                className="inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
              >
                <ArrowBendUpLeft
                  data-reply-icon
                  size={20}
                  weight="bold"
                  className="origin-center scale-x-[1.16]"
                  aria-hidden="true"
                />
                <span className="font-medium">
                  {replyCount > 0
                    ? `${replyCount} ${replyCount === 1 ? "reply" : "replies"}`
                    : "Reply"}
                </span>
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ThreadReplyEntry({
  parentId,
  reply,
  isBackendMode = false,
  canParticipate = true,
  isQuestion = false,
  canAcceptAnswer = false,
  onToggleAcceptReply,
  onReply,
  onEdit,
  onDelete,
  onLikeReply,
  onReport,
  onSeekToTimestamp,
  onCopyTextNotice,
  courseId,
}: {
  parentId: string | number;
  reply: CommentReply;
  isBackendMode?: boolean;
  canParticipate?: boolean;
  isQuestion?: boolean;
  canAcceptAnswer?: boolean;
  onToggleAcceptReply?: (
    replyId: string | number,
    accepted: boolean,
    serverReplyId?: string,
  ) => void;
  onReply: () => void;
  onEdit: (
    replyId: string | number,
    draft: DiscussionDraft,
  ) => Promise<boolean>;
  onDelete: (replyId: string | number) => Promise<boolean>;
  onLikeReply: (replyId: string | number) => void;
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
  onSeekToTimestamp?: (seconds: number) => void;
  onCopyTextNotice?: (message: string) => void;
  courseId?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    reply.content ?? createDiscussionDraft(reply.text),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const replyClientId = getClientEntityId(reply);
  const replyServerId = getServerEntityId(reply);
  const deletion = useOptimisticDeletion("reply", replyClientId, replyServerId);
  const isEditing = optimisticEditCoordinator.isEditing("reply", replyClientId);

  const saveEdit = async () => {
    if (!hasDiscussionDraftContent(editDraft) || isUpdating) return;
    setIsUpdating(true);
    setUpdateError("");
    try {
      const success = await onEdit(reply.id, editDraft);
      if (success) {
        setEditing(false);
      } else {
        setUpdateError("Failed to update reply. Please try again.");
      }
    } catch {
      setUpdateError("Failed to update reply. Please try again.");
    } finally {
      setIsUpdating(false);
    }
  };

  if (deletion.phase === "deleting" || deletion.phase === "deleted") {
    return null;
  }

  return (
    <article
      data-thread-reply-entry
      data-deletion-pending={deletion.hidden || undefined}
      className={`relative px-3 py-2.5 sm:px-8 ${deletion.hidden ? "min-h-10" : ""}`}
    >
      <div
        inert={deletion.hidden ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.hidden ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex gap-3.5">
            <ProfileLink username={reply.authorUsername} variant="picture">
              <DiscussionAvatar
                src={reply.avatar}
                className="size-9 sm:size-10"
                loading="lazy"
                width={40}
                height={40}
              />
            </ProfileLink>
            <div className="min-w-0 flex-1">
              <div className="relative flex items-start gap-2 pr-9">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                    <ProfileLink username={reply.authorUsername} variant="name">
                      {reply.name}
                    </ProfileLink>
                  </h3>
                  {reply.role === "Instructor" && (
                    <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      Instructor
                    </span>
                  )}
                  <span aria-hidden="true" className="text-(--muted)">
                    ·
                  </span>
                  <TimeAgo
                    value={reply.createdAt}
                    label={reply.time}
                    className="text-xs text-(--muted) sm:text-sm"
                  />
                </div>
                <CommentActionMenu
                  name={reply.name}
                  kind="reply"
                  textToCopy={reply.content?.markdown ?? reply.text}
                  onCopyTextNotice={onCopyTextNotice}
                  isOwn={Boolean(reply.isOwn)}
                  canEdit={
                    canParticipate &&
                    (!isBackendMode || (Boolean(replyServerId) && !isEditing))
                  }
                  canDelete={
                    canParticipate &&
                    (!isBackendMode || (Boolean(replyServerId) && !isEditing))
                  }
                  onEdit={() => {
                    setEditDraft(
                      reply.content ?? createDiscussionDraft(reply.text),
                    );
                    setEditing(true);
                  }}
                  onShare={() =>
                    void shareDiscussionEntry(
                      reply.id,
                      reply.name,
                      reply.text,
                      {
                        parentThreadId: parentId,
                      },
                    )
                  }
                  onDelete={() => {
                    void onDelete(reply.id);
                  }}
                  onReport={() =>
                    onReport({
                      targetType: "reply",
                      targetId: reply.id,
                      authorName: reply.name,
                      serverId: getServerEntityId(reply),
                    })
                  }
                  className="absolute -top-1 right-0 z-20 shrink-0"
                />
              </div>
              {editing && canParticipate ? (
                <div>
                  <InlineEditForm
                    documentId={`thread-reply-edit-${reply.id}`}
                    label={`Edit reply by ${reply.name}`}
                    value={editDraft}
                    courseId={courseId}
                    mentionsEnabled={true}
                    onChange={setEditDraft}
                    onCancel={() => {
                      setEditDraft(
                        reply.content ?? createDiscussionDraft(reply.text),
                      );
                      setEditing(false);
                      setUpdateError("");
                    }}
                    onSave={saveEdit}
                  />
                  {updateError && (
                    <p role="alert" className="mt-1 text-xs text-red-500">
                      {updateError}
                    </p>
                  )}
                </div>
              ) : (
                <DiscussionMarkdown
                  content={reply.content ?? createDiscussionDraft(reply.text)}
                  label={`Reply by ${reply.name}`}
                  linkedAttachments={reply.attachments}
                  enableInlineTimestamps={Boolean(onSeekToTimestamp)}
                  onSeekToTimestamp={onSeekToTimestamp}
                  preserveSoftBreaks
                  className="mt-0.5 max-w-3xl pr-9 sm:pr-10"
                />
              )}
              {reply.attachments && reply.attachments.length > 0 && (
                <DiscussionAttachmentsList attachments={reply.attachments} />
              )}
              <div className="mt-1.5 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm">
                {canParticipate && (
                  <button
                    type="button"
                    aria-pressed={Boolean(reply.liked)}
                    aria-label={reply.liked ? "Unlike reply" : "Like reply"}
                    onClick={(event) => {
                      if (!reply.liked) cheerLike(event.currentTarget);
                      onLikeReply(reply.id);
                    }}
                    className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${reply.liked ? "text-(--accent-ink,var(--accent))" : ""}`}
                  >
                    <span
                      data-like-icon
                      className="relative inline-grid place-items-center"
                    >
                      <ThumbsUp
                        size={18}
                        weight={reply.liked ? "fill" : "regular"}
                      />
                    </span>
                    <span>{reply.likes}</span>
                  </button>
                )}
                {canParticipate && (
                  <button
                    type="button"
                    aria-label="Reply"
                    title="Reply"
                    data-reply-action
                    onClick={onReply}
                    className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
                  >
                    <ArrowBendUpLeft
                      data-reply-icon
                      size={20}
                      weight="bold"
                      className="origin-center scale-x-[1.16]"
                      aria-hidden="true"
                    />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {deletion.pending && (
        <UndoDeleteButton
          name={reply.name}
          seconds={deletion.seconds}
          onUndo={deletion.undo}
          compact
          className="absolute top-2 right-2"
        />
      )}
    </article>
  );
}

function matchesEntryIdentity(
  entry: Comment,
  activeEntryId: string | number | null,
): boolean {
  if (activeEntryId === null) return false;
  const identity = String(activeEntryId);
  return (
    getClientEntityId(entry) === identity ||
    getServerEntityId(entry) === identity
  );
}

interface PanelHeightResize {
  pointerId: number;
  startY: number;
  startHeight: number;
}

type ThreadPanelStyle = CSSProperties & {
  "--drawer-content-width": string;
  "--drawer-content-height": string;
  "--drawer-content-max-height": string;
};

interface ViewportBounds {
  top: number;
  height: number;
  width: number;
}

interface PanelSurfaceRect {
  top: number;
  right: number;
  width: number;
  height: number;
}

interface ThreadPanelSurfaceBounds {
  lesson: PanelSurfaceRect;
  app: PanelSurfaceRect;
}

function useThreadPanelSurfaceBounds(viewport: ViewportBounds) {
  const measure = useCallback(
    (): ThreadPanelSurfaceBounds => getThreadPanelSurfaceBounds(viewport),
    [viewport],
  );
  const [bounds, setBounds] = useState<ThreadPanelSurfaceBounds>(() =>
    getThreadPanelSurfaceBounds(viewport),
  );

  // Measured when the panel is put on the page and whenever the window
  // changes. Not when the page behind the open panel is scrolled: the lesson
  // then moves under the panel, and the panel must stay where it is.
  useThreadPanelLayoutEffect(() => {
    setBounds((current) => keepSamePanelSurfaceBounds(current, measure()));
  }, [measure]);

  const boundsRef = useRef(bounds);
  useThreadPanelLayoutEffect(() => {
    boundsRef.current = bounds;
  }, [bounds]);

  // A resize is a different matter. When the sidebar or the course content
  // beside the lesson is resized, the lesson gets wider or narrower, and the
  // panel keeps touching both of its edges (and keeps starting where the
  // lesson's text does, under a video that has changed height with it).
  //
  // It follows from inside the frame: the lesson is measured at the start of
  // each frame, after the drag has moved it and before anything is drawn, so
  // the panel is drawn at the lesson's new sides in that same frame and
  // never trails it. That check runs while something could be resizing (a
  // held pointer is moving, a key was just pressed, the lesson's size was
  // just seen to change) and for a few frames after, then rests. Acting from
  // the size notice alone would be a frame late, and resizing the panel
  // inside that notice makes the browser report a "ResizeObserver loop".
  useThreadPanelLayoutEffect(() => {
    const lesson = document.querySelector<HTMLElement>(
      "[data-discussion-panel-anchor]",
    );
    const app = document.querySelector<HTMLElement>("#courses-main-scrollport");
    let frame = 0;
    let framesAtRest = 0;
    const follow = () => {
      frame = 0;
      const measured = measure();
      const current = boundsRef.current;
      // With its sides, the lesson's whole place is taken: the video above
      // it grows and shrinks with its width, so where the panel starts has
      // moved as well. With the sides where they were, nothing is taken.
      const next =
        hasSamePanelSurfaceSides(current.app, measured.app) &&
        hasSamePanelSurfaceSides(current.lesson, measured.lesson)
          ? current
          : measured;
      if (next !== current) {
        boundsRef.current = next;
        flushSync(() => setBounds(next));
        framesAtRest = 0;
      } else {
        framesAtRest += 1;
      }
      if (framesAtRest < THREAD_PANEL_FOLLOW_REST_FRAMES) {
        frame = window.requestAnimationFrame(follow);
      }
    };
    const wake = () => {
      framesAtRest = 0;
      if (!frame) frame = window.requestAnimationFrame(follow);
    };
    const wakeWhileDragging = (event: PointerEvent) => {
      if (event.buttons !== 0) wake();
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined" ? null : new ResizeObserver(wake);
    if (lesson) resizeObserver?.observe(lesson);
    if (app) resizeObserver?.observe(app);
    const listening = { capture: true, passive: true } as const;
    document.addEventListener("pointerdown", wake, listening);
    document.addEventListener("pointermove", wakeWhileDragging, listening);
    document.addEventListener("keydown", wake, listening);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      document.removeEventListener("pointerdown", wake, listening);
      document.removeEventListener("pointermove", wakeWhileDragging, listening);
      document.removeEventListener("keydown", wake, listening);
    };
  }, [measure]);

  return bounds;
}

function hasSamePanelSurfaceSides(a: PanelSurfaceRect, b: PanelSurfaceRect) {
  return a.right === b.right && a.width === b.width;
}

// An unchanged measurement keeps the same object, so it does not render the
// panel again.
function keepSamePanelSurfaceBounds(
  current: ThreadPanelSurfaceBounds,
  next: ThreadPanelSurfaceBounds,
) {
  return isSamePanelSurfaceRect(current.app, next.app) &&
    isSamePanelSurfaceRect(current.lesson, next.lesson)
    ? current
    : next;
}

function isSamePanelSurfaceRect(a: PanelSurfaceRect, b: PanelSurfaceRect) {
  return (
    a.top === b.top &&
    a.right === b.right &&
    a.width === b.width &&
    a.height === b.height
  );
}

function getThreadPanelSurfaceBounds(
  viewport: ViewportBounds,
): ThreadPanelSurfaceBounds {
  const fallbackBounds = getThreadPanelFallbackSurfaceBounds(viewport);
  if (typeof document === "undefined") return fallbackBounds;

  const viewportBottom = viewport.top + viewport.height;
  const appElement = document.querySelector<HTMLElement>(
    "#courses-main-scrollport",
  );
  const lessonElement = document.querySelector<HTMLElement>(
    "[data-discussion-panel-anchor]",
  );
  const appRect = appElement?.getBoundingClientRect();
  const lessonRect = lessonElement?.getBoundingClientRect();
  const hasAppRect = Boolean(
    appRect && appRect.width > 1 && appRect.height > 1,
  );
  const hasLessonRect = Boolean(
    lessonRect && lessonRect.width > 1 && lessonRect.height > 1,
  );

  if (!hasAppRect || !appRect) {
    return fallbackBounds;
  }

  const appTop = Math.max(viewport.top, appRect.top);
  const appBottom = Math.min(viewportBottom, appRect.bottom);
  const appLeft = Math.max(0, appRect.left);
  const appRight = Math.min(viewport.width, appRect.right);
  const app: PanelSurfaceRect = {
    top: appTop,
    right: appRight,
    width: Math.max(1, appRight - appLeft),
    height: Math.max(1, appBottom - appTop),
  };

  if (!hasLessonRect || !lessonRect) {
    return { app, lesson: app };
  }

  const lessonTop = Math.max(appTop, viewport.top, lessonRect.top);
  const lessonBottom = Math.min(appBottom, viewportBottom, lessonRect.bottom);
  const lessonLeft = Math.max(appLeft, lessonRect.left);
  const lessonRight = Math.min(appRight, lessonRect.right);

  return {
    app,
    lesson: {
      top: lessonTop,
      right: lessonRight,
      width: Math.max(1, lessonRight - lessonLeft),
      height: Math.max(1, lessonBottom - lessonTop),
    },
  };
}

function getThreadPanelFallbackSurfaceBounds(
  viewport: ViewportBounds,
): ThreadPanelSurfaceBounds {
  const fallbackInset = 14;
  const surface: PanelSurfaceRect = {
    top: viewport.top + fallbackInset,
    right: viewport.width - fallbackInset,
    width: Math.max(1, viewport.width - fallbackInset * 2),
    height: Math.max(1, viewport.height - fallbackInset * 2),
  };

  return { app: surface, lesson: surface };
}

// The panel is only put on the page in the browser, after a thread has been
// asked for, so these two read the screen for their first value. The panel
// then has its real layout and size from its first frame, instead of
// starting as a desktop panel of a made-up size and being rebuilt.
function useThreadPanelPhoneLayout() {
  const [isPhone, setIsPhone] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(THREAD_PANEL_PHONE_QUERY).matches,
  );
  useEffect(() => {
    const media = window.matchMedia(THREAD_PANEL_PHONE_QUERY);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return isPhone;
}

function readVisualViewportBounds(): ViewportBounds {
  if (typeof window === "undefined") return THREAD_PANEL_INITIAL_VIEWPORT;
  const visualViewport = window.visualViewport;
  const layoutWidth =
    document.documentElement.clientWidth ||
    document.body.clientWidth ||
    window.innerWidth;
  return {
    top: Math.max(0, Math.round(visualViewport?.offsetTop ?? 0)),
    height: Math.max(
      1,
      Math.round(
        visualViewport?.height ??
          document.documentElement.clientHeight ??
          window.innerHeight,
      ),
    ),
    width: Math.max(
      1,
      Math.round(Math.min(visualViewport?.width ?? layoutWidth, layoutWidth)),
    ),
  };
}

function useVisualViewportBounds() {
  const [bounds, setBounds] = useState(readVisualViewportBounds);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() =>
        // An unchanged reading keeps the same object, so it does not render
        // the panel and its threads again.
        setBounds((current) => {
          const next = readVisualViewportBounds();
          return current.top === next.top &&
            current.height === next.height &&
            current.width === next.width
            ? current
            : next;
        }),
      );
    };
    window.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("resize", sync);
    window.visualViewport?.addEventListener("scroll", sync);
    sync();
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("resize", sync);
      window.visualViewport?.removeEventListener("scroll", sync);
    };
  }, []);

  return bounds;
}
