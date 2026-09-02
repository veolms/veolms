import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  LEARNING_PLAYER_MOTION_DURATION_MS,
  LEARNING_PLAYER_MOTION_EASING,
  clampLearningPlayerValue as clamp,
  clearLearningPlayerMinimizeMotionStyles,
  getDefaultLearningMiniPlayerLayout,
} from "./learningPlayerMotion";

const PHONE_VIEWPORT_QUERY = "(max-width: 640px)";
const ACTIVATION_DISTANCE = 8;
const DIRECTION_RATIO = 1.15;
const COMMIT_PROGRESS = 0.5;
const FLING_PROGRESS = 0.18;
const FLING_VELOCITY = 0.85;
const SETTLE_FALLBACK_BUFFER_MS = 80;

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
  motionTarget: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  velocityY: number;
}

interface UseLessonPlayerMinimizeGestureOptions {
  enabled: boolean;
  fullscreen: () => boolean;
  motionTarget?: () => HTMLElement | null;
  onCommit: () => void;
  onGestureStart?: () => void;
  onSettlingMiniPress?: () => void;
  onStateChange?: (state: LessonPlayerMinimizeGestureState) => void;
  preserveTerminalStateOnDisable?: boolean;
}

const IDLE_STATE: LessonPlayerMinimizeGestureState = {
  offsetY: 0,
  phase: "idle",
  progress: 0,
};

const DEFAULT_GEOMETRY: GestureGeometry = {
  targetScale: 1,
  targetX: 0,
  targetY: 1,
};

const getGeometry = (element: HTMLElement): GestureGeometry => {
  const bounds = element.getBoundingClientRect();
  const viewportWidth = window.visualViewport?.width ?? window.innerWidth;
  const startWidth = bounds.width || viewportWidth;
  const startLeft = Number.isFinite(bounds.left) ? bounds.left : 0;
  const startTop = Number.isFinite(bounds.top) ? bounds.top : 0;
  const target = getDefaultLearningMiniPlayerLayout(startWidth);

  return {
    targetScale: target.width / startWidth,
    targetX: target.left - startLeft,
    targetY: Math.max(1, target.top - startTop),
  };
};

const isExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("[data-video-player-mobile-sheet]"));

