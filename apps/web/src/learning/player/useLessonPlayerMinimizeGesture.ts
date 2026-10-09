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
  clearLearningPlayerMinimizeClipSurfaceStyles,
  applyLearningPlayerMinimizeCornerRadius,
  applyLearningPlayerWindowMinimizeMotion,
  clearLearningPlayerWindowMinimizeMotion,
  getLearningMinimizeGeometry,
  getLearningMotionSurfaceElement,
  getLearningPersistentPlayerElement,
  LEARNING_MINI_PLAYER_MARGIN,
  getLearningPlayerViewportBounds,
  isUnifiedDesktopPlayerMinimize,
  setLearningMiniPlayerPreferredLeft,
  syncUnifiedDesktopChildExitMotion,
} from "./learningPlayerMotion";
import { readMiniPlayerWidthPreference } from "./lessonPlayerPersistence";

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
  /** The video's left edge and the mini player's width, for following. */
  startLeft: number;
  miniWidth: number;
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

const getGeometry = (element: HTMLElement): GestureGeometry =>
  getLearningMinimizeGeometry(element, {
    capMiniWidthToElement: !isUnifiedDesktopPlayerMinimize(element),
    preferredWidth: readMiniPlayerWidthPreference() ?? undefined,
  });

const isExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest("[data-video-player-mobile-sheet]"));

/**
 * On desktop the motion target is the player's slot in the lesson layout,
 * which only supplies the geometry. The window that actually moves is the
 * persistent host: transforming it keeps the motion on the compositor,
 * whereas transforming the slot re-lays out the anchored player every frame.
 */
const getDesktopWindowHost = (motionTarget: HTMLElement): HTMLElement | null =>
  isUnifiedDesktopPlayerMinimize(motionTarget)
    ? getLearningPersistentPlayerElement()
    : null;

const clearDesktopWindowHostMotion = () => {
  const host = getLearningPersistentPlayerElement();
  if (host) clearLearningPlayerWindowMinimizeMotion(host);
};

