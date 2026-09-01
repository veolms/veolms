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

const MINI_PLAYER_ASPECT_RATIO = 16 / 9;
const MINI_PLAYER_MARGIN = 8;
const MINI_PLAYER_MIN_WIDTH = 192;
const MINI_PLAYER_MAX_WIDTH = 608;
const DRAG_START_DISTANCE = 6;
const DISMISS_DISTANCE = 56;
const DISMISS_VELOCITY = 0.45;
const DISMISS_DURATION = 200;

interface MiniPlayerLayout {
  left: number;
  top: number;
  width: number;
}

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
  start: PointerSample;
  velocityY: number;
}

interface PinchGesture {
  anchorX: number;
  anchorY: number;
  initialDistance: number;
  initialWidth: number;
}

type MiniPlayerGestureMode = "idle" | "dragging" | "resizing" | "dismissing";

interface ViewportBounds {
  height: number;
  left: number;
  top: number;
  width: number;
}

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(Math.max(value, minimum), maximum);

const getViewportBounds = (): ViewportBounds => {
  const viewport = window.visualViewport;
  return {
    height: viewport?.height ?? window.innerHeight,
    left: viewport?.offsetLeft ?? 0,
    top: viewport?.offsetTop ?? 0,
    width: viewport?.width ?? window.innerWidth,
  };
};

const clampLayout = (
  layout: MiniPlayerLayout,
  viewport = getViewportBounds(),
): MiniPlayerLayout => {
  const availableWidth = Math.max(1, viewport.width - MINI_PLAYER_MARGIN * 2);
  const minimumWidth = Math.min(MINI_PLAYER_MIN_WIDTH, availableWidth);
  const maximumWidth = Math.max(
    minimumWidth,
    Math.min(MINI_PLAYER_MAX_WIDTH, availableWidth),
  );
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
    viewport.top + viewport.height - MINI_PLAYER_MARGIN - height,
  );

  return {
    left: clamp(layout.left, minimumLeft, maximumLeft),
    top: clamp(layout.top, minimumTop, maximumTop),
    width,
  };
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
  const suppressClickTimerRef = useRef<number | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  const updateMode = useCallback((nextMode: MiniPlayerGestureMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const commitLayout = useCallback((nextLayout: MiniPlayerLayout) => {
    const clampedLayout = clampLayout(nextLayout);
    layoutRef.current = clampedLayout;
    setLayout(clampedLayout);
    return clampedLayout;
  }, []);

  const measureLayout = useCallback(() => {
    if (layoutRef.current) return layoutRef.current;

    const viewport = getViewportBounds();
    const rect = containerRef.current?.getBoundingClientRect();
    const fallbackWidth = Math.min(viewport.width * 0.82, 352);
    const width = rect && rect.width > 0 ? rect.width : fallbackWidth;
    const height = width / MINI_PLAYER_ASPECT_RATIO;
    return commitLayout({
      left:
        rect && rect.width > 0
          ? rect.left
          : viewport.left + viewport.width - MINI_PLAYER_MARGIN - width,
      top:
        rect && rect.height > 0
          ? rect.top
          : viewport.top + viewport.height - 84 - height,
      width,
    });
  }, [commitLayout, containerRef]);

  useLayoutEffect(() => {
    measureLayout();
  }, [measureLayout]);

  useEffect(() => {
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
  }, [commitLayout]);

  useEffect(
    () => () => {
      if (suppressClickTimerRef.current !== null) {
        window.clearTimeout(suppressClickTimerRef.current);
      }
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
      }
    },
    [],
  );

  const startSingleGesture = useCallback(
    (sample: PointerSample) => {
      singleGestureRef.current = {
        initialLayout: measureLayout(),
        last: sample,
        pointerId: sample.id,
        start: sample,
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
      if (modeRef.current === "dismissing") return;
      if (event.pointerType === "mouse" && event.button !== 0) return;

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is an enhancement; document-level pointer delivery remains usable.
      }

      const sample = getEventSample(event);
      pointersRef.current.set(event.pointerId, sample);
      if (pointersRef.current.size >= 2) {
        startPinchGesture();
      } else {
        startSingleGesture(sample);
      }
    },
    [startPinchGesture, startSingleGesture],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
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
        const width = pinch.initialWidth * scale;
        const height = width / MINI_PLAYER_ASPECT_RATIO;
        const midpoint = midpointBetween(first, second);
        commitLayout({
          left: midpoint.x - pinch.anchorX * width,
          top: midpoint.y - pinch.anchorY * height,
          width,
        });
        return;
      }

      const single = singleGestureRef.current;
      if (!single || single.pointerId !== event.pointerId) {
        startSingleGesture(sample);
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

      event.preventDefault();
      suppressClickRef.current = true;
      updateMode("dragging");
      commitLayout({
        left: single.initialLayout.left + deltaX,
        top: single.initialLayout.top + deltaY,
        width: single.initialLayout.width,
      });
    },
    [commitLayout, startPinchGesture, startSingleGesture, updateMode],
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

      if (wasDragging && single) {
        const deltaX = sample.x - single.start.x;
        const deltaY = sample.y - single.start.y;
        const duration = Math.max(1, sample.time - single.start.time);
        const velocityY = Math.max(single.velocityY, deltaY / duration);
        commitLayout({
          left: single.initialLayout.left + deltaX,
          top: single.initialLayout.top + deltaY,
          width: single.initialLayout.width,
        });

        const directPointer =
          event.pointerType === "touch" || event.pointerType === "pen";
        const downwardFlick =
          !cancelled &&
          directPointer &&
          deltaY >= DISMISS_DISTANCE &&
          Math.abs(deltaX) <= deltaY * 1.25 + 32 &&
          velocityY >= DISMISS_VELOCITY;
        if (downwardFlick) {
          pointersRef.current.clear();
          singleGestureRef.current = null;
          pinchGestureRef.current = null;
          dismiss();
          return;
        }
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
        if (remaining) startSingleGesture(remaining);
        updateMode("idle");
        return;
      }

      if (pointersRef.current.size === 0) {
        singleGestureRef.current = null;
        pinchGestureRef.current = null;
        updateMode("idle");
        scheduleClickRelease();
      }
    },
    [
      commitLayout,
      dismiss,
      scheduleClickRelease,
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

  const style: CSSProperties = layout
    ? {
        bottom: "auto",
        left: layout.left,
        right: "auto",
        top: layout.top,
        width: layout.width,
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
      onPointerCancel: handlePointerCancel,
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
    },
  };
}
