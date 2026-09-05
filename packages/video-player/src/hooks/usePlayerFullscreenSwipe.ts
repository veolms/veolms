import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from "react";
import type { PlayerController } from "../react/PlayerController";
import type { PlayerZoomState } from "../react/playerState";

const DIRECTION_LOCK_DISTANCE_PX = 12;
const DIRECTION_DOMINANCE = 1.15;
const ENTER_PREVIEW_SCALE_DELTA = 0.18;
const EXIT_PREVIEW_SCALE_DELTA = 0.15;
const FLICK_COMMIT_DISTANCE_PX = 32;
const FLICK_COMMIT_DURATION_MS = 300;
const POINTER_TOUCH_DEDUPE_MS = 90;
const SWIPE_COMMIT_DISTANCE_RATIO = 0.22;
const SWIPE_COMMIT_MAX_PX = 96;
const SWIPE_COMMIT_MIN_PX = 48;
const TRANSITION_DURATION_MS = 220;
const FULLSCREEN_SWIPE_IGNORE_SELECTOR = [
  "[data-player-fullscreen-swipe-ignore]",
  "[data-video-player-mobile-sheet]",
  '[role="slider"]',
  '[role="menu"]',
  '[role="dialog"]',
].join(",");

interface GesturePoint {
  x: number;
  y: number;
}

interface FullscreenSwipeGesture {
  active: boolean;
  fullscreen: boolean;
  height: number;
  initialZoom: PlayerZoomState;
  lastX: number;
  lastY: number;
  pointerId: number;
  startedAt: number;
  startX: number;
  startY: number;
}

interface FullscreenSwipeHandlers {
  hasPendingGesture: () => boolean;
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerEnd: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => boolean;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => boolean;
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => boolean;
  suppressLegacyTouch: () => boolean;
}

function getPlayerRoot(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>("[data-video-player-root]") ?? element;
}

