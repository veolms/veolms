import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

const PHONE_VIEWPORT_QUERY = "(max-width: 640px)";
const ACTIVATION_DISTANCE = 8;
const DIRECTION_RATIO = 1.15;
const MINI_PLAYER_MAX_WIDTH = 22 * 16;
const MINI_PLAYER_VIEWPORT_WIDTH = 0.82;
const MINI_PLAYER_RIGHT_GUTTER = 12;
const MINI_PLAYER_BOTTOM_GUTTER = 84;
const COMMIT_PROGRESS = 0.5;
const FLING_PROGRESS = 0.18;
const FLING_VELOCITY = 0.85;
const SETTLE_TO_MINI_MS = 180;
const SETTLE_BACK_MS = 220;

export type LessonPlayerMinimizeGesturePhase =
  "idle" | "dragging" | "settling-back" | "settling-mini";

export interface LessonPlayerMinimizeGestureState {
  offsetY: number;
  phase: LessonPlayerMinimizeGesturePhase;
  progress: number;
}

interface GestureGeometry {
  targetScale: number;
  targetX: number;
  targetY: number;
}

interface ActiveGesture extends GestureGeometry {
  active: boolean;
  captureTarget: HTMLElement;
  lastTimestamp: number;
  lastY: number;
  pointerId: number;
  startX: number;
  startY: number;
  velocityY: number;
}

interface UseLessonPlayerMinimizeGestureOptions {
  enabled: boolean;
  fullscreen: () => boolean;
  onCommit: () => void;
  onStateChange?: (state: LessonPlayerMinimizeGestureState) => void;
}

const IDLE_STATE: LessonPlayerMinimizeGestureState = {
  offsetY: 0,
  phase: "idle",
  progress: 0,
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const getGeometry = (element: HTMLElement): GestureGeometry => {
  const bounds = element.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const startWidth = bounds.width || viewportWidth;
  const startHeight = bounds.height || startWidth * (9 / 16);
  const startLeft = Number.isFinite(bounds.left) ? bounds.left : 0;
  const startTop = Number.isFinite(bounds.top) ? bounds.top : 0;
  const finalWidth = Math.min(
    startWidth,
    MINI_PLAYER_MAX_WIDTH,
    viewportWidth * MINI_PLAYER_VIEWPORT_WIDTH,
  );
  const targetScale = finalWidth / startWidth;
  const finalHeight = startHeight * targetScale;
  const finalLeft = Math.max(
    MINI_PLAYER_RIGHT_GUTTER,
    viewportWidth - MINI_PLAYER_RIGHT_GUTTER - finalWidth,
  );
  const finalTop = Math.max(
    MINI_PLAYER_RIGHT_GUTTER,
    viewportHeight - MINI_PLAYER_BOTTOM_GUTTER - finalHeight,
  );

  return {
    targetScale,
    targetX: finalLeft - startLeft,
    targetY: Math.max(1, finalTop - startTop),
  };
};

const isExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("[data-video-player-mobile-sheet]"));

