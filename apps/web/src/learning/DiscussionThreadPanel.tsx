import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { BookmarkSimpleIcon as BookmarkSimple } from "@phosphor-icons/react/BookmarkSimple";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";
import { ArrowsInIcon as ArrowsIn } from "@phosphor-icons/react/ArrowsIn";
import { ArrowsOutIcon as ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
import { LockIcon as Lock } from "@phosphor-icons/react/Lock";
import { LockOpenIcon as LockOpen } from "@phosphor-icons/react/LockOpen";
import { PaperPlaneTiltIcon as PaperPlaneTilt } from "@phosphor-icons/react/PaperPlaneTilt";
import { ThumbsUpIcon as ThumbsUp } from "@phosphor-icons/react/ThumbsUp";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
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
  useToggleLike,
  useUpdateReply,
} from "../services/learning-interactions";
import { adaptLearningReplyToCommentReply } from "./learning-replies.adapter";
import { useUndoableDeletion, UndoDeleteButton } from "./useUndoableDeletion";
import {
  DiscussionAttachmentsList,
  AttachmentComposerPreview,
  type DiscussionAttachmentItem,
} from "./discussion-attachments";
import { CommentFormattingToolbar } from "./CommentFormattingToolbar";
import {
  DiscussionEditor,
  type DiscussionEditorController,
} from "./discussion-editor/DiscussionEditor";
import { DiscussionMarkdown } from "./discussion-editor/DiscussionMarkdown";
import type { DiscussionFormattingState } from "./discussion-editor/commands";
import {
  createDiscussionDraft,
  createEmptyDiscussionDraft,
  hasDiscussionDraftContent,
  type DiscussionDraft,
} from "./discussion-editor/types";
import { SurfaceTopRightAccentGlow } from "./SurfaceTopRightAccentGlow";

const THREAD_PANEL_MIN_WIDTH = 440;
const THREAD_PANEL_MAX_WIDTH = 1080;
const THREAD_PANEL_DEFAULT_WIDTH = 860;
const THREAD_PANEL_WIDTH_KEY = "veolms-discussion-thread-panel-width";
const THREAD_PANEL_MIN_HEIGHT = 360;
const THREAD_PANEL_PHONE_QUERY = "(max-width: 639px)";
const THREAD_PANEL_MOBILE_SNAP_RATIO = 0.72;
const THREAD_PANEL_SLIDE_DURATION = 320;
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
  userRole?: string;
  currentUser?: {
    name: string;
    avatar: string;
  };
  focusComposerOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
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
        }
      | (string | number),
  ) => void;
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
}