function isFullscreenSwipeIgnored(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    Boolean(target.closest(FULLSCREEN_SWIPE_IGNORE_SELECTOR))
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function usePlayerFullscreenSwipe(
  controller: PlayerController,
  enabled: boolean,
): FullscreenSwipeHandlers {
  const swipeRef = useRef<FullscreenSwipeGesture | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerEventAtRef = useRef(Number.NEGATIVE_INFINITY);
  const suppressLegacyTouchUntilRef = useRef(Number.NEGATIVE_INFINITY);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current === null) return;
    clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, []);

  const scheduleTransitionEnd = useCallback(() => {
    clearTransitionTimer();
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      controller.setZoomState({ transitioning: false });
    }, TRANSITION_DURATION_MS);
  }, [clearTransitionTimer, controller]);

  const restoreInitialZoom = useCallback(
    (gesture: FullscreenSwipeGesture) => {
      controller.setZoomState({
        ...gesture.initialZoom,
        feedbackVisible: false,
        gestureActive: false,
        transitioning: true,
      });
      scheduleTransitionEnd();
    },
    [controller, scheduleTransitionEnd],
  );

  const cancelSwipe = useCallback(
    (restoreControls: boolean) => {
      const gesture = swipeRef.current;
      swipeRef.current = null;
      if (!gesture?.active) return false;
      restoreInitialZoom(gesture);
      if (restoreControls) controller.setControlsVisible(true);
      return true;
    },
    [controller, restoreInitialZoom],
  );

  const prepareSwipe = useCallback(
    (element: HTMLElement, pointerId: number, point: GesturePoint) => {
      if (!enabled) return;
      const { ui } = controller.getSnapshot();
      if (!ui.fullscreen && ui.zoom.scale > 1.001) return;
      const bounds = getPlayerRoot(element).getBoundingClientRect();
      if (bounds.height <= 0) return;
      swipeRef.current = {
        active: false,
        fullscreen: ui.fullscreen,
        height: bounds.height,
        initialZoom: ui.zoom,
        lastX: point.x,
        lastY: point.y,
        pointerId,
        startedAt: Date.now(),
        startX: point.x,
        startY: point.y,
      };
    },
    [controller, enabled],
  );

  const updateSwipe = useCallback(
    (pointerId: number, point: GesturePoint) => {
      const gesture = swipeRef.current;
      if (!gesture || gesture.pointerId !== pointerId) return false;
      const deltaX = point.x - gesture.startX;
      const deltaY = point.y - gesture.startY;
      const verticalDistance = Math.abs(deltaY);
      gesture.lastX = point.x;
      gesture.lastY = point.y;

      if (!gesture.active) {
        if (Math.hypot(deltaX, deltaY) < DIRECTION_LOCK_DISTANCE_PX) {
          return false;
        }
        const correctDirection = gesture.fullscreen ? deltaY > 0 : deltaY < 0;
        const verticalIntent =
          verticalDistance >= Math.abs(deltaX) * DIRECTION_DOMINANCE;
        if (!correctDirection || !verticalIntent) {
          swipeRef.current = null;
          return false;
        }

        gesture.active = true;
        clearTransitionTimer();
        controller.setSettingsView("closed");
        controller.setControlsVisible(false);
      }

      const commitDistance = clamp(
        gesture.height * SWIPE_COMMIT_DISTANCE_RATIO,
        SWIPE_COMMIT_MIN_PX,
        SWIPE_COMMIT_MAX_PX,
      );
      const directionalDistance = gesture.fullscreen ? deltaY : -deltaY;
      const progress = clamp(directionalDistance / commitDistance, 0, 1);
      const scaleMultiplier = gesture.fullscreen
        ? 1 - EXIT_PREVIEW_SCALE_DELTA * progress
        : 1 + ENTER_PREVIEW_SCALE_DELTA * progress;
      const scale = gesture.initialZoom.scale * scaleMultiplier;
      const panY =
        gesture.initialZoom.panY +
        ((gesture.initialZoom.scale - scale) * gesture.height) / 2;
      controller.setZoomState({
        feedbackVisible: false,
        gestureActive: true,
        panX: gesture.initialZoom.panX,
        panY,
        scale,
        transitioning: false,
      });
      return true;
    },
    [clearTransitionTimer, controller],
  );

  const finishSwipe = useCallback(
    (pointerId: number, point: GesturePoint, cancelled: boolean) => {
      const gesture = swipeRef.current;
      if (!gesture || gesture.pointerId !== pointerId) return false;
      if (!gesture.active) {
        swipeRef.current = null;
        return false;
      }
      if (!cancelled) updateSwipe(gesture.pointerId, point);
      swipeRef.current = null;

      const distance = gesture.fullscreen
        ? point.y - gesture.startY
        : gesture.startY - point.y;
      const commitDistance = clamp(
        gesture.height * SWIPE_COMMIT_DISTANCE_RATIO,
        SWIPE_COMMIT_MIN_PX,
        SWIPE_COMMIT_MAX_PX,
      );
      const flicked =
        Date.now() - gesture.startedAt <= FLICK_COMMIT_DURATION_MS &&
        distance >= FLICK_COMMIT_DISTANCE_PX;
      const committed = !cancelled && (distance >= commitDistance || flicked);

      if (!committed) {
        restoreInitialZoom(gesture);
        controller.setControlsVisible(true);
        return true;
      }

      controller.setZoomState({
        feedbackVisible: false,
        gestureActive: false,
        panX: 0,
        panY: 0,
        scale: 1,
        transitioning: true,
      });
      controller.setControlsVisible(true);
      scheduleTransitionEnd();
      const fullscreenAction = gesture.fullscreen
        ? controller.exitFullscreen()
        : controller.enterFullscreen();
      void fullscreenAction.catch(() => undefined);
      return true;
    },
    [controller, restoreInitialZoom, scheduleTransitionEnd, updateSwipe],
  );

  useEffect(
    () => () => {
      clearTransitionTimer();
      swipeRef.current = null;
    },
    [clearTransitionTimer],
  );

  useEffect(() => {
    if (!enabled) cancelSwipe(true);
  }, [cancelSwipe, enabled]);

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    if (isFullscreenSwipeIgnored(event.target)) {
      cancelSwipe(false);
      return false;
    }
    if (swipeRef.current !== null) {
      cancelSwipe(false);
      return false;
    }
    prepareSwipe(event.currentTarget, event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    return false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    const handled = updateSwipe(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (handled) event.preventDefault();
    return handled;
  };

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (!enabled || event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    const handled = finishSwipe(
      event.pointerId,
      { x: event.clientX, y: event.clientY },
      event.type === "pointercancel",
    );
    if (handled) {
      event.preventDefault();
      suppressLegacyTouchUntilRef.current =
        Date.now() + POINTER_TOUCH_DEDUPE_MS;
    }
    return handled;
  };

  const legacyTouchIsPointerBacked = () =>
    Date.now() - lastPointerEventAtRef.current < POINTER_TOUCH_DEDUPE_MS;

  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || legacyTouchIsPointerBacked()) return false;
    if (isFullscreenSwipeIgnored(event.target)) {
      cancelSwipe(false);
      return false;
    }
    if (event.touches.length !== 1) {
      cancelSwipe(false);
      return false;
    }
    const touch = event.touches[0];
    if (!touch) return false;
    prepareSwipe(event.currentTarget, touch.identifier, {
      x: touch.clientX,
      y: touch.clientY,
    });
    return false;
  };

  const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || legacyTouchIsPointerBacked()) return false;
    const gesture = swipeRef.current;
    const touch = Array.from(event.touches).find(
      (candidate) => candidate.identifier === gesture?.pointerId,
    );
    if (!touch) return false;
    const handled = updateSwipe(touch.identifier, {
      x: touch.clientX,
      y: touch.clientY,
    });
    if (handled) {
      event.preventDefault();
      suppressLegacyTouchUntilRef.current = Number.POSITIVE_INFINITY;
    }
    return handled;
  };

  const onTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    if (!enabled || legacyTouchIsPointerBacked()) return false;
    const gesture = swipeRef.current;
    if (!gesture) return false;
    const touch = Array.from(event.changedTouches).find(
      (candidate) => candidate.identifier === gesture.pointerId,
    );
    if (!touch && event.type !== "touchcancel") return false;
    const handled = finishSwipe(
      gesture.pointerId,
      {
        x: touch?.clientX ?? gesture.lastX,
        y: touch?.clientY ?? gesture.lastY,
      },
      event.type === "touchcancel",
    );
    if (handled) event.preventDefault();
    suppressLegacyTouchUntilRef.current = handled
      ? Date.now() + POINTER_TOUCH_DEDUPE_MS
      : Number.NEGATIVE_INFINITY;
    return handled;
  };

  return {
    hasPendingGesture: () => swipeRef.current !== null,
    onPointerDown,
    onPointerEnd,
    onPointerMove,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    suppressLegacyTouch: () =>
      Boolean(swipeRef.current?.active) ||
      Date.now() < suppressLegacyTouchUntilRef.current,
  };
}
