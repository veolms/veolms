import { ArrowSquareOutIcon as ArrowSquareOut } from "@phosphor-icons/react/ArrowSquareOut";
import { BookOpenIcon as BookOpen } from "@phosphor-icons/react/BookOpen";
import { XIcon as X } from "@phosphor-icons/react/X";
import { XCircleIcon as XCircle } from "@phosphor-icons/react/XCircle";
import type {
  CSSProperties,
  FocusEventHandler,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from "react";
import { memo, useEffect, useRef, useState } from "react";
import { CourseActionMenu, MenuAction } from "../courses/CourseActionMenu";
import { claimPointerGesture } from "../gestures/pointerGestureOwnership";
import { lessonsById, sections } from "../learning/courseContent";
import { getCourseThumbnail, getCourseTitle } from "../learning/courseMetadata";
import type { CoursePlayerSession } from "../learning/coursePlayerNavigation";
import {
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
  type LearningSpaceResizeEdge,
} from "./useFloatingLearningSpacePanel";

interface LearningSpacePanelProps {
  panelId: string;
  panelRef: RefObject<HTMLElement | null>;
  sessions: readonly CoursePlayerSession[];
  activeCourseId?: string | null;
  compact: boolean;
  compactColumns: 1 | 2;
  mobile: boolean;
  moving: boolean;
  pinned: boolean;
  resizing: boolean;
  resizingEdge: LearningSpaceResizeEdge | null;
  width: number;
  style: CSSProperties;
  onPinnedChange: (pinned: boolean) => void;
  onDismiss: () => void;
  onActivate: (session: CoursePlayerSession) => void;
  onClose: (session: CoursePlayerSession) => void;
  onPanelPointerEnter: () => void;
  onPanelPointerLeave: () => void;
  onPanelFocus: () => void;
  onPanelBlur: FocusEventHandler<HTMLElement>;
  onInteractionLockedChange: (locked: boolean) => void;
  onStartMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onFinishMove: (event: ReactPointerEvent<HTMLElement>) => void;
  onMoveWithKeyboard: (event: ReactKeyboardEvent<HTMLElement>) => void;
  onStartResize: (
    edge: LearningSpaceResizeEdge,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  onResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onFinishResize: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeWithKeyboard: (
    edge: LearningSpaceResizeEdge,
    event: ReactKeyboardEvent<HTMLDivElement>,
  ) => void;
}

interface LearningSessionItemProps {
  session: CoursePlayerSession;
  active: boolean;
  compact: boolean;
  onActivate: (session: CoursePlayerSession) => void;
  onClose: (session: CoursePlayerSession) => void;
  onMenuOpenChange: (open: boolean) => void;
}

interface SessionGesture {
  pointerId: number;
  startX: number;
  startY: number;
  currentX: number;
  swiping: boolean;
  longPressed: boolean;
}

const LONG_PRESS_DURATION_MS = 520;
const SWIPE_COMMIT_DISTANCE = 72;
const SESSION_CLOSE_ANIMATION_MS = 220;

const openSessionInNewTab = (path: string) => {
  const openedWindow = window.open(path, "_blank", "noopener,noreferrer");
  if (openedWindow) openedWindow.opener = null;
};

const CENTERED_WAVEFORM_BARS = [
  {
    x: 2,
    y: 6,
    height: 4,
    yFrames: "6;4;6",
    heightFrames: "4;8;4",
    duration: "0.82s",
    begin: "0s",
  },
  {
    x: 7,
    y: 3,
    height: 10,
    yFrames: "3;5.5;3",
    heightFrames: "10;5;10",
    duration: "0.96s",
    begin: "0.1s",
  },
  {
    x: 12,
    y: 1,
    height: 14,
    yFrames: "1;4;1",
    heightFrames: "14;8;14",
    duration: "1.08s",
    begin: "0.2s",
  },
  {
    x: 17,
    y: 4,
    height: 8,
    yFrames: "4;1.5;4",
    heightFrames: "8;13;8",
    duration: "0.88s",
    begin: "0.06s",
  },
  {
    x: 22,
    y: 2,
    height: 12,
    yFrames: "2;5;2",
    heightFrames: "12;6;12",
    duration: "1.02s",
    begin: "0.16s",
  },
  {
    x: 27,
    y: 6,
    height: 4,
    yFrames: "6;3.5;6",
    heightFrames: "4;9;4",
    duration: "0.76s",
    begin: "0.24s",
  },
] as const;

interface PlayingWaveformProps {
  animated: boolean;
  className: string;
}

const PlayingWaveform = ({ animated, className }: PlayingWaveformProps) => (
  <svg
    className={className}
    viewBox="0 0 32 16"
    fill="currentColor"
    aria-hidden="true"
  >
    {CENTERED_WAVEFORM_BARS.map((bar) => (
      <rect
        key={bar.x}
        x={bar.x}
        y={bar.y}
        width="3"
        height={bar.height}
        rx="1.5"
      >
        {animated && (
          <>
            <animate
              attributeName="y"
              values={bar.yFrames}
              begin={bar.begin}
              dur={bar.duration}
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines="0.33 0 0.67 1;0.33 0 0.67 1"
              repeatCount="indefinite"
            />
            <animate
              attributeName="height"
              values={bar.heightFrames}
              begin={bar.begin}
              dur={bar.duration}
              calcMode="spline"
              keyTimes="0;0.5;1"
              keySplines="0.33 0 0.67 1;0.33 0 0.67 1"
              repeatCount="indefinite"
            />
          </>
        )}
      </rect>
    ))}
  </svg>
);

const AnimatedPlayingWaveform = () => (
  <>
    <PlayingWaveform
      animated
      className="h-3.5 w-7 overflow-visible motion-reduce:hidden"
    />
    <PlayingWaveform
      animated={false}
      className="hidden h-3.5 w-7 motion-reduce:block"
    />
  </>
);

const PlayingIndicator = () => (
  <span
    className="absolute bottom-2 left-2 z-10 flex h-5 w-7.5 items-center justify-center rounded-md bg-[color-mix(in_srgb,var(--accent)_82%,var(--surface)_18%)] text-(--on-accent,#fff) shadow-[0_3px_10px_color-mix(in_srgb,var(--accent-shadow)_72%,transparent)]"
    data-playing-indicator
    aria-hidden="true"
  >
    <AnimatedPlayingWaveform />
  </span>
);

const getSessionDetails = (session: CoursePlayerSession) => {
  const courseTitle = getCourseTitle(session.courseId);
  const lectureTitle =
    lessonsById.get(session.lessonId)?.[1] || `Lecture ${session.lessonId}`;
  const courseSection = sections.find((section) =>
    section.lessons.some(([lessonId]) => lessonId === session.lessonId),
  );
  const sectionLabel = courseSection
    ? `Section ${courseSection.id} · ${lectureTitle}`
    : `L${session.lessonId} · ${lectureTitle}`;
  const progress = 0;
  return { courseTitle, progress, sectionLabel };
};

const LearningSessionItem = memo(function LearningSessionItem({
  session,
  active,
  compact,
  onActivate,
  onClose,
  onMenuOpenChange,
}: LearningSessionItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchorPoint, setMenuAnchorPoint] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [closing, setClosing] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  const gestureRef = useRef<SessionGesture | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  const closeTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const { courseTitle, progress, sectionLabel } = getSessionDetails(session);
  const thumbnail = getCourseThumbnail(session.courseId);

  useEffect(
    () => () => {
      if (longPressTimerRef.current !== null)
        window.clearTimeout(longPressTimerRef.current);
      if (closeTimerRef.current !== null)
        window.clearTimeout(closeTimerRef.current);
    },
    [],
  );

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current === null) return;
    window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = null;
  };

  const setSessionMenuOpen = (open: boolean) => {
    setMenuOpen(open);
    onMenuOpenChange(open);
  };

  const openMenuAt = (x: number, y: number) => {
    setMenuAnchorPoint({ x, y });
    setSessionMenuOpen(true);
  };

  const closeWithAnimation = (direction = 0) => {
    if (closing) return;
    clearLongPressTimer();
    setSessionMenuOpen(false);
    setClosing(true);
    if (direction !== 0) {
      const distance = (itemRef.current?.offsetWidth ?? 320) + 32;
      setSwipeOffset(Math.sign(direction) * distance);
    }
    closeTimerRef.current = window.setTimeout(
      () => onClose(session),
      SESSION_CLOSE_ANIMATION_MS,
    );
  };

  const beginGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      event.button !== 0 ||
      event.pointerType !== "touch" ||
      (event.target as Element).closest("[data-course-menu]")
    )
      return;
    clearLongPressTimer();
    suppressClickRef.current = false;
    gestureRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      currentX: event.clientX,
      swiping: false,
      longPressed: false,
    };
    longPressTimerRef.current = window.setTimeout(() => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture.longPressed = true;
      suppressClickRef.current = true;
      openMenuAt(gesture.startX, gesture.startY);
    }, LONG_PRESS_DURATION_MS);
  };

  const continueGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    gesture.currentX = event.clientX;

    if (Math.hypot(deltaX, deltaY) > 8) clearLongPressTimer();
    if (
      !gesture.swiping &&
      Math.abs(deltaX) > 10 &&
      Math.abs(deltaX) > Math.abs(deltaY) * 1.15
    ) {
      gesture.swiping = true;
      suppressClickRef.current = true;
      event.currentTarget.setPointerCapture?.(event.pointerId);
    }
    if (!gesture.swiping) return;
    event.preventDefault();
    setSwipeOffset(
      Math.max(
        -((itemRef.current?.offsetWidth ?? 320) + 16),
        Math.min((itemRef.current?.offsetWidth ?? 320) + 16, deltaX),
      ),
    );
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    clearLongPressTimer();
    gestureRef.current = null;
    if (gesture.swiping) {
      const deltaX = gesture.currentX - gesture.startX;
      if (Math.abs(deltaX) >= SWIPE_COMMIT_DISTANCE) closeWithAnimation(deltaX);
      else setSwipeOffset(0);
    }
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released after a cancelled gesture.
    }
  };

  const cancelGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    clearLongPressTimer();
    gestureRef.current = null;
    setSwipeOffset(0);
    try {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    } catch {
      // Pointer capture may already be released after a cancelled gesture.
    }
  };

  const openContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    openMenuAt(event.clientX, event.clientY);
  };

  const card = compact ? (
    <article
      className="relative min-w-0"
      aria-label={`${active ? "Currently playing, " : ""}${courseTitle}, ${sectionLabel}, ${progress}% complete`}
      data-learning-session={session.courseId}
      data-active={active ? "true" : "false"}
    >
      <button
        type="button"
        className={[
          "relative block aspect-video w-full min-w-0 overflow-hidden rounded-[10px] bg-(--track) outline-none transition-[background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)",
          active
            ? "bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))] shadow-(--surface-depth-shadow)"
            : "bg-[color-mix(in_srgb,var(--surface-strong)_86%,var(--canvas))] shadow-(--sidebar-menu-depth-shadow)",
        ].join(" ")}
        aria-current={active ? "page" : undefined}
        aria-label={`Open ${courseTitle}, ${sectionLabel}`}
        title={`${courseTitle} — ${sectionLabel}`}
        onClick={() => onActivate(session)}
      >
        <img
          src={thumbnail}
          alt=""
          className="h-full w-full object-cover"
          width={960}
          height={540}
          loading="lazy"
          fetchPriority="low"
          decoding="async"
        />
        {active && <PlayingIndicator />}
      </button>
    </article>
  ) : (
    <article
      className={[
        "group/session relative flex min-h-32 w-full min-w-0 overflow-hidden rounded-[14px] text-left backdrop-blur-xl transition-colors duration-150",
        active
          ? "bg-[color-mix(in_srgb,var(--surface-strong)_84%,var(--canvas))] shadow-(--surface-depth-shadow)"
          : "bg-[color-mix(in_srgb,var(--surface-strong)_86%,var(--canvas))] shadow-(--sidebar-menu-depth-shadow) hover:bg-[color-mix(in_srgb,var(--surface-strong)_92%,var(--canvas))] focus-within:bg-[color-mix(in_srgb,var(--surface-strong)_92%,var(--canvas))]",
      ].join(" ")}
      aria-label={`${active ? "Currently playing, " : ""}${courseTitle}, ${sectionLabel}, ${progress}% complete`}
      data-learning-session={session.courseId}
      data-active={active ? "true" : "false"}
    >
      {active && (
        <span
          aria-hidden="true"
          data-active-session-card-glow
          className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(ellipse_46%_135%_at_38%_50%,color-mix(in_srgb,var(--accent)_40%,transparent)_0%,color-mix(in_srgb,var(--accent)_18%,transparent)_38%,transparent_72%)]"
        />
      )}
      <button
        type="button"
        className="relative z-10 flex min-w-0 flex-1 items-center gap-3 p-2.5 pr-11 text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-(--accent)"
        aria-current={active ? "page" : undefined}
        aria-label={`Open ${courseTitle}, ${sectionLabel}`}
        title={`${courseTitle} — ${sectionLabel}`}
        onClick={() => onActivate(session)}
      >
        <span className="relative w-30 shrink-0 self-center">
          <span className="relative block aspect-4/3 w-30 overflow-hidden rounded-[10px] bg-(--track) shadow-[0_7px_18px_rgb(0_0_0/0.32)]">
            <img
              src={thumbnail}
              alt=""
              className="h-full w-full object-cover"
              width={960}
              height={540}
              loading="lazy"
              fetchPriority="low"
              decoding="async"
            />
            {active && <PlayingIndicator />}
          </span>
        </span>
        <span className="flex min-w-0 flex-1 flex-col justify-center py-0.5">
          <strong
            className="line-clamp-2 pr-1 text-[0.9rem] leading-[1.18rem] font-semibold tracking-[-0.012em] text-(--text)"
            title={courseTitle}
          >
            {courseTitle}
          </strong>
          <small
            className="mt-2 line-clamp-2 text-[calc(0.68rem+1px)] leading-[0.98rem] text-(--muted)"
            title={sectionLabel}
          >
            {sectionLabel}
          </small>
          <span
            className="mt-auto flex items-center gap-2.5 pt-2.5"
            aria-hidden="true"
          >
            <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-(--track)">
              <span
                className="block h-full rounded-full bg-(--accent) transition-[width] duration-200 motion-reduce:transition-none"
                style={{ width: `${progress}%` }}
              />
            </span>
            <span className="w-8 shrink-0 text-right text-[0.68rem] leading-4 font-medium text-(--text-secondary)">
              {progress}%
            </span>
          </span>
        </span>
      </button>
    </article>
  );

  return (
    <div
      ref={itemRef}
      className={[
        "grid min-w-0 touch-pan-y overflow-hidden transition-[grid-template-rows,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        closing ? "grid-rows-[0fr] opacity-0" : "grid-rows-[1fr] opacity-100",
      ].join(" ")}
      style={{ transform: `translateX(${swipeOffset}px)` }}
      role="listitem"
      data-session-closing={closing ? "true" : "false"}
      onClickCapture={(event) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
      }}
      onContextMenu={openContextMenu}
      onPointerDown={beginGesture}
      onPointerMove={continueGesture}
      onPointerUp={finishGesture}
      onPointerCancel={cancelGesture}
    >
      <div className="relative min-h-0 min-w-0 overflow-hidden">
        {card}

        <CourseActionMenu
          open={menuOpen}
          onOpenChange={(open) => {
            if (open) setMenuAnchorPoint(null);
            setSessionMenuOpen(open);
          }}
          anchorPoint={menuAnchorPoint}
          ariaLabel={`More actions for ${courseTitle}`}
          menuLabel={`${courseTitle} session actions`}
          className="absolute top-1 right-1 z-30 shrink-0"
          triggerClassName={compact ? "size-8" : "size-9"}
          menuClassName="border-0! bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] shadow-(--card-floating-shadow) backdrop-blur-2xl"
          dataMenu={`learning-space-${session.courseId}`}
        >
          <MenuAction
            Icon={BookOpen}
            label="Open session"
            onClick={() => {
              setSessionMenuOpen(false);
              onActivate(session);
            }}
          />
          <MenuAction
            Icon={ArrowSquareOut}
            label="Open in new tab"
            onClick={() => {
              setSessionMenuOpen(false);
              openSessionInNewTab(session.path);
            }}
          />
          <MenuAction
            Icon={XCircle}
            label="Close session"
            destructive
            onClick={() => closeWithAnimation()}
          />
        </CourseActionMenu>
      </div>
    </div>
  );
});