export function DiscussionThreadPanel({
  open,
  activeEntryId,
  entries,
  isBackendMode = false,
  currentUserId,
  userRole,
  currentUser,
  focusComposerOnOpen = false,
  onOpenChange,
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
}: DiscussionThreadPanelProps) {
  const isPhone = useThreadPanelPhoneLayout();
  const viewport = useVisualViewportBounds();
  const [surfaceBoundsFrozen, setSurfaceBoundsFrozen] = useState(open);
  const surfaceBounds = useThreadPanelSurfaceBounds(
    viewport,
    surfaceBoundsFrozen,
  );
  const swiperRef = useRef<SwiperInstance | null>(null);
  const widthResizeRef = useRef<PanelWidthResize | null>(null);
  const heightResizeRef = useRef<PanelHeightResize | null>(null);
  const wasOpenRef = useRef(false);
  const [panelWidth, setPanelWidth] = useState(getInitialPanelWidth);
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [resizingAxis, setResizingAxis] = useState<"width" | "height" | null>(
    null,
  );
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
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeEntryId),
  );
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
    if (open) setSurfaceBoundsFrozen(true);
  }, [open]);

  const clampPanelWidth = useCallback(
    (width: number) => {
      const availableWidth = Math.max(1, surfaceBounds.lesson.width);
      const minimumWidth = Math.min(THREAD_PANEL_MIN_WIDTH, availableWidth);
      return Math.min(
        availableWidth,
        THREAD_PANEL_MAX_WIDTH,
        Math.max(minimumWidth, width),
      );
    },
    [surfaceBounds.lesson.width],
  );
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
    setPanelWidth((current) => clampPanelWidth(current));
    setPanelHeight((current) =>
      current === null ? null : clampPanelHeight(current),
    );
  }, [clampPanelHeight, clampPanelWidth, isPhone]);

  useEffect(() => {
    if (!open || !isPhone) return;
    setExpanded(false);
    setMobileSnapPoint(mobileCollapsedSnapPoint);
  }, [isPhone, mobileCollapsedSnapPoint, open]);

  const commitPanelWidth = useCallback((width: number) => {
    const nextWidth = Math.min(
      THREAD_PANEL_MAX_WIDTH,
      Math.max(THREAD_PANEL_MIN_WIDTH, width),
    );
    setPanelWidth(nextWidth);
    try {
      window.localStorage.setItem(THREAD_PANEL_WIDTH_KEY, String(nextWidth));
    } catch {
      // The panel still resizes when storage is unavailable.
    }
  }, []);

  const commitPanelHeight = useCallback(
    (height: number) => setPanelHeight(clampPanelHeight(height)),
    [clampPanelHeight],
  );

  const beginWidthResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isPhone || expanded) return;
    event.preventDefault();
    widthResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: panelWidth,
    };
    setResizingAxis("width");
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const moveWidthResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = widthResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    setPanelWidth(
      Math.min(
        THREAD_PANEL_MAX_WIDTH,
        Math.max(0, resize.startWidth + (resize.startX - event.clientX)),
      ),
    );
  };

  const endWidthResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const resize = widthResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    widthResizeRef.current = null;
    setResizingAxis(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitPanelWidth(clampPanelWidth(panelWidth));
  };

  const beginHeightResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (isPhone || expanded) return;
    event.preventDefault();
    heightResizeRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: clampPanelHeight(panelHeight ?? surfaceBounds.lesson.height),
    };
    setResizingAxis("height");
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
    setResizingAxis(null);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    commitPanelHeight(nextHeight);
  };

  const activeSurface = expanded ? surfaceBounds.app : surfaceBounds.lesson;
  const resolvedPanelWidth = isPhone
    ? viewport.width
    : expanded
      ? activeSurface.width
      : clampPanelWidth(panelWidth);
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
      key={isPhone ? "phone-discussion-thread" : "desktop-discussion-thread"}
      open={open}
      onOpenChange={onOpenChange}
      onOpenChangeComplete={(nextOpen) => {
        if (!nextOpen) {
          setSurfaceBoundsFrozen(false);
          setExpanded(false);
          setPanelHeight(null);
          setMobileSnapPoint(mobileCollapsedSnapPoint);
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
        data-panel-surface-frozen={surfaceBoundsFrozen || undefined}
        data-panel-resizing={resizingAxis ? "true" : undefined}
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
            aria-orientation="vertical"
            aria-label="Resize discussion thread"
            aria-valuemin={THREAD_PANEL_MIN_WIDTH}
            aria-valuemax={THREAD_PANEL_MAX_WIDTH}
            aria-valuenow={Math.round(resolvedPanelWidth)}
            tabIndex={0}
            title="Resize discussion thread"
            className="group/resize absolute inset-y-0 left-0 z-30 flex w-5 cursor-ew-resize touch-none items-center justify-start focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                onOpenChange(false);
                return;
              }
              if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
                return;
              }
              event.preventDefault();
              commitPanelWidth(
                clampPanelWidth(
                  panelWidth + (event.key === "ArrowLeft" ? 24 : -24),
                ),
              );
            }}
            onPointerDown={beginWidthResize}
            onPointerMove={moveWidthResize}
            onPointerUp={endWidthResize}
            onPointerCancel={endWidthResize}
          >
            <span className="h-[calc(100%-28px)] w-0.5 rounded-full bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_54%,var(--border))_16%,color-mix(in_srgb,var(--accent)_54%,var(--border))_84%,transparent)] opacity-0 shadow-[0_0_0_transparent] transition-[width,opacity,box-shadow] duration-160 group-hover/resize:w-0.75 group-hover/resize:opacity-100 group-hover/resize:shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_42%,transparent)]" />
          </div>
        )}

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
            onSwiper={(swiper) => {
              swiperRef.current = swiper;
              swiper.slideTo(activeIndex, 0);
            }}
            onSlideChange={(swiper) => {
              const entry = entries[swiper.activeIndex];
              if (entry) onActiveEntryChange(entry.id);
            }}
          >
            {entries.map((entry) => (
              <SwiperSlide key={entry.id} className="h-full!">
                <ThreadSlide
                  entry={entry}
                  active={entry.id === activeEntryId}
                  isBackendMode={isBackendMode}
                  currentUserId={currentUserId}
                  userRole={userRole}
                  currentUser={currentUser}
                  focusRequest={
                    composerFocusRequest.entryId === entry.id
                      ? composerFocusRequest.id
                      : 0
                  }
                  onFocusComposer={requestComposerFocus}
                  onComposerFocusHandled={handleComposerFocusHandled}
                  onLike={onLike}
                  onAddReply={onAddReply}
                  onEditEntry={(comment) => {
                    onOpenChange(false);
                    onEditEntry(comment);
                  }}
                  onDeleteEntry={(id) => {
                    onDeleteEntry(id);
                    onOpenChange(false);
                  }}
                  onEditReply={onEditReply}
                  onDeleteReply={onDeleteReply}
                  onReport={onReport}
                  onToggleAcceptReply={onToggleAcceptReply}
                  onToggleLockThread={onToggleLockThread}
                  onToggleBookmark={onToggleBookmark}
                />
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

interface ThreadSlideProps {
  entry: Comment;
  active: boolean;
  isBackendMode?: boolean;
  currentUserId?: string;
  userRole?: string;
  currentUser?: {
    name: string;
    avatar: string;
  };
  focusRequest: number;
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
        }
      | (string | number),
  ) => void;
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
}

function ThreadSlide({
  entry,
  active,
  isBackendMode = false,
  currentUserId,
  userRole,
  currentUser,
  focusRequest,
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
}: ThreadSlideProps) {
  const isQuestion =
    entry.entryKind === "question" || Boolean(entry.isQuestion);
  const isModerator = userRole === "Instructor" || userRole === "Admin";
  const canLock = Boolean(entry.isOwn || isModerator);
  const canAcceptAnswer = isQuestion && Boolean(entry.isOwn || isModerator);

  const isBackend = Boolean(isBackendMode && typeof entry.id === "string");
  const threadId = String(entry.id);

  const {
    data: repliesData,
    isLoading: isRepliesLoading,
    isError: isRepliesError,
    refetch: refetchReplies,
  } = useThreadReplies(threadId, undefined, {
    enabled: isBackend && active,
  });

  const createReplyMutation = useCreateReply(threadId);
  const updateReplyMutation = useUpdateReply(threadId);
  const deleteReplyMutation = useDeleteReply(threadId);
  const toggleLikeMutation = useToggleLike();

  const [pendingLikeReplyIds, setPendingLikeReplyIds] = useState<
    Set<string | number>
  >(new Set());

  const replies = useMemo<CommentReply[]>(() => {
    if (!isBackend) {
      return entry.thread ?? [];
    }
    if (!repliesData?.replies) {
      return [];
    }
    return repliesData.replies.map((reply) =>
      adaptLearningReplyToCommentReply(reply, currentUserId),
    );
  }, [isBackend, entry.thread, repliesData?.replies, currentUserId]);

  const handleAddReply = async (
    draft: DiscussionDraft,
    attachmentIds?: string[],
  ): Promise<boolean> => {
    if (isBackend) {
      try {
        await createReplyMutation.mutateAsync({
          content: draft.markdown || draft.plainText.trim(),
          attachmentIds:
            attachmentIds && attachmentIds.length > 0
              ? attachmentIds
              : undefined,
        });
        return true;
      } catch {
        return false;
      }
    } else {
      onAddReply(entry.id, {
        id: Date.now(),
        name: currentUser?.name || "Ashi Singh",
        time: "Just now",
        avatar: currentUser?.avatar || "/assets/sofia-avatar-160.webp",
        text: draft.plainText.trim(),
        content: draft,
        likes: 0,
        isOwn: true,
      });
      return true;
    }
  };

  const handleEditReply = async (
    replyId: string | number,
    draft: DiscussionDraft,
  ): Promise<boolean> => {
    if (isBackend) {
      try {
        await updateReplyMutation.mutateAsync({
          replyId: String(replyId),
          payload: {
            content: draft.markdown || draft.plainText.trim(),
          },
        });
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
      try {
        await deleteReplyMutation.mutateAsync(String(replyId));
        return true;
      } catch {
        return false;
      }
    } else {
      onDeleteReply(entry.id, replyId);
      return true;
    }
  };

  const handleLikeReply = async (replyId: string | number) => {
    if (pendingLikeReplyIds.has(replyId)) return;
    if (isBackend) {
      setPendingLikeReplyIds((prev) => new Set(prev).add(replyId));
      try {
        await toggleLikeMutation.mutateAsync({
          targetType: "reply",
          targetId: String(replyId),
        });
      } catch {
        // Handled cleanly; query cache reflects backend state
      } finally {
        setPendingLikeReplyIds((prev) => {
          const next = new Set(prev);
          next.delete(replyId);
          return next;
        });
      }
    } else {
      const reply = replies.find((r) => r.id === replyId);
      if (reply) {
        reply.liked = !reply.liked;
        reply.likes += reply.liked ? 1 : -1;
      }
    }
  };

  const focusComposer = () => onFocusComposer(entry.id);

  return (
    <div
      aria-hidden={active ? undefined : true}
      inert={active ? undefined : true}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden px-4 pb-4"
    >
      <div className="learning-comment-formatting-scrollport min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain">
        <ThreadRootEntry
          entry={entry}
          canLock={canLock}
          onToggleLock={() => onToggleLockThread?.(entry.id, !entry.isLocked)}
          onToggleBookmark={onToggleBookmark}
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
          {!active ? null : isBackend && isRepliesLoading ? (
            <div
              className="py-12 text-center"
              data-testid="learning-replies-loading"
            >
              <div className="mx-auto mb-2.5 h-6 w-6 animate-spin rounded-full border-2 border-(--text-secondary) border-t-transparent" />
              <p className="text-sm font-medium text-(--muted)">
                Loading replies…
              </p>
            </div>
          ) : isBackend && isRepliesError ? (
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
                key={reply.id}
                parentId={entry.id}
                reply={reply}
                isQuestion={isQuestion}
                canAcceptAnswer={canAcceptAnswer}
                onToggleAcceptReply={(replyId, accepted) =>
                  onToggleAcceptReply?.(entry.id, replyId, accepted)
                }
                isLikePending={pendingLikeReplyIds.has(reply.id)}
                onReply={entry.isLocked ? () => {} : focusComposer}
                onEdit={handleEditReply}
                onDelete={handleDeleteReply}
                onLikeReply={handleLikeReply}
                onReport={onReport}
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
                Be the first to reply to {entry.name}.
              </p>
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
            onFocusHandled={onComposerFocusHandled}
            onSubmit={handleAddReply}
            isPending={createReplyMutation.isPending}
          />
        ))}
    </div>
  );
}

function ThreadRootEntry({
  entry,
  canLock = false,
  onToggleLock,
  onToggleBookmark,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  entry: Comment;
  canLock?: boolean;
  onToggleLock?: () => void;
  onToggleBookmark?: (
    threadId: string | number,
    bookmarked: boolean,
  ) => Promise<boolean> | void;
  onLike: (id: string | number, liked: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const [liked, setLiked] = useState(Boolean(entry.liked));
  const isNote = entry.entryKind === "note" || (entry as any).kind === "note";

  useEffect(() => {
    setLiked(Boolean(entry.liked));
  }, [entry.liked]);

  const replyCount = Math.max(entry.replies ?? 0, entry.thread?.length ?? 0);

  return (
    <article className="mx-auto mb-1 max-w-4xl pt-3 pb-4">
      <div className="flex gap-3 sm:gap-3.5">
        <img
          src={entry.avatar}
          alt=""
          className="size-10 shrink-0 rounded-full object-cover sm:size-11"
        />
        <div className="min-w-0 flex-1">
          <div className="relative flex items-start gap-2 pr-9">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
              <h2 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                {entry.name}
              </h2>
              {entry.role === "Instructor" && (
                <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                  Instructor
                </span>
              )}
              {entry.isQuestion && Boolean(entry.acceptedAnswerId) && (
                <span
                  data-testid="qa-solved-badge"
                  className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-600 dark:text-emerald-400"
                >
                  <CheckCircle size={14} weight="fill" />
                  Solved
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
              <span aria-hidden="true" className="text-(--muted)">
                ·
              </span>
              <span className="text-xs text-(--muted) sm:text-sm">
                {entry.time}
              </span>
            </div>
            <CommentActionMenu
              name={entry.name}
              kind={
                entry.entryKind ?? (entry.isQuestion ? "question" : "comment")
              }
              isOwn={Boolean(entry.isOwn)}
              canLock={canLock}
              isLocked={Boolean(entry.isLocked)}
              onToggleLock={onToggleLock}
              isBookmarked={Boolean(entry.isBookmarked)}
              onToggleBookmark={
                onToggleBookmark
                  ? () => onToggleBookmark(entry.id, !entry.isBookmarked)
                  : undefined
              }
              onEdit={onEdit}
              onShare={() =>
                void shareDiscussionEntry(entry.id, entry.name, entry.text)
              }
              onDelete={onDelete}
              onReport={onReport}
              className="absolute -top-1 right-0 z-20 shrink-0"
            />
          </div>
          <DiscussionMarkdown
            content={entry.content ?? createDiscussionDraft(entry.text)}
            label={`Discussion entry by ${entry.name}`}
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
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? "Unlike" : "Like"}
              onClick={() => {
                const nextLiked = !liked;
                setLiked(nextLiked);
                onLike(entry.id, nextLiked);
              }}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
            >
              <ThumbsUp size={19} weight={liked ? "fill" : "regular"} />
              {entry.likes}
            </button>
            {!entry.isLocked && (
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
  isQuestion = false,
  canAcceptAnswer = false,
  onToggleAcceptReply,
  isLikePending = false,
  onReply,
  onEdit,
  onDelete,
  onLikeReply,
  onReport,
}: {
  parentId: string | number;
  reply: CommentReply;
  isQuestion?: boolean;
  canAcceptAnswer?: boolean;
  onToggleAcceptReply?: (replyId: string | number, accepted: boolean) => void;
  isLikePending?: boolean;
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
        }
      | (string | number),
  ) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    reply.content ?? createDiscussionDraft(reply.text),
  );
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const deletion = useUndoableDeletion(async () => {
    const success = await onDelete(reply.id);
    if (!success) {
      setDeleteError("Failed to delete reply. Please try again.");
    }
  });

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

  return (
    <article
      data-thread-reply-entry
      data-deletion-pending={deletion.pending || undefined}
      className={`relative px-3 py-2.5 sm:px-8 ${deletion.pending ? "min-h-9" : ""}`}
    >
      <div
        inert={deletion.pending ? true : undefined}
        className={`grid transition-[grid-template-rows,opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] motion-reduce:transition-none ${deletion.pending ? "pointer-events-none -translate-y-1 grid-rows-[0fr] opacity-0" : "translate-y-0 grid-rows-[1fr] opacity-100"}`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex gap-3.5">
            <img
              src={reply.avatar}
              alt=""
              className="size-9 shrink-0 rounded-full object-cover sm:size-10"
            />
            <div className="min-w-0 flex-1">
              <div className="relative flex items-start gap-2 pr-9">
                <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
                  <h3 className="text-sm font-semibold text-(--text) sm:text-[15px]">
                    {reply.name}
                  </h3>
                  {reply.role === "Instructor" && (
                    <span className="rounded-md bg-sky-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-sky-600 dark:text-sky-400">
                      Instructor
                    </span>
                  )}
                  {reply.isAccepted && (
                    <span
                      data-testid="accepted-answer-badge"
                      className="inline-flex items-center gap-1 rounded-md bg-emerald-500/10 px-1.5 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400"
                    >
                      <CheckCircle size={13} weight="fill" />
                      Accepted Answer
                    </span>
                  )}
                  <span aria-hidden="true" className="text-(--muted)">
                    ·
                  </span>
                  <span className="text-xs text-(--muted) sm:text-sm">
                    {reply.time}
                  </span>
                </div>
                <CommentActionMenu
                  name={reply.name}
                  kind="reply"
                  isOwn={Boolean(reply.isOwn)}
                  canAcceptAnswer={isQuestion && canAcceptAnswer}
                  isAccepted={Boolean(reply.isAccepted)}
                  onToggleAccept={
                    isQuestion && canAcceptAnswer && onToggleAcceptReply
                      ? () => onToggleAcceptReply(reply.id, !reply.isAccepted)
                      : undefined
                  }
                  onEdit={() => {
                    setEditDraft(
                      reply.content ?? createDiscussionDraft(reply.text),
                    );
                    setEditing(true);
                  }}
                  onShare={() =>
                    void shareDiscussionEntry(reply.id, reply.name, reply.text)
                  }
                  onDelete={deletion.begin}
                  onReport={() =>
                    onReport({
                      targetType: "reply",
                      targetId: reply.id,
                      authorName: reply.name,
                    })
                  }
                  className="absolute -top-1 right-0 z-20 shrink-0"
                />
              </div>
              {editing ? (
                <div>
                  <InlineEditForm
                    documentId={`thread-reply-edit-${reply.id}`}
                    label={`Edit reply by ${reply.name}`}
                    value={editDraft}
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
                  className="mt-0.5 max-w-3xl pr-9 sm:pr-10"
                />
              )}
              {reply.attachments && reply.attachments.length > 0 && (
                <DiscussionAttachmentsList attachments={reply.attachments} />
              )}
              {deleteError && (
                <p role="alert" className="mt-1 text-xs text-red-500">
                  {deleteError}
                </p>
              )}
              <div className="mt-1.5 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm">
                <button
                  type="button"
                  aria-pressed={Boolean(reply.liked)}
                  aria-label={reply.liked ? "Unlike reply" : "Like reply"}
                  disabled={isLikePending}
                  onClick={() => onLikeReply(reply.id)}
                  className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${reply.liked ? "text-(--accent-ink,var(--accent))" : ""}`}
                >
                  <ThumbsUp
                    size={18}
                    weight={reply.liked ? "fill" : "regular"}
                  />
                  <span>{reply.likes}</span>
                </button>
                {isQuestion && canAcceptAnswer && onToggleAcceptReply && (
                  <button
                    type="button"
                    data-testid={`accept-reply-btn-${reply.id}`}
                    aria-label={
                      reply.isAccepted ? "Unaccept answer" : "Accept answer"
                    }
                    title={
                      reply.isAccepted ? "Unaccept answer" : "Accept answer"
                    }
                    onClick={() =>
                      onToggleAcceptReply(reply.id, !reply.isAccepted)
                    }
                    className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-(--accent) ${
                      reply.isAccepted
                        ? "bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500/20 dark:text-emerald-400"
                        : "text-(--muted) hover:bg-(--hover) hover:text-(--text)"
                    }`}
                  >
                    <CheckCircle
                      size={16}
                      weight={reply.isAccepted ? "fill" : "bold"}
                    />
                    <span>{reply.isAccepted ? "Accepted" : "Accept"}</span>
                  </button>
                )}
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
          className="absolute top-2 right-2"
        />
      )}
    </article>
  );
}

