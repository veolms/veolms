import { useCallback, useEffect, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode,
  TransitionEvent as ReactTransitionEvent,
} from "react";
import { claimPointerGesture } from "../gestures/pointerGestureOwnership";

export const FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT = 50;
export const FULLSCREEN_VIDEO_WIDTH_DEFAULT_PERCENT = 60;
export const FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT = 80;

const PANEL_DRAG_ACTIVATION_DISTANCE = 8;
const PANEL_DRAG_DIRECTION_RATIO = 1.15;
const PANEL_DISMISS_FLICK_DISTANCE = 18;
const PANEL_DISMISS_FLICK_VELOCITY = 0.55;
const PANEL_DISMISS_PERCENT = 50;
const PANEL_MOTION_DURATION_MS = 220;

interface FullscreenLandscapeCurriculumPanelProps {
  children: ReactNode;
  onClose: () => void;
  onVideoWidthPercentChange: (percent: number) => void;
  onVideoWidthPreviewChange: (percent: number | null) => void;
  videoWidthPercent: number;
}

interface ResizeSession {
  handle: HTMLDivElement;
  initialVideoWidthPercent: number;
  lastTime: number;
  lastX: number;
  minimumPanelWidth: number;
  pointerId: number;
  shellLeft: number;
  shellWidth: number;
  startTime: number;
  startX: number;
  velocityX: number;
}

interface PanelDragSession {
  active: boolean;
  handle: HTMLDivElement;
  initialVideoWidthPercent: number;
  lastTime: number;
  lastX: number;
  panelWidth: number;
  pointerId: number;
  startTime: number;
  startX: number;
  startY: number;
  velocityX: number;
}

type PanelMotionMode =
  "idle" | "dragging" | "resizing" | "settling" | "dismissing";

const clampVideoWidthPercent = (percent: number) =>
  Math.min(
    FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT,
    Math.max(FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT, percent),
  );

const getEventTime = (event: { timeStamp: number }) =>
  event.timeStamp > 0 ? event.timeStamp : performance.now();

const getResizeDismissPercent = (requestedVideoWidthPercent: number) =>
  Math.min(
    100,
    Math.max(
      0,
      ((requestedVideoWidthPercent - FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT) /
        (100 - FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT)) *
        100,
    ),
  );

const hasDismissIntent = (
  dismissPercent: number,
  dismissDistance: number,
  velocityX: number,
) =>
  dismissPercent >= PANEL_DISMISS_PERCENT ||
  (dismissDistance >= PANEL_DISMISS_FLICK_DISTANCE &&
    velocityX >= PANEL_DISMISS_FLICK_VELOCITY);