interface ResizeHandleProps {
  edge: LearningSpaceResizeEdge;
  active: boolean;
  pinned: boolean;
  width: number;
  onStartResize: LearningSpacePanelProps["onStartResize"];
  onResize: LearningSpacePanelProps["onResize"];
  onFinishResize: LearningSpacePanelProps["onFinishResize"];
  onResizeWithKeyboard: LearningSpacePanelProps["onResizeWithKeyboard"];
}

const ResizeHandle = ({
  edge,
  active,
  pinned,
  width,
  onStartResize,
  onResize,
  onFinishResize,
  onResizeWithKeyboard,
}: ResizeHandleProps) => {
  const currentValue = Math.round(width);
  const placementClass = {
    right: "top-0 right-0 h-full w-3 cursor-ew-resize items-center justify-end",
    left: "top-0 left-0 h-full w-3 cursor-ew-resize items-center justify-start",
  }[edge];
  const lineClass =
    "h-[calc(100%-2rem)] w-0.5 bg-[linear-gradient(180deg,transparent_0%,color-mix(in_srgb,var(--accent)_54%,var(--surface))_16%,color-mix(in_srgb,var(--accent)_54%,var(--surface))_84%,transparent_100%)]";

  return (
    <div
      className={`group/resize absolute z-50 flex touch-none ${placementClass} outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent)`}
      role="separator"
      aria-label={`Resize Learning Space panel from ${edge}`}
      aria-orientation="vertical"
      aria-valuemin={PANEL_MIN_WIDTH}
      aria-valuemax={PANEL_MAX_WIDTH}
      aria-valuenow={currentValue}
      aria-valuetext={`${currentValue} pixels wide`}
      data-resize-edge={edge}
      tabIndex={0}
      title={`Drag the ${edge} edge to resize the ${pinned ? "pinned " : ""}Learning Space.`}
      onPointerDown={(event) => onStartResize(edge, event)}
      onPointerMove={onResize}
      onPointerUp={onFinishResize}
      onPointerCancel={onFinishResize}
      onLostPointerCapture={onFinishResize}
      onKeyDown={(event) => onResizeWithKeyboard(edge, event)}
    >
      <span
        className={`${lineClass} rounded-full transition-opacity duration-150 group-hover/resize:opacity-100 group-focus-visible/resize:opacity-100 ${active ? "opacity-100" : "opacity-0"}`}
        aria-hidden="true"
      />
    </div>
  );
};

