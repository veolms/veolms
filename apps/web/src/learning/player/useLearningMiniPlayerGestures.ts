import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  LEARNING_MINI_PLAYER_ASPECT_RATIO as MINI_PLAYER_ASPECT_RATIO,
  LEARNING_MINI_PLAYER_MARGIN as MINI_PLAYER_MARGIN,
  clampLearningPlayerValue as clamp,
  clearLearningPlayerMinimizeMotionStyles,
  getDefaultLearningMiniPlayerLayout,
  getLearningMiniPlayerBottomEdge as getSettledBottomEdge,
  getLearningMiniPlayerWidthBounds as getWidthBounds,
  getLearningPlayerViewportBounds as getViewportBounds,
  type LearningMiniPlayerLayout as MiniPlayerLayout,
  type LearningPlayerViewportBounds as ViewportBounds,
} from "./learningPlayerMotion";

const DRAG_START_DISTANCE = 6;
const DISMISS_DISTANCE = 56;
const DISMISS_VELOCITY = 0.45;
const DISMISS_DURATION = 200;
const SETTLE_DURATION = 240;

interface PointerSample {
  id: number;
  time: number;
  x: number;
  y: number;
}

interface SinglePointerGesture {
  initialLayout: MiniPlayerLayout;
  last: PointerSample;
  pointerId: number;
  restoreOnRelease: boolean;
  start: PointerSample;
  startedAtBottom: boolean;
  velocityY: number;
}

interface PinchGesture {
  anchorX: number;
  anchorY: number;
  initialDistance: number;
  initialWidth: number;
}

type MiniPlayerGestureMode =
  "idle" | "dragging" | "resizing" | "settling" | "dismissing";

const clampLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
): MiniPlayerLayout => {
  const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const height = width / MINI_PLAYER_ASPECT_RATIO;
  const minimumLeft = viewport.left + MINI_PLAYER_MARGIN;
  const maximumLeft = Math.max(
    minimumLeft,
    viewport.left + viewport.width - MINI_PLAYER_MARGIN - width,
  );
  const minimumTop = viewport.top + MINI_PLAYER_MARGIN;
  const maximumTop = Math.max(
    minimumTop,
    getSettledBottomEdge(viewport) - height,
  );

  return {
    left: clamp(layout.left, minimumLeft, maximumLeft),
    top: clamp(layout.top, minimumTop, maximumTop),
    width,
  };
};

const getNearestCornerLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
): MiniPlayerLayout => {
  const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const height = width / MINI_PLAYER_ASPECT_RATIO;
  const minimumLeft = viewport.left + MINI_PLAYER_MARGIN;
  const maximumLeft = Math.max(
    minimumLeft,
    viewport.left + viewport.width - MINI_PLAYER_MARGIN - width,
  );
  const minimumTop = viewport.top + MINI_PLAYER_MARGIN;
  const maximumTop = Math.max(
    minimumTop,
    getSettledBottomEdge(viewport) - height,
  );

  return {
    left:
      Math.abs(layout.left - minimumLeft) <= Math.abs(layout.left - maximumLeft)
        ? minimumLeft
        : maximumLeft,
    top:
      Math.abs(layout.top - minimumTop) <= Math.abs(layout.top - maximumTop)
        ? minimumTop
        : maximumTop,
    width,
  };
};

const getDownmostLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
): MiniPlayerLayout => {
  const settledLayout = clampLayout(layout, viewport);
  const height = settledLayout.width / MINI_PLAYER_ASPECT_RATIO;
  return {
    ...settledLayout,
    top: Math.max(
      viewport.top + MINI_PLAYER_MARGIN,
      getSettledBottomEdge(viewport) - height,
    ),
  };
};

const isAtDownmostPosition = (layout: MiniPlayerLayout) => {
  const downmostLayout = getDownmostLayout(layout);
  return (
    Math.abs(layout.top - downmostLayout.top) <= 1 &&
    Math.abs(layout.width - downmostLayout.width) <= 1
  );
};

const distanceBetween = (first: PointerSample, second: PointerSample) =>
  Math.hypot(second.x - first.x, second.y - first.y);

const midpointBetween = (first: PointerSample, second: PointerSample) => ({
  x: (first.x + second.x) / 2,
  y: (first.y + second.y) / 2,
});

const getEventSample = (
  event: ReactPointerEvent<HTMLElement>,
): PointerSample => ({
  id: event.pointerId,
  time: event.timeStamp > 0 ? event.timeStamp : performance.now(),
  x: event.clientX,
  y: event.clientY,
});