export function FullscreenLandscapeCurriculumPanel({
  children,
  onClose,
  onVideoWidthPercentChange,
  onVideoWidthPreviewChange,
  videoWidthPercent,
}: FullscreenLandscapeCurriculumPanelProps) {
  const [motionMode, setMotionMode] = useState<PanelMotionMode>("idle");
  const dismissPendingRef = useRef(false);
  const motionTimerRef = useRef<number | null>(null);
  const panelDragSessionRef = useRef<PanelDragSession | null>(null);
  const resizeSessionRef = useRef<ResizeSession | null>(null);
  const suppressClickRef = useRef(false);
  const suppressClickTimerRef = useRef<number | null>(null);

  const clearMotionTimer = useCallback(() => {
    if (motionTimerRef.current === null) return;
    window.clearTimeout(motionTimerRef.current);
    motionTimerRef.current = null;
  }, []);

  const finishDismiss = useCallback(() => {
    if (!dismissPendingRef.current) return;
    dismissPendingRef.current = false;
    clearMotionTimer();
    onClose();
  }, [clearMotionTimer, onClose]);

  const dismissPanel = useCallback(() => {
    clearMotionTimer();
    dismissPendingRef.current = true;
    onVideoWidthPreviewChange(100);
    setMotionMode("dismissing");
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finishDismiss();
      return;
    }
    motionTimerRef.current = window.setTimeout(
      finishDismiss,
      PANEL_MOTION_DURATION_MS + 80,
    );
  }, [clearMotionTimer, finishDismiss, onVideoWidthPreviewChange]);

  const settlePanel = useCallback(() => {
    clearMotionTimer();
    dismissPendingRef.current = false;
    onVideoWidthPreviewChange(null);
    setMotionMode("settling");
    motionTimerRef.current = window.setTimeout(() => {
      motionTimerRef.current = null;
      setMotionMode("idle");
    }, PANEL_MOTION_DURATION_MS);
  }, [clearMotionTimer, onVideoWidthPreviewChange]);

  useEffect(
    () => () => {
      clearMotionTimer();
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
      onVideoWidthPreviewChange(null);
    },
    [clearMotionTimer, onVideoWidthPreviewChange],
  );

  const scheduleClickRelease = () => {
    if (!suppressClickRef.current) return;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 0);
  };

  const startPanelDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (motionMode === "dismissing") return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest("[data-fullscreen-course-resize], .elastic-scroller")
    ) {
      return;
    }
    const panelBounds = event.currentTarget.getBoundingClientRect();
    if (panelBounds.width <= 0) return;

    clearMotionTimer();
    const timestamp = getEventTime(event);
    panelDragSessionRef.current = {
      active: false,
      handle: event.currentTarget,
      initialVideoWidthPercent: videoWidthPercent,
      lastTime: timestamp,
      lastX: event.clientX,
      panelWidth: panelBounds.width,
      pointerId: event.pointerId,
      startTime: timestamp,
      startX: event.clientX,
      startY: event.clientY,
      velocityX: 0,
    };
  };

  const dragPanel = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panelDragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    const timestamp = getEventTime(event);
    const elapsed = Math.max(1, timestamp - session.lastTime);
    const latestVelocityX = (event.clientX - session.lastX) / elapsed;
    session.velocityX = session.velocityX * 0.35 + latestVelocityX * 0.65;
    session.lastTime = timestamp;
    session.lastX = event.clientX;

    const deltaX = event.clientX - session.startX;
    const deltaY = event.clientY - session.startY;
    if (!session.active) {
      if (
        deltaX < PANEL_DRAG_ACTIVATION_DISTANCE ||
        deltaX < Math.abs(deltaY) * PANEL_DRAG_DIRECTION_RATIO
      ) {
        return;
      }
      session.active = true;
      suppressClickRef.current = true;
      session.handle.setPointerCapture?.(session.pointerId);
      setMotionMode("dragging");
      claimPointerGesture({
        owner: "learning-space",
        pointerId: session.pointerId,
      });
    }

    event.preventDefault();
    event.stopPropagation();
    const dismissPercent = Math.min(
      100,
      Math.max(0, (deltaX / session.panelWidth) * 100),
    );
    onVideoWidthPreviewChange(
      session.initialVideoWidthPercent +
        (100 - session.initialVideoWidthPercent) * (dismissPercent / 100),
    );
  };

  const finishPanelDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const session = panelDragSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    panelDragSessionRef.current = null;
    const deltaX = Math.max(0, event.clientX - session.startX);
    const duration = Math.max(1, getEventTime(event) - session.startTime);
    const velocityX = Math.max(session.velocityX, deltaX / duration);
    const dismissPercent = Math.min(100, (deltaX / session.panelWidth) * 100);

    try {
      if (session.handle.hasPointerCapture?.(session.pointerId)) {
        session.handle.releasePointerCapture?.(session.pointerId);
      }
    } catch {
      // Pointer capture may already be released after a browser gesture cancel.
    }

    if (!session.active) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleClickRelease();
    if (!cancelled && hasDismissIntent(dismissPercent, deltaX, velocityX)) {
      dismissPanel();
      return;
    }
    settlePanel();
  };

  const startResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const shell = event.currentTarget.closest<HTMLElement>(".video-shell");
    const shellBounds = shell?.getBoundingClientRect();
    if (!shellBounds || shellBounds.width <= 0) return;

    event.preventDefault();
    event.stopPropagation();
    claimPointerGesture({
      owner: "learning-space",
      pointerId: event.pointerId,
    });
    clearMotionTimer();
    const timestamp = getEventTime(event);
    resizeSessionRef.current = {
      handle: event.currentTarget,
      initialVideoWidthPercent: videoWidthPercent,
      lastTime: timestamp,
      lastX: event.clientX,
      minimumPanelWidth:
        shellBounds.width * ((100 - FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT) / 100),
      pointerId: event.pointerId,
      shellLeft: shellBounds.left,
      shellWidth: shellBounds.width,
      startTime: timestamp,
      startX: event.clientX,
      velocityX: 0,
    };
    setMotionMode("resizing");
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const resize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    const timestamp = getEventTime(event);
    const elapsed = Math.max(1, timestamp - session.lastTime);
    const latestVelocityX = (event.clientX - session.lastX) / elapsed;
    session.velocityX = session.velocityX * 0.35 + latestVelocityX * 0.65;
    session.lastTime = timestamp;
    session.lastX = event.clientX;
    const requestedVideoWidthPercent =
      ((event.clientX - session.shellLeft) / session.shellWidth) * 100;
    onVideoWidthPercentChange(
      clampVideoWidthPercent(requestedVideoWidthPercent),
    );
    onVideoWidthPreviewChange(
      Math.min(
        100,
        Math.max(
          FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT,
          requestedVideoWidthPercent,
        ),
      ),
    );
  };

  const finishResize = (
    event: ReactPointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const session = resizeSessionRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    resizeSessionRef.current = null;
    event.preventDefault();
    event.stopPropagation();
    const requestedVideoWidthPercent =
      ((event.clientX - session.shellLeft) / session.shellWidth) * 100;
    const dismissPercent = getResizeDismissPercent(requestedVideoWidthPercent);
    const dismissDistance = (dismissPercent / 100) * session.minimumPanelWidth;
    const duration = Math.max(1, getEventTime(event) - session.startTime);
    const velocityX = Math.max(
      session.velocityX,
      (event.clientX - session.startX) / duration,
    );
    try {
      session.handle.releasePointerCapture?.(session.pointerId);
    } catch {
      // Pointer capture may already be released after a browser gesture cancel.
    }
    if (cancelled) {
      onVideoWidthPercentChange(session.initialVideoWidthPercent);
      settlePanel();
      return;
    }
    onVideoWidthPercentChange(
      clampVideoWidthPercent(requestedVideoWidthPercent),
    );
    if (hasDismissIntent(dismissPercent, dismissDistance, velocityX)) {
      dismissPanel();
      return;
    }
    settlePanel();
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault();
      if (
        event.key === "ArrowRight" &&
        videoWidthPercent >= FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT
      ) {
        dismissPanel();
        return;
      }
      onVideoWidthPercentChange(
        clampVideoWidthPercent(
          videoWidthPercent + (event.key === "ArrowRight" ? 5 : -5),
        ),
      );
    } else if (event.key === "Home") {
      event.preventDefault();
      onVideoWidthPercentChange(FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT);
    } else if (event.key === "End") {
      event.preventDefault();
      onVideoWidthPercentChange(FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT);
    }
  };

  const contentWidthPercent = 100 - videoWidthPercent;

  return (
    <div
      className={`relative z-20 h-full min-w-0 flex-1 touch-pan-y overflow-hidden border-l border-[color-mix(in_srgb,var(--text)_12%,transparent)] bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))] text-(--text) shadow-[-18px_0_40px_rgba(0,0,0,0.2)] will-change-transform [&_.learning-curriculum]:h-full [&_.learning-curriculum]:rounded-none [&_.learning-curriculum]:bg-[color-mix(in_srgb,var(--surface)_91%,var(--canvas))] [&_.learning-curriculum]:shadow-none ${motionMode === "settling" || motionMode === "dismissing" ? "transition-transform duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none" : "transition-none"}`}
      style={{
        transform:
          "translate3d(var(--learning-fullscreen-panel-offset-x, 0px), 0, 0)",
      }}
      data-learning-fullscreen-course-panel=""
      data-learning-swipe-ignore=""
      data-player-fullscreen-swipe-ignore=""
      data-fullscreen-course-panel-motion={motionMode}
      data-video-width-percent={Math.round(videoWidthPercent)}
      onClickCapture={(event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) return;
        event.preventDefault();
        event.stopPropagation();
        suppressClickRef.current = false;
        if (suppressClickTimerRef.current !== null) {
          window.clearTimeout(suppressClickTimerRef.current);
          suppressClickTimerRef.current = null;
        }
      }}
      onPointerCancelCapture={(event) => finishPanelDrag(event, true)}
      onPointerDownCapture={startPanelDrag}
      onPointerMoveCapture={dragPanel}
      onPointerUpCapture={finishPanelDrag}
      onTransitionEnd={(event: ReactTransitionEvent<HTMLDivElement>) => {
        if (
          event.target !== event.currentTarget ||
          event.propertyName !== "transform"
        ) {
          return;
        }
        if (motionMode === "dismissing") {
          finishDismiss();
        } else if (motionMode === "settling") {
          clearMotionTimer();
          setMotionMode("idle");
        }
      }}
    >
      <div
        className="group/resize absolute inset-y-0 left-0 z-50 flex w-16 -translate-x-1/2 cursor-ew-resize touch-none items-center justify-center focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--accent)"
        role="separator"
        aria-label="Resize fullscreen course content"
        aria-orientation="vertical"
        aria-valuemin={FULLSCREEN_VIDEO_WIDTH_MIN_PERCENT}
        aria-valuemax={FULLSCREEN_VIDEO_WIDTH_MAX_PERCENT}
        aria-valuenow={Math.round(videoWidthPercent)}
        aria-valuetext={`${Math.round(videoWidthPercent)} percent video, ${Math.round(contentWidthPercent)} percent course content`}
        data-learning-swipe-ignore=""
        data-fullscreen-course-resize=""
        tabIndex={0}
        onKeyDown={handleResizeKeyDown}
        onPointerCancel={(event) => finishResize(event, true)}
        onPointerDown={startResize}
        onPointerMove={resize}
        onPointerUp={finishResize}
      >
        <span
          aria-hidden="true"
          className="h-[calc(100%-28px)] w-0.5 rounded-full bg-[linear-gradient(180deg,transparent,color-mix(in_srgb,var(--accent)_64%,var(--border))_16%,color-mix(in_srgb,var(--accent)_64%,var(--border))_84%,transparent)] opacity-80 shadow-[0_0_0_transparent] transition-[width,opacity,box-shadow] duration-160 group-hover/resize:w-0.75 group-hover/resize:opacity-100 group-hover/resize:shadow-[0_0_14px_color-mix(in_srgb,var(--accent)_42%,transparent)] group-focus-visible/resize:w-0.75 group-focus-visible/resize:opacity-100"
        />
      </div>
      <div className="h-full min-h-0 overflow-hidden">{children}</div>
    </div>
  );
}