export function useLessonPlayerMinimizeGesture({
  enabled,
  fullscreen,
  onCommit,
  onStateChange,
}: UseLessonPlayerMinimizeGestureOptions) {
  const activePointerIdsRef = useRef(new Set<number>());
  const clickSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const gestureRef = useRef<ActiveGesture | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suppressClickRef = useRef(false);
  const commitRef = useRef(onCommit);
  const [state, setState] = useState(IDLE_STATE);
  const [geometry, setGeometry] = useState<GestureGeometry>({
    targetScale: 1,
    targetX: 0,
    targetY: 1,
  });
  commitRef.current = onCommit;

  const clearSettleTimer = useCallback(() => {
    if (settleTimerRef.current === null) return;
    clearTimeout(settleTimerRef.current);
    settleTimerRef.current = null;
  }, []);

  const settleBack = useCallback(() => {
    clearSettleTimer();
    setState((current) => ({
      offsetY: 0,
      phase: current.phase === "idle" ? "idle" : "settling-back",
      progress: 0,
    }));
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setState(IDLE_STATE);
    }, SETTLE_BACK_MS);
  }, [clearSettleTimer]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      clearSettleTimer();
      if (
        event.defaultPrevented ||
        !enabled ||
        event.pointerType === "mouse" ||
        !window.matchMedia(PHONE_VIEWPORT_QUERY).matches ||
        fullscreen() ||
        isExcludedTarget(event.target)
      ) {
        gestureRef.current = null;
        return;
      }

      if (event.isPrimary && activePointerIdsRef.current.size > 0) {
        activePointerIdsRef.current.clear();
        gestureRef.current = null;
        suppressClickRef.current = false;
      }
      activePointerIdsRef.current.add(event.pointerId);
      if (activePointerIdsRef.current.size > 1) {
        const gesture = gestureRef.current;
        gestureRef.current = null;
        suppressClickRef.current = false;
        if (gesture) {
          try {
            if (gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
              gesture.captureTarget.releasePointerCapture?.(gesture.pointerId);
            }
          } catch {
            // The zoom recognizer can still take ownership of both pointers.
          }
        }
        settleBack();
        return;
      }

      const nextGeometry = getGeometry(event.currentTarget);
      const timestamp = event.timeStamp || performance.now();
      gestureRef.current = {
        ...nextGeometry,
        active: false,
        captureTarget: event.currentTarget,
        lastTimestamp: timestamp,
        lastY: event.clientY,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        velocityY: 0,
      };
      setGeometry(nextGeometry);
    },
    [clearSettleTimer, enabled, fullscreen, settleBack],
  );

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;

      if (event.defaultPrevented) {
        gestureRef.current = null;
        settleBack();
        return;
      }

      const deltaX = event.clientX - gesture.startX;
      const deltaY = event.clientY - gesture.startY;
      if (!gesture.active) {
        if (
          Math.abs(deltaX) < ACTIVATION_DISTANCE &&
          Math.abs(deltaY) < ACTIVATION_DISTANCE
        ) {
          return;
        }
        if (deltaY <= 0 || deltaY < Math.abs(deltaX) * DIRECTION_RATIO) {
          gestureRef.current = null;
          return;
        }

        gesture.active = true;
        suppressClickRef.current = true;
        try {
          gesture.captureTarget.setPointerCapture?.(event.pointerId);
        } catch {
          // Pointer events continue bubbling from the player gesture surface.
        }
      }

      event.preventDefault();
      const timestamp = Math.max(
        event.timeStamp || performance.now(),
        gesture.lastTimestamp + 1,
      );
      const elapsed = timestamp - gesture.lastTimestamp;
      const instantaneousVelocity = (event.clientY - gesture.lastY) / elapsed;
      gesture.velocityY =
        elapsed > 80 || gesture.velocityY === 0
          ? instantaneousVelocity
          : gesture.velocityY * 0.35 + instantaneousVelocity * 0.65;
      gesture.lastY = event.clientY;
      gesture.lastTimestamp = timestamp;

      const offsetY = clamp(deltaY, 0, gesture.targetY);
      setState({
        offsetY,
        phase: "dragging",
        progress: clamp(offsetY / gesture.targetY, 0, 1),
      });
    },
    [settleBack],
  );

  const finishGesture = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>, cancelled = false) => {
      activePointerIdsRef.current.delete(event.pointerId);
      const gesture = gestureRef.current;
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gestureRef.current = null;
      try {
        if (gesture.captureTarget.hasPointerCapture?.(event.pointerId)) {
          gesture.captureTarget.releasePointerCapture?.(event.pointerId);
        }
      } catch {
        // Window-level pointer delivery still lets the gesture settle safely.
      }

      if (!gesture.active) return;
      if (clickSuppressionTimerRef.current !== null) {
        clearTimeout(clickSuppressionTimerRef.current);
      }
      clickSuppressionTimerRef.current = setTimeout(() => {
        clickSuppressionTimerRef.current = null;
        suppressClickRef.current = false;
      }, 0);
      const progress = clamp(
        Math.max(0, event.clientY - gesture.startY) / gesture.targetY,
        0,
        1,
      );
      const shouldCommit =
        !cancelled &&
        (progress >= COMMIT_PROGRESS ||
          (progress >= FLING_PROGRESS && gesture.velocityY >= FLING_VELOCITY));

      if (!shouldCommit) {
        settleBack();
        return;
      }

      clearSettleTimer();
      setState({
        offsetY: gesture.targetY,
        phase: "settling-mini",
        progress: 1,
      });
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (reducedMotion) {
        commitRef.current();
        return;
      }
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        commitRef.current();
      }, SETTLE_TO_MINI_MS);
    },
    [clearSettleTimer, settleBack],
  );

  useEffect(() => {
    if (enabled) return;

    clearSettleTimer();
    if (clickSuppressionTimerRef.current !== null) {
      clearTimeout(clickSuppressionTimerRef.current);
      clickSuppressionTimerRef.current = null;
    }
    const gesture = gestureRef.current;
    if (gesture) {
      try {
        if (gesture.captureTarget.hasPointerCapture?.(gesture.pointerId)) {
          gesture.captureTarget.releasePointerCapture?.(gesture.pointerId);
        }
      } catch {
        // The browser may already have released capture during presentation changes.
      }
    }
    activePointerIdsRef.current.clear();
    gestureRef.current = null;
    suppressClickRef.current = false;
    setState((current) =>
      current.phase === "idle" &&
      current.offsetY === 0 &&
      current.progress === 0
        ? current
        : IDLE_STATE,
    );
  }, [clearSettleTimer, enabled]);

  useEffect(() => onStateChange?.(state), [onStateChange, state]);

  useEffect(
    () => () => {
      clearSettleTimer();
      if (clickSuppressionTimerRef.current !== null) {
        clearTimeout(clickSuppressionTimerRef.current);
      }
      activePointerIdsRef.current.clear();
      gestureRef.current = null;
    },
    [clearSettleTimer],
  );

  const scale = 1 - (1 - geometry.targetScale) * state.progress;
  const style: CSSProperties = {
    borderRadius:
      state.progress > 0 ? `${13 + state.progress * 7}px` : undefined,
    boxShadow:
      state.progress > 0
        ? `0 ${Math.round(10 + state.progress * 12)}px ${Math.round(
            28 + state.progress * 22,
          )}px rgb(0 0 0 / ${0.2 + state.progress * 0.22})`
        : undefined,
    overflow: state.phase === "idle" ? undefined : "hidden",
    touchAction: "pan-x pinch-zoom",
    transform:
      state.phase === "idle"
        ? undefined
        : `translate3d(${Math.round(
            geometry.targetX * state.progress,
          )}px, ${Math.round(state.offsetY)}px, 0) scale(${scale.toFixed(4)})`,
    transformOrigin: "top left",
    transitionDuration: state.phase === "dragging" ? "0ms" : undefined,
    willChange:
      state.phase === "idle"
        ? undefined
        : "transform, border-radius, box-shadow",
  };

  return {
    active: state.phase !== "idle",
    handlers: {
      onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) return;
        suppressClickRef.current = false;
        if (clickSuppressionTimerRef.current !== null) {
          clearTimeout(clickSuppressionTimerRef.current);
          clickSuppressionTimerRef.current = null;
        }
        event.preventDefault();
        event.stopPropagation();
      },
      onPointerCancelCapture: (event: ReactPointerEvent<HTMLDivElement>) =>
        finishGesture(event, true),
      onPointerDownCapture: handlePointerDown,
      onPointerMoveCapture: handlePointerMove,
      onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) =>
        finishGesture(event),
    },
    state,
    style,
  };
}
