import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { ChatCenteredDotsIcon as ChatCenteredDots } from "@phosphor-icons/react/ChatCenteredDots";
import { ArrowsInIcon as ArrowsIn } from "@phosphor-icons/react/ArrowsIn";
import { ArrowsOutIcon as ArrowsOut } from "@phosphor-icons/react/ArrowsOut";
import { FileTextIcon as FileText } from "@phosphor-icons/react/FileText";
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
  activeEntryId: number | null;
  entries: Comment[];
  focusComposerOnOpen?: boolean;
  onOpenChange: (open: boolean) => void;
  onActiveEntryChange: (entryId: number) => void;
  onLike: (id: number, liked: boolean) => void;
  onAddReply: (entryId: number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: number) => void;
  onEditReply: (
    entryId: number,
    replyId: number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}

export function DiscussionThreadPanel({
  open,
  activeEntryId,
  entries,
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
    entryId: number | null;
  }>({ id: 0, entryId: null });
  const activeIndex = Math.max(
    0,
    entries.findIndex((entry) => entry.id === activeEntryId),
  );
  const requestComposerFocus = useCallback((entryId: number) => {
    setComposerFocusRequest((current) => ({
      id: current.id + 1,
      entryId,
    }));
  }, []);
  const handleComposerFocusHandled = useCallback(
    (entryId: number, requestId: number) => {
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
  focusRequest: number;
  onFocusComposer: (entryId: number) => void;
  onComposerFocusHandled: (entryId: number, requestId: number) => void;
  onLike: (id: number, liked: boolean) => void;
  onAddReply: (entryId: number, reply: CommentReply) => void;
  onEditEntry: (comment: Comment) => void;
  onDeleteEntry: (id: number) => void;
  onEditReply: (
    entryId: number,
    replyId: number,
    draft: DiscussionDraft,
  ) => void;
  onDeleteReply: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}

function ThreadSlide({
  entry,
  active,
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
}: ThreadSlideProps) {
  const replies = entry.thread ?? [];
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
          onLike={onLike}
          onReply={focusComposer}
          onEdit={() => onEditEntry(entry)}
          onDelete={() => onDeleteEntry(entry.id)}
          onReport={() => onReport(entry.id)}
        />

        <div className="mx-auto max-w-4xl">
          {replies.length > 0 ? (
            replies.map((reply) => (
              <ThreadReplyEntry
                key={reply.id}
                parentId={entry.id}
                reply={reply}
                onReply={focusComposer}
                onEdit={onEditReply}
                onDelete={onDeleteReply}
                onReport={onReport}
              />
            ))
          ) : (
            <div className="px-4 py-12 text-center sm:py-16">
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

      {active && (
        <ThreadReplyComposer
          entry={entry}
          focusRequest={focusRequest}
          onFocusHandled={onComposerFocusHandled}
          onSubmit={(reply) => onAddReply(entry.id, reply)}
        />
      )}
    </div>
  );
}

function ThreadRootEntry({
  entry,
  onLike,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  entry: Comment;
  onLike: (id: number, liked: boolean) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onReport: () => void;
}) {
  const [liked, setLiked] = useState(Boolean(entry.liked));
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
          {entry.attachment && (
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
          )}
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
              {replyCount} {replyCount === 1 ? "reply" : "replies"}
            </button>
          </div>
        </div>
      </div>
    </article>
  );
}

function ThreadReplyEntry({
  parentId,
  reply,
  onReply,
  onEdit,
  onDelete,
  onReport,
}: {
  parentId: number;
  reply: CommentReply;
  onReply: () => void;
  onEdit: (entryId: number, replyId: number, draft: DiscussionDraft) => void;
  onDelete: (entryId: number, replyId: number) => void;
  onReport: (id: number) => void;
}) {
  const [liked, setLiked] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editDraft, setEditDraft] = useState(
    reply.content ?? createDiscussionDraft(reply.text),
  );

  return (
    <article data-thread-reply-entry className="px-3 py-2.5 sm:px-8">
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
              onEdit={() => setEditing(true)}
              onShare={() =>
                void shareDiscussionEntry(reply.id, reply.name, reply.text)
              }
              onDelete={() => onDelete(parentId, reply.id)}
              onReport={() => onReport(reply.id)}
              className="absolute -top-1 right-0 z-20 shrink-0"
            />
          </div>
          {editing ? (
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
              }}
              onSave={() => {
                if (!hasDiscussionDraftContent(editDraft)) return;
                onEdit(parentId, reply.id, editDraft);
                setEditing(false);
              }}
            />
          ) : (
            <DiscussionMarkdown
              content={reply.content ?? createDiscussionDraft(reply.text)}
              label={`Reply by ${reply.name}`}
              className="mt-0.5 max-w-3xl pr-9 sm:pr-10"
            />
          )}
          <div className="mt-1.5 flex min-h-9 items-center gap-4 text-xs text-(--muted) sm:text-sm">
            <button
              type="button"
              aria-pressed={liked}
              aria-label={liked ? "Unlike reply" : "Like reply"}
              onClick={() => setLiked((current) => !current)}
              className={`inline-flex min-h-9 items-center gap-2 rounded-lg px-1.5 transition-colors hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent) ${liked ? "text-(--accent-ink,var(--accent))" : ""}`}
            >
              <ThumbsUp size={18} weight={liked ? "fill" : "regular"} />
              {reply.likes + (liked ? 1 : 0)}
            </button>
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
    </article>
  );
}