const blurFocusedPlayerControl = () => {
  const activeElement = document.activeElement;
  if (
    activeElement instanceof HTMLElement &&
    activeElement.closest("[data-video-player-control-layer]")
  ) {
    // The control layer becomes aria-hidden and inert on the next render.
    // Move focus out first so Chromium does not retain focus in hidden UI.
    activeElement.blur();
  }
};

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
  const settleDurationMsRef = useRef(LEARNING_PLAYER_MOTION_DURATION_MS);
  const settleCleanupRef = useRef<(() => void) | null>(null);
  const settleFinishRef = useRef<(() => void) | null>(null);
  const settlingMiniPressTimerRef = useRef<ReturnType<
    typeof setTimeout
  > | null>(null);
  const suppressClickRef = useRef(false);
  const committingRef = useRef(false);
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
        clearDesktopWindowHostMotion();
        const clipSurface = getLearningMotionSurfaceElement();
        if (clipSurface && isUnifiedDesktopPlayerMinimize(element)) {
          clearLearningPlayerMinimizeClipSurfaceStyles(clipSurface);
        }
        onStateChangeRef.current?.(nextState);
        return;
      }

      const geometry = geometryRef.current;
      const scale =
        1 - (1 - geometry.targetScale) * clamp(nextState.progress, 0, 1);
      const durationMs =
        nextState.phase === "dragging" ? 0 : settleDurationMsRef.current;
      const clipSurface = isUnifiedDesktopPlayerMinimize(element)
        ? getLearningMotionSurfaceElement()
        : null;
      const windowHost = getDesktopWindowHost(element);
      element.dataset.learningPlayerMotionPhase = nextState.phase;
      if (windowHost) {
        applyLearningPlayerWindowMinimizeMotion(windowHost, {
          durationMs,
          offsetX: geometry.targetX * nextState.progress,
          offsetY: nextState.offsetY,
          progress: clamp(nextState.progress, 0, 1),
          returning: nextState.phase === "settling-back",
          scale,
          targetScale: geometry.targetScale,
        });
      } else {
        applyLearningPlayerMinimizeCornerRadius();
        element.style.overflow = "hidden";
        element.style.transform = `translate3d(${(
          geometry.targetX * nextState.progress
        ).toFixed(
          3,
        )}px, ${nextState.offsetY.toFixed(3)}px, 0) scale(${scale.toFixed(5)})`;
        element.style.transformOrigin = "top left";
        element.style.transitionDuration = `${durationMs}ms`;
        element.style.transitionProperty = "transform";
        element.style.transitionTimingFunction = LEARNING_PLAYER_MOTION_EASING;
        element.style.willChange = "transform";
        element.style.zIndex = "190";
        if (!clipSurface) {
          element.style.borderRadius = "13px";
        }
      }
      if (clipSurface) {
        clipSurface.dataset.learningPlayerMotionPhase = nextState.phase;
        clipSurface.style.zIndex = "190";
        const progress = clamp(nextState.progress, 0, 1);
        syncUnifiedDesktopChildExitMotion(clipSurface, {
          durationMs,
          exitX: geometry.targetX * progress,
          exitY: nextState.offsetY,
          progress,
          scale,
        });
      }
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
      const current = currentStateRef.current;
      settleDurationMsRef.current =
        clamp(Math.abs(nextState.progress - current.progress), 0, 1) *
        LEARNING_PLAYER_MOTION_DURATION_MS;
      const element = motionElementRef.current;
      const reducedMotion = window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
      if (!element || reducedMotion) {
        // Nothing animates here, so the state must not arm a transition.
        settleDurationMsRef.current = 0;
        applyState(nextState);
        onSettled();
        return;
      }

      // Listen on whichever element carries the motion.
      const transitionElement = getDesktopWindowHost(element) ?? element;
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        settleCleanupRef.current = null;
        settleFinishRef.current = null;
        // The motion is over: hold the window at its resting values with no
        // transition left armed. The mini presentation forces its own corner
        // radius, and an armed transition would animate that hand-off.
        if (transitionElement !== element) {
          transitionElement.style.transitionProperty = "none";
        }
        onSettled();
      };
      const handleTransitionEnd = (event: TransitionEvent) => {
        if (
          event.target === transitionElement &&
          (event.propertyName === "transform" ||
            event.propertyName === "translate")
        ) {
          finish();
        }
      };
      const timeout = window.setTimeout(
        finish,
        settleDurationMsRef.current + SETTLE_FALLBACK_BUFFER_MS,
      );
      const cleanup = () => {
        window.clearTimeout(timeout);
        transitionElement.removeEventListener(
          "transitionend",
          handleTransitionEnd,
        );
      };
      settleCleanupRef.current = cleanup;
      settleFinishRef.current = finish;
      transitionElement.addEventListener("transitionend", handleTransitionEnd);
      scheduleState(nextState);
    },
    [applyState, clearSettle, flushPendingState, scheduleState],
  );

  const commitMinimize = useCallback(() => {
    committingRef.current = true;
    commitRef.current();
  }, []);

  const settleBack = useCallback(() => {
    const current = pendingStateRef.current ?? currentStateRef.current;
    if (current.phase === "idle") return;
    setLearningMiniPlayerPreferredLeft(null);
    settleTo({ offsetY: 0, phase: "settling-back", progress: 0 }, () =>
      applyState(IDLE_STATE),
    );
  }, [applyState, settleTo]);

  const animateMinimize = useCallback(() => {
    // Minimized from a button or the keyboard, it goes to its usual corner.
    setLearningMiniPlayerPreferredLeft(null);
    if (!enabled) {
      commitRef.current();
      return;
    }

    const current = pendingStateRef.current ?? currentStateRef.current;
    // Asking again mid-motion turns the motion around from wherever it has
    // reached, rather than making the user wait for it to finish. Once the
    // mini presentation has been committed there is nothing left to turn.
    if (committingRef.current) return;
    if (current.phase === "settling-mini") {
      settleBack();
      return;
    }
    if (current.phase === "settling-back") {
      settleTo(
        {
          offsetY: geometryRef.current.targetY,
          phase: "settling-mini",
          progress: 1,
        },
        commitMinimize,
      );
      return;
    }
    if (current.phase !== "idle") return;

    onGestureStartRef.current?.();
    const element = motionTarget?.() ?? motionElementRef.current;
    if (!element) {
      commitRef.current();
      return;
    }

    const geometry = getGeometry(element);
    motionElementRef.current = element;
    geometryRef.current = geometry;
    blurFocusedPlayerControl();
    setControlsSuppressed(true);
    const windowHost = getDesktopWindowHost(element);
    // An interrupted expand leaves the window part-way; the minimize then
    // starts from there instead of snapping back to the full player first.
    const displaced =
      windowHost !== null &&
      windowHost.style.getPropertyValue("translate") !== "";
    if (windowHost) {
      // Stage the resting state so the window already owns a compositor
      // layer, and shows its info bar, when the transition begins.
      applyLearningPlayerWindowMinimizeMotion(windowHost, {
        durationMs: 0,
        keepPosition: displaced,
        offsetX: 0,
        offsetY: 0,
        progress: 0,
        scale: 1,
        targetScale: geometry.targetScale,
      });
    } else {
      applyLearningPlayerMinimizeCornerRadius();
    }
    const clipSurface = getLearningMotionSurfaceElement();
    if (clipSurface && isUnifiedDesktopPlayerMinimize(element)) {
      clipSurface.dataset.learningPlayerMotionPhase = "settling-mini";
      if (!displaced) {
        syncUnifiedDesktopChildExitMotion(clipSurface, {
          durationMs: 0,
          exitX: 0,
          exitY: 0,
        });
      }
    }
    settleTo(
      {
        offsetY: geometry.targetY,
        phase: "settling-mini",
        progress: 1,
      },
      commitMinimize,
    );
  }, [commitMinimize, enabled, motionTarget, settleBack, settleTo]);

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
        // A finger or pen at any width: a tablet swipes the video down
        // into the mini player just as a phone does. A mouse never does.
        event.pointerType === "mouse" ||
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
      const startBounds = nextMotionTarget.getBoundingClientRect();
      // A swipe says where the mini player goes; nothing is asked for yet.
      setLearningMiniPlayerPreferredLeft(null);
      gestureRef.current = {
        ...nextGeometry,
        startLeft: startBounds.left,
        miniWidth: startBounds.width * nextGeometry.targetScale,
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
        blurFocusedPlayerControl();
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

      // The mini player forms under the finger, not always in the right
      // hand corner: its place along the bottom follows the finger from
      // side to side, as far as the edges of the screen allow, and that is
      // where it is when the video is let go.
      const viewport = getLearningPlayerViewportBounds();
      const miniLeft = clamp(
        event.clientX - gesture.miniWidth / 2,
        viewport.left + LEARNING_MINI_PLAYER_MARGIN,
        Math.max(
          viewport.left + LEARNING_MINI_PLAYER_MARGIN,
          viewport.left +
            viewport.width -
            LEARNING_MINI_PLAYER_MARGIN -
            gesture.miniWidth,
        ),
      );
      gesture.targetX = miniLeft - gesture.startLeft;
      geometryRef.current = {
        ...geometryRef.current,
        targetX: gesture.targetX,
      };
      setLearningMiniPlayerPreferredLeft(miniLeft);

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

    committingRef.current = false;
    clearSettle();
    // A state that never reached a frame is applied at its resting values;
    // the presentation is changing now, so nothing may animate toward it.
    settleDurationMsRef.current = 0;
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
      // The host becomes the mini window in this same commit and takes its
      // geometry from layout from here on. Clearing before the mini player
      // measures itself keeps that measurement free of the motion transform.
      clearDesktopWindowHostMotion();
      const element = motionElementRef.current;
      if (element && !isUnifiedDesktopPlayerMinimize(element)) {
        clearLearningPlayerMinimizeMotionStyles(element);
      }
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

  // A finished minimize leaves the lesson page slid away and inert, on the
  // assumption that the page is about to be torn down. If the player comes
  // straight back to that same page instead, put the page back.
  useLayoutEffect(() => {
    if (!enabled) return;
    const element = motionElementRef.current;
    if (
      !element?.isConnected ||
      element.dataset.learningPlayerMotionPhase === undefined
    ) {
      return;
    }
    applyState(IDLE_STATE);
  }, [applyState, enabled]);

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
      if (element) {
        clearLearningPlayerMinimizeMotionStyles(element);
        const clipSurface = getLearningMotionSurfaceElement();
        if (clipSurface && isUnifiedDesktopPlayerMinimize(element)) {
          clearLearningPlayerMinimizeClipSurfaceStyles(clipSurface);
        }
      }
      clearDesktopWindowHostMotion();
      activePointerIdsRef.current.clear();
      gestureRef.current = null;
    },
    [clearSettle],
  );

  return {
    animateMinimize,
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