export function useLessonPlayerMinimizeGesture({
  enabled,
  fullscreen,
  motionTarget,
  onCommit,
  onGestureStart,
  onSettlingMiniPress,
  onStateChange,
  preserveTerminalStateOnDisable = false,
}: UseLessonPlayerMinimizeGestureOptions) {
  const [controlsSuppressed, setControlsSuppressed] = useState(false);
  const activePointerIdsRef = useRef(new Set<number>());
  const clickSuppressionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const currentStateRef = useRef(IDLE_STATE);
  const frameRef = useRef<number | null>(null);
  const geometryRef = useRef(DEFAULT_GEOMETRY);
  const gestureRef = useRef<ActiveGesture | null>(null);
  const motionElementRef = useRef<HTMLElement | null>(null);
  const pendingStateRef = useRef<LessonPlayerMinimizeGestureState | null>(null);
  const settleCleanupRef = useRef<(() => void) | null>(null);
  const settleFinishRef = useRef<(() => void) | null>(null);
  const settlingMiniPressTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const suppressClickRef = useRef(false);
  const commitRef = useRef(onCommit);
  const onGestureStartRef = useRef(onGestureStart);
  const onSettlingMiniPressRef = useRef(onSettlingMiniPress);
  const onStateChangeRef = useRef(onStateChange);
  commitRef.current = onCommit;
  onGestureStartRef.current = onGestureStart;
  onSettlingMiniPressRef.current = onSettlingMiniPress;
  onStateChangeRef.current = onStateChange;

  const applyState = useCallback(
    (nextState: LessonPlayerMinimizeGestureState) => {
      const element = motionElementRef.current;
      currentStateRef.current = nextState;
      if (nextState.phase === "idle") setControlsSuppressed(false);
      if (!element) {
        onStateChangeRef.current?.(nextState);
        return;
      }

      if (nextState.phase === "idle") {
        clearLearningPlayerMinimizeMotionStyles(element);
        onStateChangeRef.current?.(nextState);
        return;
      }

      const geometry = geometryRef.current;
      const scale =
        1 - (1 - geometry.targetScale) * clamp(nextState.progress, 0, 1);
      element.dataset.learningPlayerMotionPhase = nextState.phase;
      element.style.borderRadius = "13px";
      element.style.overflow = "hidden";
      element.style.transform = `translate3d(${(
        geometry.targetX * nextState.progress
      ).toFixed(
        3,
      )}px, ${nextState.offsetY.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
      element.style.transformOrigin = "top left";
      element.style.transitionDuration =
        nextState.phase === "dragging"
          ? "0ms"
          : `${LEARNING_PLAYER_MOTION_DURATION_MS}ms`;
      element.style.transitionProperty = "transform";
      element.style.transitionTimingFunction = LEARNING_PLAYER_MOTION_EASING;
      element.style.willChange = "transform";
      element.style.zIndex = "190";
      onStateChangeRef.current?.(nextState);
    },
    [],
  );

  const flushPendingState = useCallback(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    const pendingState = pendingStateRef.current;
    pendingStateRef.current = null;
    if (pendingState) applyState(pendingState);
  }, [applyState]);

  const scheduleState = useCallback(
    (nextState: LessonPlayerMinimizeGestureState) => {
      pendingStateRef.current = nextState;
      if (frameRef.current !== null) return;
      frameRef.current = window.requestAnimationFrame(() => {
        frameRef.current = null;
        const pendingState = pendingStateRef.current;
        pendingStateRef.current = null;
        if (pendingState) applyState(pendingState);
      });
    },
    [applyState],
  );

  const clearSettle = useCallback(() => {
    settleCleanupRef.current?.();
    settleCleanupRef.current = null;
    settleFinishRef.current = null;
  }, []);

  const settleTo = useCallback(
    (nextState: LessonPlayerMinimizeGestureState, onSettled: () => void) => {
      clearSettle();
      flushPendingState();
      const element = motionElementRef.current;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!element || reducedMotion) {
        applyState(nextState);
        onSettled();
        return;
      }

      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        settleCleanupRef.current = null;
        settleFinishRef.current = null;
        onSettled();
      };
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (event.target === element && event.propertyName === "transform") {
          finish();
        }
      };
      const timeout = window.setTimeout(
        finish,
        LEARNING_PLAYER_MOTION_DURATION_MS + SETTLE_FALLBACK_BUFFER_MS,
      );
      const cleanup = () => {
        window.clearTimeout(timeout);
        element.removeEventListener("transitionend", handleTransitionEnd);
      };
      settleCleanupRef.current = cleanup;
      settleFinishRef.current = finish;
      element.addEventListener("transitionend", handleTransitionEnd);
      scheduleState(nextState);
    },
    [applyState, clearSettle, flushPendingState, scheduleState],
  );

  const settleBack = useCallback(() => {
    const current = pendingStateRef.current ?? currentStateRef.current;
    if (current.phase === "idle") return;
    settleTo({ offsetY: 0, phase: "settling-back", progress: 0 }, () =>
      applyState(IDLE_STATE),
    );
  }, [applyState, settleTo]);

  const handlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const finishActiveSettle = settleFinishRef.current;
      if (finishActiveSettle) {
        const settlingPhase =
          pendingStateRef.current?.phase ?? currentStateRef.current.phase;
        finishActiveSettle();
        gestureRef.current = null;
        if (settlingPhase === "settling-mini") {
          event.preventDefault();
          event.stopPropagation();
          if (settlingMiniPressTimerRef.current !== null) {
            clearTimeout(settlingMiniPressTimerRef.current);
          }
          settlingMiniPressTimerRef.current = setTimeout(() => {
            settlingMiniPressTimerRef.current = null;
            onSettlingMiniPressRef.current?.();
          }, 0);
          return;
        }
      }
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

      onGestureStartRef.current?.();
      const nextMotionTarget = motionTarget?.() ?? event.currentTarget;
      const nextGeometry = getGeometry(nextMotionTarget);
      const timestamp = event.timeStamp || performance.now();
      motionElementRef.current = nextMotionTarget;
      geometryRef.current = nextGeometry;
      gestureRef.current = {
        ...nextGeometry,
        active: false,
        captureTarget: event.currentTarget,
        lastTimestamp: timestamp,
        lastY: event.clientY,
        motionTarget: nextMotionTarget,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        velocityY: 0,
      };
    },
    [enabled, fullscreen, motionTarget, settleBack],
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
        setControlsSuppressed(true);
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
      scheduleState({
        offsetY,
        phase: "dragging",
        progress: clamp(offsetY / gesture.targetY, 0, 1),
      });
    },
    [scheduleState, settleBack],
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
      if (settlingMiniPressTimerRef.current !== null) {
        clearTimeout(settlingMiniPressTimerRef.current);
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

      settleTo(
        {
          offsetY: gesture.targetY,
          phase: "settling-mini",
          progress: 1,
        },
        () => commitRef.current(),
      );
    },
    [settleBack, settleTo],
  );

  useLayoutEffect(() => {
    if (enabled) return;

    clearSettle();
    flushPendingState();
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
    setControlsSuppressed(false);
    suppressClickRef.current = false;
    pendingStateRef.current = null;
    if (preserveTerminalStateOnDisable) {
      currentStateRef.current = IDLE_STATE;
      const element = motionElementRef.current;
      if (element) clearLearningPlayerMinimizeMotionStyles(element);
      return;
    }
    applyState(IDLE_STATE);
  }, [
    applyState,
    clearSettle,
    enabled,
    flushPendingState,
    preserveTerminalStateOnDisable,
  ]);

  useEffect(
    () => () => {
      clearSettle();
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current);
      }
      if (clickSuppressionTimerRef.current !== null) {
        clearTimeout(clickSuppressionTimerRef.current);
      }
      if (settlingMiniPressTimerRef.current !== null) {
        clearTimeout(settlingMiniPressTimerRef.current);
      }
      const element = motionElementRef.current;
      if (element) clearLearningPlayerMinimizeMotionStyles(element);
      activePointerIdsRef.current.clear();
      gestureRef.current = null;
    },
    [clearSettle],
  );

  return {
    controlsSuppressed,
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
  };
}