export function useLearningMiniPlayerGestures(
  containerRef: RefObject<HTMLElement | null>,
  onDismiss: () => void,
  enabled = true,
  onRestoreTap?: () => void,
) {
  const [layout, setLayout] = useState<MiniPlayerLayout | null>(null);
  const [mode, setMode] = useState<MiniPlayerGestureMode>("idle");
  const [dismissDistance, setDismissDistance] = useState(0);
  const layoutRef = useRef<MiniPlayerLayout | null>(null);
  const modeRef = useRef<MiniPlayerGestureMode>("idle");
  const pointersRef = useRef(new Map<number, PointerSample>());
  const singleGestureRef = useRef<SinglePointerGesture | null>(null);
  const pinchGestureRef = useRef<PinchGesture | null>(null);
  const suppressClickRef = useRef(false);
  const needsSettleRef = useRef(false);
  const settleCandidateRef = useRef<MiniPlayerLayout | null>(null);
  const suppressClickTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const onRestoreTapRef = useRef(onRestoreTap);
  onRestoreTapRef.current = onRestoreTap;

  const updateMode = useCallback((nextMode: MiniPlayerGestureMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const commitLayout = useCallback((nextLayout: MiniPlayerLayout) => {
    const cornerLayout = getNearestCornerLayout(nextLayout);
    layoutRef.current = cornerLayout;
    setLayout(cornerLayout);
    return cornerLayout;
  }, []);

  const showLiveLayout = useCallback((nextLayout: MiniPlayerLayout) => {
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    return nextLayout;
  }, []);

  const settleLayout = useCallback(
    (nextLayout: MiniPlayerLayout) => {
      const settledLayout = getNearestCornerLayout(nextLayout);
      const visibleLayout = layoutRef.current ?? nextLayout;
      const shouldAnimate =
        Math.abs(settledLayout.left - visibleLayout.left) > 0.5 ||
        Math.abs(settledLayout.top - visibleLayout.top) > 0.5 ||
        Math.abs(settledLayout.width - visibleLayout.width) > 0.5;

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      showLiveLayout(settledLayout);
      needsSettleRef.current = false;
      settleCandidateRef.current = null;

      if (
        shouldAnimate &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        updateMode("settling");
        settleTimerRef.current = window.setTimeout(() => {
          settleTimerRef.current = null;
          updateMode("idle");
        }, SETTLE_DURATION);
      } else {
        updateMode("idle");
      }
      return settledLayout;
    },
    [showLiveLayout, updateMode],
  );

  const measureLayout = useCallback(() => {
    if (layoutRef.current) return layoutRef.current;

    const fallback = getDefaultLearningMiniPlayerLayout();
    const container = containerRef.current;
    if (container?.dataset.learningPlayerMotionPhase) {
      clearLearningPlayerMinimizeMotionStyles(container);
    }
    const rect = container?.getBoundingClientRect();
    return commitLayout(
      rect && rect.width > 0
        ? { left: rect.left, top: rect.top, width: rect.width }
        : fallback,
    );
  }, [commitLayout, containerRef]);

  useLayoutEffect(() => {
    if (enabled) {
      measureLayout();
      return;
    }

    layoutRef.current = null;
    setLayout(null);
    modeRef.current = "idle";
    setMode("idle");
    setDismissDistance(0);
    pointersRef.current.clear();
    singleGestureRef.current = null;
    pinchGestureRef.current = null;
    suppressClickRef.current = false;
    needsSettleRef.current = false;
    settleCandidateRef.current = null;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
      suppressClickTimerRef.current = null;
    }
    if (dismissTimerRef.current !== null) {
      window.clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
  }, [enabled, measureLayout]);

  useEffect(() => {
    if (!enabled) return undefined;
    const handleViewportResize = () => {
      if (layoutRef.current) commitLayout(layoutRef.current);
    };
    const viewport = window.visualViewport;
    window.addEventListener("resize", handleViewportResize);
    viewport?.addEventListener("resize", handleViewportResize);
    viewport?.addEventListener("scroll", handleViewportResize);
    return () => {
      window.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("resize", handleViewportResize);
      viewport?.removeEventListener("scroll", handleViewportResize);
    };
  }, [commitLayout, enabled]);

  useEffect(
    () => () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
    },
    [],
  );

  const startSingleGesture = useCallback(
    (sample: PointerSample, restoreOnRelease = false) => {
      const initialLayout = measureLayout();
      singleGestureRef.current = {
        initialLayout,
        last: sample,
        pointerId: sample.id,
        restoreOnRelease,
        start: sample,
        startedAtBottom: isAtDownmostPosition(initialLayout),
        velocityY: 0,
      };
    },
    [measureLayout],
  );

  const startPinchGesture = useCallback(() => {
    const [first, second] = Array.from(pointersRef.current.values());
    if (!first || !second) return;
    const currentLayout = measureLayout();
    const midpoint = midpointBetween(first, second);
    const height = currentLayout.width / MINI_PLAYER_ASPECT_RATIO;
    pinchGestureRef.current = {
      anchorX: clamp(
        (midpoint.x - currentLayout.left) / currentLayout.width,
        0,
        1,
      ),
      anchorY: clamp((midpoint.y - currentLayout.top) / height, 0, 1),
      initialDistance: Math.max(1, distanceBetween(first, second)),
      initialWidth: currentLayout.width,
    };
    singleGestureRef.current = null;
    suppressClickRef.current = true;
    needsSettleRef.current = true;
    settleCandidateRef.current = currentLayout;
    updateMode("resizing");
  }, [measureLayout, updateMode]);

  const scheduleClickRelease = useCallback(() => {
    if (!suppressClickRef.current) return;
    if (suppressClickTimerRef.current !== null) {
      window.clearTimeout(suppressClickTimerRef.current);
    }
    suppressClickTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      suppressClickTimerRef.current = null;
    }, 0);
  }, []);

  const dismiss = useCallback(() => {
    const currentLayout = measureLayout();
    const viewport = getViewportBounds();
    setDismissDistance(
      viewport.top + viewport.height - currentLayout.top + MINI_PLAYER_MARGIN,
    );
    updateMode("dismissing");
    dismissTimerRef.current = window.setTimeout(onDismiss, DISMISS_DURATION);
  }, [measureLayout, onDismiss, updateMode]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (modeRef.current === "dismissing") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (modeRef.current === "settling") {
        const visibleRect = containerRef.current?.getBoundingClientRect();
        if (visibleRect && visibleRect.width > 0) {
          showLiveLayout({
            left: visibleRect.left,
            top: visibleRect.top,
            width: visibleRect.width,
          });
        }
        updateMode("idle");
      }

      const sample = getEventSample(event);
      pointersRef.current.set(event.pointerId, sample);
      if (pointersRef.current.size >= 2) {
        for (const pointerId of pointersRef.current.keys()) {
          try {
            event.currentTarget.setPointerCapture(pointerId);
          } catch {
            // Capture is an enhancement; document-level pointer delivery remains usable.
          }
        }
        startPinchGesture();
      } else {
        const restoreTarget =
          event.target instanceof Element &&
          event.target.closest("[data-learning-mini-player-restore]") !== null;
        startSingleGesture(sample, restoreTarget);
      }
    },
    [
      containerRef,
      enabled,
      showLiveLayout,
      startPinchGesture,
      startSingleGesture,
      updateMode,
    ],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!enabled) return;
      if (!pointersRef.current.has(event.pointerId)) return;
      const sample = getEventSample(event);
      pointersRef.current.set(event.pointerId, sample);

      if (pointersRef.current.size >= 2) {
        event.preventDefault();
        if (!pinchGestureRef.current) startPinchGesture();
        const pinch = pinchGestureRef.current;
        const [first, second] = Array.from(pointersRef.current.values());
        if (!pinch || !first || !second) return;

        const scale = distanceBetween(first, second) / pinch.initialDistance;
        const viewport = getViewportBounds();
        const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
        const width = Math.max(minimumWidth, pinch.initialWidth * scale);
        const height = width / MINI_PLAYER_ASPECT_RATIO;
        const midpoint = midpointBetween(first, second);
        const settledWidth = Math.min(width, maximumWidth);
        settleCandidateRef.current = {
          left: midpoint.x - pinch.anchorX * settledWidth,
          top:
            midpoint.y -
            pinch.anchorY * (settledWidth / MINI_PLAYER_ASPECT_RATIO),
          width: settledWidth,
        };
        showLiveLayout({
          left: midpoint.x - pinch.anchorX * width,
          top: midpoint.y - pinch.anchorY * height,
          width,
        });
        return;
      }

      const single = singleGestureRef.current;
      if (!single || single.pointerId !== event.pointerId) {
        startSingleGesture(sample, false);
        return;
      }

      const deltaX = sample.x - single.start.x;
      const deltaY = sample.y - single.start.y;
      const elapsedSinceLast = Math.max(1, sample.time - single.last.time);
      const latestVelocityY = (sample.y - single.last.y) / elapsedSinceLast;
      single.velocityY = single.velocityY * 0.35 + latestVelocityY * 0.65;
      single.last = sample;

      if (
        modeRef.current !== "dragging" &&
        Math.hypot(deltaX, deltaY) < DRAG_START_DISTANCE
      ) {
        return;
      }

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Capture after the drag threshold so stationary taps keep their button target.
      }
      event.preventDefault();
      suppressClickRef.current = true;
      needsSettleRef.current = true;
      updateMode("dragging");
      const nextLayout = {
        left: single.initialLayout.left + deltaX,
        top: single.initialLayout.top + deltaY,
        width: single.initialLayout.width,
      };
      settleCandidateRef.current = nextLayout;
      showLiveLayout(nextLayout);
    },
    [
      enabled,
      showLiveLayout,
      startPinchGesture,
      startSingleGesture,
      updateMode,
    ],
  );

  const finishPointer = useCallback(
    (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
      if (!pointersRef.current.has(event.pointerId)) return;
      const sample = getEventSample(event);
      pointersRef.current.set(event.pointerId, sample);
      const single = singleGestureRef.current;
      const wasPinching = pinchGestureRef.current !== null;
      const wasDragging =
        modeRef.current === "dragging" && single?.pointerId === event.pointerId;
      const shouldRestoreFromDirectTap =
        !cancelled &&
        !wasPinching &&
        !wasDragging &&
        single?.pointerId === event.pointerId &&
        single.restoreOnRelease &&
        (event.pointerType === "touch" || event.pointerType === "pen");

      if (wasDragging && single) {
        const deltaX = sample.x - single.start.x;
        const deltaY = sample.y - single.start.y;
        const duration = Math.max(1, sample.time - single.start.time);
        const velocityY = Math.max(single.velocityY, deltaY / duration);
        const nextLayout = {
          left: single.initialLayout.left + deltaX,
          top: single.initialLayout.top + deltaY,
          width: single.initialLayout.width,
        };
        settleCandidateRef.current = nextLayout;
        showLiveLayout(nextLayout);

        const directPointer =
          event.pointerType === "touch" || event.pointerType === "pen";
        const downwardSwipe =
          !cancelled &&
          directPointer &&
          Math.abs(deltaX) <= deltaY * 1.25 + 32 &&
          (deltaY >= DISMISS_DISTANCE ||
            (deltaY >= DRAG_START_DISTANCE && velocityY >= DISMISS_VELOCITY));
        if (downwardSwipe) {
          if (single.startedAtBottom) {
            pointersRef.current.clear();
            singleGestureRef.current = null;
            pinchGestureRef.current = null;
            settleCandidateRef.current = null;
            dismiss();
            return;
          }
          settleCandidateRef.current = getDownmostLayout(nextLayout);
        }
      }

      if (shouldRestoreFromDirectTap) {
        event.preventDefault();
        event.stopPropagation();
        pointersRef.current.clear();
        singleGestureRef.current = null;
        pinchGestureRef.current = null;
        needsSettleRef.current = false;
        settleCandidateRef.current = null;
        suppressClickRef.current = true;
        updateMode("idle");
        scheduleClickRelease();
        onRestoreTapRef.current?.();
        return;
      }

      pointersRef.current.delete(event.pointerId);
      try {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      } catch {
        // Browsers can release capture automatically before pointer cancellation.
      }

      if (wasPinching && pointersRef.current.size === 1) {
        pinchGestureRef.current = null;
        const remaining = Array.from(pointersRef.current.values())[0];
        if (remaining) startSingleGesture(remaining, false);
        updateMode("idle");
        return;
      }

      if (pointersRef.current.size === 0) {
        singleGestureRef.current = null;
        pinchGestureRef.current = null;
        const currentLayout = layoutRef.current;
        if (needsSettleRef.current && currentLayout) {
          settleLayout(settleCandidateRef.current ?? currentLayout);
        } else {
          updateMode("idle");
        }
        scheduleClickRelease();
      }
    },
    [
      dismiss,
      scheduleClickRelease,
      settleLayout,
      showLiveLayout,
      startSingleGesture,
      updateMode,
    ],
  );

  const handlePointerUp = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finishPointer(event, false),
    [finishPointer],
  );
  const handlePointerCancel = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => finishPointer(event, true),
    [finishPointer],
  );
  const handleClickCapture = useCallback(
    (event: ReactMouseEvent<HTMLElement>) => {
      if (!suppressClickRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
        suppressClickTimerRef.current = null;
      }
    },
    [],
  );

  const visibleLayout =
    layout ?? (enabled ? getDefaultLearningMiniPlayerLayout() : null);
  const style: CSSProperties = visibleLayout
    ? {
        bottom: "auto",
        left: visibleLayout.left,
        right: "auto",
        top: visibleLayout.top,
        width: visibleLayout.width,
        ...(mode === "settling"
          ? {
              transition:
                "left 240ms cubic-bezier(0.16, 1, 0.3, 1), top 240ms cubic-bezier(0.16, 1, 0.3, 1), width 240ms cubic-bezier(0.16, 1, 0.3, 1)",
            }
          : undefined),
        ...(mode === "dismissing"
          ? {
              opacity: 0,
              transform: `translate3d(0, ${dismissDistance}px, 0)`,
            }
          : undefined),
      }
    : {};

  return {
    mode,
    style,
    gestureProps: {
      onClickCapture: handleClickCapture,
      onPointerCancelCapture: handlePointerCancel,
      onPointerDownCapture: handlePointerDown,
      onPointerMoveCapture: handlePointerMove,
      onPointerUpCapture: handlePointerUp,
    },
  };
}