function ThreadReplyComposer({
  entry,
  currentUser,
  focusRequest,
  onFocusHandled,
  onSubmit,
  isPending = false,
}: {
  entry: Comment;
  currentUser?: { name: string; avatar: string };
  focusRequest: number;
  onFocusHandled: (entryId: string | number, requestId: number) => void;
  onSubmit: (
    draft: DiscussionDraft,
    attachmentIds?: string[],
  ) => Promise<boolean>;
  isPending?: boolean;
}) {
  const [composerKey, setComposerKey] = useState(0);
  const [draft, setDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const [replyAttachments, setReplyAttachments] = useState<
    DiscussionAttachmentItem[]
  >([]);
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const shouldFocusRef = useRef(false);

  useEffect(() => {
    setDraft(createEmptyDiscussionDraft());
    setReplyAttachments([]);
    setComposerKey(0);
    setSubmitError("");
  }, [entry.id]);

  useEffect(() => {
    if (!editorController || focusRequest <= 0) return;
    editorController.focus();
    onFocusHandled(entry.id, focusRequest);
  }, [editorController, entry.id, focusRequest, onFocusHandled]);

  const isPendingSubmission = isSubmitting || isPending;
  const canSubmit = hasDiscussionDraftContent(draft) && !isPendingSubmission;

  const submit = async () => {
    if (!canSubmit || isPendingSubmission) return;
    setIsSubmitting(true);
    setSubmitError("");
    try {
      const success = await onSubmit(
        draft,
        replyAttachments.map((a) => a.id),
      );
      if (success) {
        shouldFocusRef.current = true;
        setDraft(createEmptyDiscussionDraft());
        setReplyAttachments([]);
        setComposerKey((k) => k + 1);
        setSubmitError("");
        window.setTimeout(() => {
          editorController?.focus();
        }, 0);
      } else {
        setSubmitError("Failed to post reply. Please try again.");
      }
    } catch {
      setSubmitError("Failed to post reply. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleControllerChange = (
    controller: DiscussionEditorController | null,
  ) => {
    setEditorController(controller);
    if (controller && shouldFocusRef.current) {
      shouldFocusRef.current = false;
      window.setTimeout(() => {
        controller.focus();
      }, 0);
    }
  };

  const composerAvatar = currentUser?.avatar || "/assets/sofia-avatar-160.webp";

  return (
    <div
      data-thread-reply-composer
      className="-mx-4 -mb-4 mt-0 grid shrink-0 grid-rows-[auto_auto] overflow-hidden rounded-t-xl bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] transition-colors duration-150 focus-within:bg-[color-mix(in_srgb,var(--surface)_90%,var(--canvas))] sm:mx-0 sm:mb-0 sm:rounded-xl"
    >
      <DiscussionEditor
        documentId={`thread-reply-${entry.id}-${composerKey}`}
        value={draft}
        label={`Reply to ${entry.name}`}
        placeholderText="Write a reply…"
        autoGrow
        autoFocus={shouldFocusRef.current}
        onChange={setDraft}
        onControllerChange={handleControllerChange}
        onFormattingStateChange={setFormattingState}
        onAttachmentUploaded={(att) => {
          setReplyAttachments((prev) => [
            ...prev,
            {
              id: att.id || crypto.randomUUID(),
              fileName: att.fileName,
              fileUrl: att.url,
              mimeType: att.mimeType,
              fileSize: att.size,
              kind: att.kind,
              mediaType: att.mediaType,
            },
          ]);
        }}
      />
      <AttachmentComposerPreview
        attachments={replyAttachments}
        onRemove={(id) => {
          setReplyAttachments((prev) => prev.filter((a) => a.id !== id));
        }}
      />
      {submitError && (
        <p role="alert" className="px-3 pt-1 text-xs text-red-500">
          {submitError}
        </p>
      )}
      <div className="flex min-h-14 min-w-0 items-center gap-1.5 overflow-hidden bg-[color-mix(in_srgb,var(--surface)_66%,transparent)] px-2.5 py-2 sm:gap-2 sm:px-3">
        <img
          src={composerAvatar}
          alt=""
          className="size-9 shrink-0 rounded-full object-cover sm:size-10"
        />
        {editorController && (
          <CommentFormattingToolbar
            editor={editorController}
            formattingState={formattingState}
          />
        )}
        <button
          type="button"
          aria-label="Post reply"
          disabled={!canSubmit || isPendingSubmission}
          onClick={submit}
          className="grid size-10 shrink-0 place-items-center rounded-full bg-(--accent) text-(--on-accent) shadow-[0_8px_22px_color-mix(in_srgb,var(--accent-shadow)_62%,transparent)] transition-[background-color,opacity] hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) sm:size-11"
        >
          <PaperPlaneTilt size={23} weight="fill" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}

interface PanelWidthResize {
  pointerId: number;
  startX: number;
  startWidth: number;
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

function useThreadPanelSurfaceBounds(
  viewport: ViewportBounds,
  frozen: boolean,
) {
  const measure = useCallback(
    (): ThreadPanelSurfaceBounds => getThreadPanelSurfaceBounds(viewport),
    [viewport],
  );
  const [bounds, setBounds] = useState<ThreadPanelSurfaceBounds>(() =>
    getThreadPanelFallbackSurfaceBounds(viewport),
  );

  useThreadPanelLayoutEffect(() => {
    setBounds(measure());
  }, [measure]);

  useThreadPanelLayoutEffect(() => {
    let frame = 0;
    const lesson = document.querySelector<HTMLElement>(
      "[data-discussion-panel-anchor]",
    );
    const app = document.querySelector<HTMLElement>("#courses-main-scrollport");
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setBounds(measure()));
    };
    const syncSurface = () => {
      if (!frozen) sync();
    };
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncSurface);

    if (lesson) resizeObserver?.observe(lesson);
    if (app) resizeObserver?.observe(app);
    document.addEventListener("scroll", syncSurface, true);

    return () => {
      window.cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      document.removeEventListener("scroll", syncSurface, true);
    };
  }, [frozen, measure]);

  return bounds;
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

function getInitialPanelWidth() {
  if (typeof window === "undefined") return THREAD_PANEL_DEFAULT_WIDTH;
  try {
    const stored = Number(window.localStorage.getItem(THREAD_PANEL_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0
      ? stored
      : THREAD_PANEL_DEFAULT_WIDTH;
  } catch {
    return THREAD_PANEL_DEFAULT_WIDTH;
  }
}

function useThreadPanelPhoneLayout() {
  const [isPhone, setIsPhone] = useState(false);
  useEffect(() => {
    const media = window.matchMedia(THREAD_PANEL_PHONE_QUERY);
    const sync = () => setIsPhone(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return isPhone;
}

function useVisualViewportBounds() {
  const getBounds = useCallback(() => {
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
  }, []);
  const [bounds, setBounds] = useState(THREAD_PANEL_INITIAL_VIEWPORT);

  useEffect(() => {
    let frame = 0;
    const sync = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => setBounds(getBounds()));
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
  }, [getBounds]);

  return bounds;
}

const EMPTY_FORMATTING_STATE: DiscussionFormattingState = {
  bold: false,
  italic: false,
  highlight: false,
  link: false,
  code: false,
  codeBlock: false,
  canUndo: false,
  canRedo: false,
  linkUrl: "",
};