export const LearningSpacePanel = memo(function LearningSpacePanel({
  panelId,
  panelRef,
  sessions,
  activeCourseId,
  compact,
  compactColumns,
  mobile,
  moving,
  pinned,
  resizing,
  resizingEdge,
  width,
  style,
  onPinnedChange,
  onDismiss,
  onActivate,
  onClose,
  onPanelPointerEnter,
  onPanelPointerLeave,
  onPanelFocus,
  onPanelBlur,
  onInteractionLockedChange,
  onStartMove,
  onMove,
  onFinishMove,
  onMoveWithKeyboard,
  onStartResize,
  onResize,
  onFinishResize,
  onResizeWithKeyboard,
}: LearningSpacePanelProps) {
  const sessionCountLabel = `${sessions.length} active ${sessions.length === 1 ? "session" : "sessions"}`;

  return (
    <section
      id={panelId}
      ref={panelRef}
      className={[
        "fixed z-[1000] flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[20px] bg-[color-mix(in_srgb,var(--app-shell)_74%,transparent)] text-(--text) shadow-(--sidebar-menu-active-shadow) backdrop-blur-[calc(var(--sidebar-floating-base-blur,6px)+var(--sidebar-backdrop-blur,8px))] backdrop-saturate-[1.2] outline-none",
        mobile ? "max-w-[calc(100dvw-1.5rem)]" : "",
        moving || resizing
          ? "select-none"
          : "transition-[width,max-height,box-shadow] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
      ]
        .filter(Boolean)
        .join(" ")}
      style={style}
      role="region"
      aria-label="Learning Space"
      aria-describedby={`${panelId}-description`}
      tabIndex={-1}
      data-learning-space-panel
      data-compact={compact ? "true" : "false"}
      data-compact-columns={compact ? compactColumns : undefined}
      data-pinned={pinned ? "true" : "false"}
      data-base-ui-swipe-ignore
      data-learning-swipe-ignore
      data-sidebar-swipe-ignore
      data-tab-swipe-ignore
      onPointerDownCapture={(event) =>
        claimPointerGesture({
          owner: "learning-space",
          pointerId: event.pointerId,
        })
      }
      onPointerEnter={onPanelPointerEnter}
      onPointerLeave={onPanelPointerLeave}
      onFocus={onPanelFocus}
      onBlur={onPanelBlur}
    >
      {mobile && (
        <span id={`${panelId}-description`} className="sr-only">
          Learning Space. {sessionCountLabel}
        </span>
      )}

      {!mobile && (
        <header
          className={[
            "flex shrink-0 touch-none cursor-default items-start bg-[color-mix(in_srgb,var(--canvas)_58%,transparent)] pt-3.5 outline-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent)",
            compact
              ? "min-h-11.5 justify-between px-3 pb-0"
              : "min-h-15.5 gap-2.5 px-3 pb-2",
          ].join(" ")}
          aria-label={
            pinned
              ? "Learning Space panel header. Double-click to unpin, drag to move, or hold Alt and use arrow keys for precise movement."
              : "Learning Space panel header. Double-click to pin, or drag to pin and move."
          }
          title={
            pinned
              ? "Double-click to unpin · Drag to move"
              : "Double-click to pin · Drag to pin and move"
          }
          tabIndex={0}
          onPointerDown={onStartMove}
          onPointerMove={onMove}
          onPointerUp={onFinishMove}
          onPointerCancel={onFinishMove}
          onLostPointerCapture={onFinishMove}
          onKeyDown={onMoveWithKeyboard}
          onDoubleClick={(event) => {
            if ((event.target as Element).closest("button")) return;
            event.preventDefault();
            onPinnedChange(!pinned);
          }}
        >
          <span className="flex size-8 shrink-0 items-start justify-center pt-0.5 text-(--accent)">
            <BookOpen size={23} weight="regular" aria-hidden="true" />
          </span>
          {!compact && (
            <span className="min-w-0 flex-1">
              <strong className="block truncate text-[0.94rem] leading-5 font-semibold tracking-[-0.015em]">
                Learning Space
              </strong>
              <small
                id={`${panelId}-description`}
                className="mt-0.5 block truncate text-[0.68rem] leading-3.5 text-(--muted)"
              >
                Your active learning sessions
                <span className="sr-only">. {sessionCountLabel}</span>
              </small>
            </span>
          )}
          {compact && (
            <span id={`${panelId}-description`} className="sr-only">
              Learning Space. {sessionCountLabel}
            </span>
          )}
          <button
            type="button"
            className="flex size-7 shrink-0 items-center justify-center rounded-full bg-transparent text-(--muted) outline-none transition-[color,background-color] duration-150 hover:bg-[color-mix(in_srgb,var(--text)_8%,transparent)] hover:text-(--text) active:bg-[color-mix(in_srgb,var(--text)_14%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)"
            aria-label="Close Learning Space panel"
            title="Close Learning Space"
            onPointerDown={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onDismiss();
            }}
          >
            <X size={15} weight="bold" aria-hidden="true" />
          </button>
        </header>
      )}

      <div
        className={[
          "min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain",
          compact ? "p-2 pr-2.5" : "p-2.5 pr-3",
        ].join(" ")}
      >
        {sessions.length > 0 ? (
          <div
            className={
              compact
                ? `grid min-w-0 content-start gap-2 ${compactColumns === 2 ? "grid-cols-2" : "grid-cols-1"}`
                : "grid min-w-0 content-start gap-2.5"
            }
            role="list"
          >
            {sessions.map((session) => (
              <LearningSessionItem
                key={session.courseId}
                session={session}
                active={activeCourseId === session.courseId}
                compact={compact}
                onActivate={onActivate}
                onClose={onClose}
                onMenuOpenChange={onInteractionLockedChange}
              />
            ))}
          </div>
        ) : (
          <div className="flex min-h-36 flex-col items-center justify-center px-4 text-center">
            <BookOpen
              className="mb-3 text-(--muted)"
              size={28}
              weight="duotone"
              aria-hidden="true"
            />
            {!compact && (
              <p className="max-w-56 text-[0.76rem] leading-5 text-(--muted)">
                Open a course to start a learning session.
              </p>
            )}
            {compact && <span className="sr-only">No active sessions</span>}
          </div>
        )}
      </div>

      {!mobile &&
        (pinned ? (["right", "left"] as const) : (["right"] as const)).map(
          (edge) => (
            <ResizeHandle
              key={edge}
              edge={edge}
              active={resizingEdge === edge}
              pinned={pinned}
              width={width}
              onStartResize={onStartResize}
              onResize={onResize}
              onFinishResize={onFinishResize}
              onResizeWithKeyboard={onResizeWithKeyboard}
            />
          ),
        )}
    </section>
  );
});