function ThreadReplyComposer({
  entry,
  focusRequest,
  onFocusHandled,
  onSubmit,
}: {
  entry: Comment;
  focusRequest: number;
  onFocusHandled: (entryId: number, requestId: number) => void;
  onSubmit: (reply: CommentReply) => void;
}) {
  const [draft, setDraft] = useState<DiscussionDraft>(
    createEmptyDiscussionDraft,
  );
  const [editorController, setEditorController] =
    useState<DiscussionEditorController | null>(null);
  const [formattingState, setFormattingState] =
    useState<DiscussionFormattingState>(EMPTY_FORMATTING_STATE);

  useEffect(() => {
    setDraft(createEmptyDiscussionDraft());
  }, [entry.id]);

  useEffect(() => {
    if (!editorController || focusRequest <= 0) return;
    editorController.focus();
    onFocusHandled(entry.id, focusRequest);
  }, [editorController, entry.id, focusRequest, onFocusHandled]);

  const canSubmit = hasDiscussionDraftContent(draft);
  const submit = () => {
    if (!canSubmit) return;
    onSubmit({
      id: Date.now(),
      name: "Ashi Singh",
      time: "Just now",
      avatar: "/assets/sofia-avatar-160.webp",
      text: draft.plainText.trim(),
      content: draft,
      likes: 0,
      isOwn: true,
    });
    setDraft(createEmptyDiscussionDraft());
    window.setTimeout(() => editorController?.focus(), 0);
  };

  return (
    <div
      data-thread-reply-composer
      className="-mx-4 -mb-4 mt-0 grid shrink-0 grid-rows-[auto_auto] overflow-hidden rounded-t-xl bg-[color-mix(in_srgb,var(--surface)_72%,transparent)] transition-colors duration-150 focus-within:bg-[color-mix(in_srgb,var(--surface)_90%,var(--canvas))] sm:mx-0 sm:mb-0 sm:rounded-xl"
    >
      <DiscussionEditor
        documentId={`thread-reply-${entry.id}`}
        value={draft}
        label={`Reply to ${entry.name}`}
        placeholderText="Write a reply…"
        autoGrow
        onChange={setDraft}
        onControllerChange={setEditorController}
        onFormattingStateChange={setFormattingState}
      />
      <div className="flex min-h-14 min-w-0 items-center gap-1.5 overflow-hidden bg-[color-mix(in_srgb,var(--surface)_66%,transparent)] px-2.5 py-2 sm:gap-2 sm:px-3">
        <img
          src="/assets/sofia-avatar-160.webp"
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
          disabled={!canSubmit}
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
