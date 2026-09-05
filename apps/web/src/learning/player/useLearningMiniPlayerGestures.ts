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
  getLearningMiniPlayerHeight,
  getLearningMiniPlayerPointerResizeLayout,
  getLearningMiniPlayerWidthBounds as getWidthBounds,
  getLearningMiniPlayerPlaylistHeight as getPlaylistHeight,
  getLearningPlayerViewportBounds as getViewportBounds,
  isDesktopLearningMinimizeViewport,
  type LearningMiniPlayerLayout as MiniPlayerLayout,
  type LearningMiniPlayerResizeEdges,
  type LearningPlayerViewportBounds as ViewportBounds,
} from "./learningPlayerMotion";
import {
  readMiniPlayerWidthPreference,
  writeMiniPlayerWidthPreference,
} from "./lessonPlayerPersistence";

const DRAG_START_DISTANCE = 6;
const DOCK_FLICK_AXIS_RATIO = 0.6;
const DOCK_FLICK_MIN_DISTANCE = 18;
const DOCK_FLICK_VELOCITY = 0.5;
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
  resizeEdges: LearningMiniPlayerResizeEdges | null;
  restoreOnRelease: boolean;
  start: PointerSample;
  startedAtBottom: boolean;
  velocityX: number;
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
  isExpanded = false,
): MiniPlayerLayout => {
  const isDesktop = isDesktopLearningMinimizeViewport();
  const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const playlistHeight = getPlaylistHeight(layout);
  const height = getLearningMiniPlayerHeight(
    width,
    isDesktop,
    isExpanded,
    playlistHeight,
  );
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
    playlistHeight,
    top: clamp(layout.top, minimumTop, maximumTop),
    width,
  };
};

const getNearestCornerLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
  isExpanded = false,
): MiniPlayerLayout => {
  const isDesktop = isDesktopLearningMinimizeViewport();
  const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const playlistHeight = getPlaylistHeight(layout);
  const height = getLearningMiniPlayerHeight(
    width,
    isDesktop,
    isExpanded,
    playlistHeight,
  );
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
    playlistHeight,
    top:
      Math.abs(layout.top - minimumTop) <= Math.abs(layout.top - maximumTop)
        ? minimumTop
        : maximumTop,
    width,
  };
};

const getFlickDirectedCornerLayout = (
  layout: MiniPlayerLayout,
  deltaX: number,
  deltaY: number,
  velocityX: number,
  velocityY: number,
  viewport = getViewportBounds(),
  isExpanded = false,
): MiniPlayerLayout => {
  const nearestCorner = getNearestCornerLayout(layout, viewport, isExpanded);
  const peakVelocity = Math.max(Math.abs(velocityX), Math.abs(velocityY));
  if (peakVelocity < DOCK_FLICK_VELOCITY) return nearestCorner;

  const isDesktop = isDesktopLearningMinimizeViewport();
  const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
  const width = clamp(layout.width, minimumWidth, maximumWidth);
  const playlistHeight = getPlaylistHeight(layout);
  const height = getLearningMiniPlayerHeight(
    width,
    isDesktop,
    isExpanded,
    playlistHeight,
  );
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
  const horizontalFlick =
    Math.abs(deltaX) >= DOCK_FLICK_MIN_DISTANCE &&
    Math.abs(velocityX) >= DOCK_FLICK_VELOCITY &&
    Math.abs(velocityX) >= peakVelocity * DOCK_FLICK_AXIS_RATIO;
  const verticalFlick =
    Math.abs(deltaY) >= DOCK_FLICK_MIN_DISTANCE &&
    Math.abs(velocityY) >= DOCK_FLICK_VELOCITY &&
    Math.abs(velocityY) >= peakVelocity * DOCK_FLICK_AXIS_RATIO;

  return {
    left: horizontalFlick
      ? velocityX < 0
        ? minimumLeft
        : maximumLeft
      : nearestCorner.left,
    playlistHeight,
    top: verticalFlick
      ? velocityY < 0
        ? minimumTop
        : maximumTop
      : nearestCorner.top,
    width,
  };
};

const getReleaseVelocity = (recent: number, average: number) =>
  Math.abs(recent) >= DOCK_FLICK_VELOCITY ? recent : average;

const getDownmostLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
  isExpanded = false,
): MiniPlayerLayout => {
  const settledLayout = clampLayout(layout, viewport, isExpanded);
  const isDesktop = isDesktopLearningMinimizeViewport();
  const height = getLearningMiniPlayerHeight(
    settledLayout.width,
    isDesktop,
    isExpanded,
    getPlaylistHeight(settledLayout),
  );
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
  isExpanded = false,
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
  const resizedDuringGestureRef = useRef(false);
  const preferredWidthRef = useRef<number | null | undefined>(undefined);
  const suppressClickTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const onRestoreTapRef = useRef(onRestoreTap);
  onRestoreTapRef.current = onRestoreTap;
  if (preferredWidthRef.current === undefined) {
    preferredWidthRef.current = readMiniPlayerWidthPreference();
  }

  const getInitialLayout = useCallback(
    () =>
      getDefaultLearningMiniPlayerLayout(
        Number.POSITIVE_INFINITY,
        undefined,
        preferredWidthRef.current ?? undefined,
      ),
    [],
  );

  const updateMode = useCallback((nextMode: MiniPlayerGestureMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!enabled || !container || typeof container.showPopover !== "function") {
      return undefined;
    }

    const openPopover = () => {
      try {
        if (container.getAttribute("popover") !== "manual") {
          container.setAttribute("popover", "manual");
        }
        container.showPopover();
      } catch {
        // Presentation changes can leave the same player open in the top layer.
      }
    };

    const restackPopoverAboveFullscreen = () => {
      // Document fullscreen promotes <html> into the top layer, which covers
      // an already-open popover. Close and reopen to restack above it.
      try {
        container.hidePopover();
      } catch {
        // Already closed, or the popover attribute was removed.
      }
      openPopover();
    };

    openPopover();
    document.addEventListener("fullscreenchange", restackPopoverAboveFullscreen);
    document.addEventListener(
      "webkitfullscreenchange",
      restackPopoverAboveFullscreen,
    );

    return () => {
      document.removeEventListener(
        "fullscreenchange",
        restackPopoverAboveFullscreen,
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        restackPopoverAboveFullscreen,
      );
      if (typeof container.hidePopover !== "function") return;
      try {
        container.hidePopover();
      } catch {
        // Removing the popover attribute can close it before effect cleanup.
      }
    };
  }, [containerRef, enabled]);

  const commitLayout = useCallback(
    (nextLayout: MiniPlayerLayout) => {
      const isDesktop = isDesktopLearningMinimizeViewport();
      const targetLayout = isDesktop
        ? clampLayout(nextLayout, undefined, isExpanded)
        : getNearestCornerLayout(nextLayout, undefined, isExpanded);
      layoutRef.current = targetLayout;
      setLayout(targetLayout);
      return targetLayout;
    },
    [isExpanded],
  );

  const showLiveLayout = useCallback((nextLayout: MiniPlayerLayout) => {
    layoutRef.current = nextLayout;
    setLayout(nextLayout);
    return nextLayout;
  }, []);

  const settleLayout = useCallback(
    (nextLayout: MiniPlayerLayout) => {
      const isDesktop = isDesktopLearningMinimizeViewport();
      const settledLayout = isDesktop
        ? clampLayout(nextLayout, undefined, isExpanded)
        : getNearestCornerLayout(nextLayout, undefined, isExpanded);
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
    [isExpanded, showLiveLayout, updateMode],
  );

  const measureLayout = useCallback(() => {
    if (layoutRef.current) return layoutRef.current;

    const fallback = getInitialLayout();
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
  }, [commitLayout, containerRef, getInitialLayout]);

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
    resizedDuringGestureRef.current = false;
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

  const isExpandedRef = useRef(isExpanded);
  useEffect(() => {
    if (!enabled || !isDesktopLearningMinimizeViewport()) return;
    if (isExpandedRef.current === isExpanded) return;
    const wasExpanded = isExpandedRef.current;
    isExpandedRef.current = isExpanded;

    const currentLayout = layoutRef.current;
    if (!currentLayout) return;

    const viewport = getViewportBounds();
    const isDesktop = isDesktopLearningMinimizeViewport();
    const settledBottom = getSettledBottomEdge(viewport);
    const oldHeight = getLearningMiniPlayerHeight(
      currentLayout.width,
      isDesktop,
      wasExpanded,
      getPlaylistHeight(currentLayout),
    );
    const newHeight = getLearningMiniPlayerHeight(
      currentLayout.width,
      isDesktop,
      isExpanded,
      getPlaylistHeight(currentLayout),
    );

    const wasAnchoredToBottom =
      Math.abs(currentLayout.top + oldHeight - settledBottom) <= 8;

    let targetTop = currentLayout.top;
    if (isExpanded) {
      const maxTop = Math.max(
        viewport.top + MINI_PLAYER_MARGIN,
        settledBottom - newHeight,
      );
      targetTop = Math.min(targetTop, maxTop);
    } else if (wasAnchoredToBottom) {
      targetTop = Math.max(
        viewport.top + MINI_PLAYER_MARGIN,
        settledBottom - newHeight,
      );
    }

    const nextLayout: MiniPlayerLayout = {
      ...currentLayout,
      top: targetTop,
    };
    settleLayout(nextLayout);
  }, [enabled, isExpanded, settleLayout]);

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
    (
      sample: PointerSample,
      restoreOnRelease = false,
      resizeEdges: LearningMiniPlayerResizeEdges | null = null,
    ) => {
      const initialLayout = measureLayout();
      singleGestureRef.current = {
        initialLayout,
        last: sample,
        pointerId: sample.id,
        resizeEdges,
        restoreOnRelease,
        start: sample,
        startedAtBottom: isAtDownmostPosition(initialLayout),
        velocityX: 0,
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
    const isDesktop = isDesktopLearningMinimizeViewport();
    const height = getLearningMiniPlayerHeight(
      currentLayout.width,
      isDesktop,
      isExpanded,
      getPlaylistHeight(currentLayout),
    );
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
    resizedDuringGestureRef.current = true;
    settleCandidateRef.current = currentLayout;
    updateMode("resizing");
  }, [isExpanded, measureLayout, updateMode]);

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
      if (
        event.target instanceof Element &&
        event.target.closest("[data-learning-mini-player-gesture-ignore]") !==
          null
      ) {
        return;
      }

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
      if (pointersRef.current.size === 0) {
        resizedDuringGestureRef.current = false;
      }
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
        const resizeHandle =
          event.pointerType === "mouse" && event.target instanceof Element
            ? event.target.closest<HTMLElement>(
                "[data-mini-player-resize-handle]",
              )
            : null;
        if (resizeHandle) {
          event.preventDefault();
          try {
            event.currentTarget.setPointerCapture(event.pointerId);
          } catch {
            // Resize handles are narrow, but document delivery remains a fallback.
          }
        }
        startSingleGesture(
          sample,
          restoreTarget,
          (resizeHandle?.dataset.miniPlayerResizeHandle as
            LearningMiniPlayerResizeEdges | undefined) ?? null,
        );
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

        const isDesktop = isDesktopLearningMinimizeViewport();
        const scale = distanceBetween(first, second) / pinch.initialDistance;
        const viewport = getViewportBounds();
        const { maximumWidth, minimumWidth } = getWidthBounds(viewport);
        const width = Math.max(minimumWidth, pinch.initialWidth * scale);
        const playlistHeight = getPlaylistHeight(layoutRef.current);
        const height = getLearningMiniPlayerHeight(
          width,
          isDesktop,
          isExpanded,
          playlistHeight,
        );
        const midpoint = midpointBetween(first, second);
        const settledWidth = Math.min(width, maximumWidth);
        settleCandidateRef.current = {
          left: midpoint.x - pinch.anchorX * settledWidth,
          playlistHeight,
          top:
            midpoint.y -
            pinch.anchorY *
              getLearningMiniPlayerHeight(
                settledWidth,
                isDesktop,
                isExpanded,
                playlistHeight,
              ),
          width: settledWidth,
        };
        showLiveLayout({
          left: midpoint.x - pinch.anchorX * width,
          playlistHeight,
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
      const latestVelocityX = (sample.x - single.last.x) / elapsedSinceLast;
      const latestVelocityY = (sample.y - single.last.y) / elapsedSinceLast;
      single.velocityX = single.velocityX * 0.35 + latestVelocityX * 0.65;
      single.velocityY = single.velocityY * 0.35 + latestVelocityY * 0.65;
      single.last = sample;

      if (
        modeRef.current !== "dragging" &&
        modeRef.current !== "resizing" &&
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
      if (single.resizeEdges) {
        resizedDuringGestureRef.current = true;
        updateMode("resizing");
        const nextLayout = getLearningMiniPlayerPointerResizeLayout(
          single.initialLayout,
          single.resizeEdges,
          deltaX,
          deltaY,
          undefined,
          isExpanded,
        );
        settleCandidateRef.current = nextLayout;
        showLiveLayout(nextLayout);
        return;
      }
      updateMode("dragging");
      const nextLayout = {
        left: single.initialLayout.left + deltaX,
        playlistHeight: getPlaylistHeight(single.initialLayout),
        top: single.initialLayout.top + deltaY,
        width: single.initialLayout.width,
      };
      settleCandidateRef.current = nextLayout;
      showLiveLayout(nextLayout);
    },
    [
      enabled,
      isExpanded,
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
        const averageVelocityX = deltaX / duration;
        const averageVelocityY = deltaY / duration;
        const velocityX = getReleaseVelocity(
          single.velocityX,
          averageVelocityX,
        );
        const velocityY = getReleaseVelocity(
          single.velocityY,
          averageVelocityY,
        );
        const nextLayout = {
          left: single.initialLayout.left + deltaX,
          playlistHeight: getPlaylistHeight(single.initialLayout),
          top: single.initialLayout.top + deltaY,
          width: single.initialLayout.width,
        };
        const directPointer =
          event.pointerType === "touch" || event.pointerType === "pen";
        const isDesktop = isDesktopLearningMinimizeViewport();
        settleCandidateRef.current =
          cancelled || isDesktop || !directPointer
            ? nextLayout
            : getFlickDirectedCornerLayout(
                nextLayout,
                deltaX,
                deltaY,
                velocityX,
                velocityY,
              );
        showLiveLayout(nextLayout);

        const downwardSwipe =
          !cancelled &&
          !isDesktop &&
          directPointer &&
          Math.abs(deltaX) <= deltaY * 1.25 + 32 &&
          (deltaY >= DISMISS_DISTANCE ||
            (deltaY >= DRAG_START_DISTANCE &&
              Math.max(single.velocityY, averageVelocityY) >=
                DISMISS_VELOCITY));
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
        resizedDuringGestureRef.current = false;
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
        const resizedDuringGesture = resizedDuringGestureRef.current;
        resizedDuringGestureRef.current = false;
        if (needsSettleRef.current && currentLayout) {
          const settledLayout = settleLayout(
            settleCandidateRef.current ?? currentLayout,
          );
          if (resizedDuringGesture && !cancelled) {
            preferredWidthRef.current = settledLayout.width;
            writeMiniPlayerWidthPreference(settledLayout.width);
          }
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

  const visibleLayout = layout ?? (enabled ? getInitialLayout() : null);
  const style: CSSProperties = visibleLayout
    ? {
        bottom: "auto",
        left: visibleLayout.left,
        right: "auto",
        top: visibleLayout.top,
        width: visibleLayout.width,
        ["--learning-mini-player-playlist-height" as string]: `${getPlaylistHeight(visibleLayout)}px`,
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
