import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent,
  type TouchEvent,
} from "react";
import type { PlayerController } from "../react/PlayerController";
import {
  clampPlayerPan,
  clampPlayerZoom,
  getPlayerFillZoom,
  getPlayerZoomGeometry,
  type PlayerZoomGeometry,
} from "./playerZoomMath";

const PAN_START_DISTANCE_PX = 6;
const QUICK_FILL_DURATION_MS = 400;
const QUICK_FILL_SCALE_DELTA = 0.08;
const ZOOM_FEEDBACK_DURATION_MS = 1_800;
const ZOOM_TRANSITION_DURATION_MS = 220;
const POINTER_TOUCH_DEDUPE_MS = 90;

interface GesturePoint {
  x: number;
  y: number;
}

interface PinchGesture {
  contentX: number;
  contentY: number;
  fillScale: number;
  geometry: PlayerZoomGeometry;
  maxScale: number;
  startedAt: number;
  startDistance: number;
  startScale: number;
}

interface PanGesture {
  active: boolean;
  geometry: PlayerZoomGeometry;
  pointerId: number;
  startPanX: number;
  startPanY: number;
  startX: number;
  startY: number;
}

interface ZoomGestureHandlers {
  onPointerDown: (event: PointerEvent<HTMLButtonElement>) => boolean;
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => boolean;
  onPointerEnd: (event: PointerEvent<HTMLButtonElement>) => boolean;
  onTouchStart: (event: TouchEvent<HTMLButtonElement>) => boolean;
  onTouchMove: (event: TouchEvent<HTMLButtonElement>) => boolean;
  onTouchEnd: (event: TouchEvent<HTMLButtonElement>) => boolean;
  suppressLegacyTouch: () => boolean;
}

function distance(first: GesturePoint, second: GesturePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: GesturePoint, second: GesturePoint): GesturePoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function getGeometry(element: HTMLButtonElement): PlayerZoomGeometry {
  const root = element.parentElement ?? element;
  const bounds = root.getBoundingClientRect();
  const media = root.querySelector("video");
  return getPlayerZoomGeometry(
    bounds.width,
    bounds.height,
    media?.videoWidth ?? 0,
    media?.videoHeight ?? 0,
  );
}

function getLocalPoint(
  element: HTMLButtonElement,
  point: GesturePoint,
): GesturePoint {
  const root = element.parentElement ?? element;
  const bounds = root.getBoundingClientRect();
  return { x: point.x - bounds.left, y: point.y - bounds.top };
}

function getFirstTwoPoints(
  points: ReadonlyMap<number, GesturePoint>,
): [GesturePoint, GesturePoint] | null {
  const values = Array.from(points.values());
  return values[0] && values[1] ? [values[0], values[1]] : null;
}

export function usePlayerZoomGestures(
  controller: PlayerController,
): ZoomGestureHandlers {
  const pointerPointsRef = useRef(new Map<number, GesturePoint>());
  const suppressedPointersRef = useRef(new Set<number>());
  const pinchRef = useRef<PinchGesture | null>(null);
  const panRef = useRef<PanGesture | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPointerEventAtRef = useRef(Number.NEGATIVE_INFINITY);
  const suppressLegacyTouchUntilRef = useRef(Number.NEGATIVE_INFINITY);

  const clearFeedbackTimer = useCallback(() => {
    if (feedbackTimerRef.current === null) return;
    clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = null;
  }, []);

  const clearTransitionTimer = useCallback(() => {
    if (transitionTimerRef.current === null) return;
    clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = null;
  }, []);

  const beginVisualFeedback = useCallback(() => {
    clearFeedbackTimer();
    clearTransitionTimer();
    controller.setSettingsView("closed");
    controller.setControlsVisible(false);
    controller.setZoomState({
      feedbackVisible: true,
      gestureActive: true,
      transitioning: false,
    });
  }, [clearFeedbackTimer, clearTransitionTimer, controller]);

  const scheduleFeedbackHide = useCallback(() => {
    clearFeedbackTimer();
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      controller.setZoomState({ feedbackVisible: false });
    }, ZOOM_FEEDBACK_DURATION_MS);
  }, [clearFeedbackTimer, controller]);

  const scheduleTransitionEnd = useCallback(() => {
    clearTransitionTimer();
    transitionTimerRef.current = setTimeout(() => {
      transitionTimerRef.current = null;
      controller.setZoomState({ transitioning: false });
    }, ZOOM_TRANSITION_DURATION_MS);
  }, [clearTransitionTimer, controller]);

  const beginPinch = useCallback(
    (element: HTMLButtonElement, first: GesturePoint, second: GesturePoint) => {
      const startDistance = distance(first, second);
      if (startDistance <= 0) return false;
      const zoom = controller.getSnapshot().ui.zoom;
      const geometry = getGeometry(element);
      const center = midpoint(first, second);
      const localCenter = getLocalPoint(element, center);
      pinchRef.current = {
        contentX:
          (localCenter.x - geometry.containerWidth / 2 - zoom.panX) /
          zoom.scale,
        contentY:
          (localCenter.y - geometry.containerHeight / 2 - zoom.panY) /
          zoom.scale,
        fillScale: getPlayerFillZoom(geometry),
        geometry,
        maxScale: zoom.scale,
        startedAt: Date.now(),
        startDistance,
        startScale: zoom.scale,
      };
      panRef.current = null;
      beginVisualFeedback();
      return true;
    },
    [beginVisualFeedback, controller],
  );

  const updatePinch = useCallback(
    (element: HTMLButtonElement, first: GesturePoint, second: GesturePoint) => {
      const pinch = pinchRef.current;
      if (!pinch) return false;
      const scale = clampPlayerZoom(
        pinch.startScale * (distance(first, second) / pinch.startDistance),
      );
      const localCenter = getLocalPoint(element, midpoint(first, second));
      const pan = clampPlayerPan(
        {
          x:
            localCenter.x -
            pinch.geometry.containerWidth / 2 -
            pinch.contentX * scale,
          y:
            localCenter.y -
            pinch.geometry.containerHeight / 2 -
            pinch.contentY * scale,
        },
        scale,
        pinch.geometry,
      );
      pinch.maxScale = Math.max(pinch.maxScale, scale);
      controller.setZoomState({
        feedbackVisible: true,
        gestureActive: true,
        panX: pan.x,
        panY: pan.y,
        scale,
        transitioning: false,
      });
      return true;
    },
    [controller],
  );

  const finishGesture = useCallback(() => {
    const pinch = pinchRef.current;
    const zoom = controller.getSnapshot().ui.zoom;
    let scale = zoom.scale;
    let panX = zoom.panX;
    let panY = zoom.panY;
    let transitioning = false;

    if (
      pinch &&
      Date.now() - pinch.startedAt <= QUICK_FILL_DURATION_MS &&
      pinch.maxScale - pinch.startScale >= QUICK_FILL_SCALE_DELTA &&
      pinch.startScale < pinch.fillScale - 0.01 &&
      scale < pinch.fillScale
    ) {
      scale = pinch.fillScale;
      const pan = clampPlayerPan({ x: panX, y: panY }, scale, pinch.geometry);
      panX = pan.x;
      panY = pan.y;
      transitioning = true;
    } else if (scale <= 1.01) {
      scale = 1;
      panX = 0;
      panY = 0;
      transitioning = zoom.scale !== 1 || zoom.panX !== 0 || zoom.panY !== 0;
    }

    pinchRef.current = null;
    panRef.current = null;
    controller.setZoomState({
      feedbackVisible: true,
      gestureActive: false,
      panX,
      panY,
      scale,
      transitioning,
    });
    if (transitioning) scheduleTransitionEnd();
    scheduleFeedbackHide();
    suppressLegacyTouchUntilRef.current = Date.now() + POINTER_TOUCH_DEDUPE_MS;
  }, [controller, scheduleFeedbackHide, scheduleTransitionEnd]);

  useEffect(
    () => () => {
      clearFeedbackTimer();
      clearTransitionTimer();
    },
    [clearFeedbackTimer, clearTransitionTimer],
  );

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    pointerPointsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = getFirstTwoPoints(pointerPointsRef.current);
    if (points) {
      for (const pointerId of pointerPointsRef.current.keys()) {
        suppressedPointersRef.current.add(pointerId);
      }
      event.preventDefault();
      return beginPinch(event.currentTarget, points[0], points[1]);
    }

    const zoom = controller.getSnapshot().ui.zoom;
    if (zoom.scale > 1) {
      panRef.current = {
        active: false,
        geometry: getGeometry(event.currentTarget),
        pointerId: event.pointerId,
        startPanX: zoom.panX,
        startPanY: zoom.panY,
        startX: event.clientX,
        startY: event.clientY,
      };
    }
    return false;
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    if (!pointerPointsRef.current.has(event.pointerId)) return false;
    pointerPointsRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const points = getFirstTwoPoints(pointerPointsRef.current);
    if (pinchRef.current && points) {
      event.preventDefault();
      return updatePinch(event.currentTarget, points[0], points[1]);
    }

    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return false;
    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    if (!pan.active && Math.hypot(deltaX, deltaY) < PAN_START_DISTANCE_PX) {
      return false;
    }
    if (!pan.active) {
      pan.active = true;
      suppressedPointersRef.current.add(event.pointerId);
      beginVisualFeedback();
    }
    event.preventDefault();
    const zoom = controller.getSnapshot().ui.zoom;
    const nextPan = clampPlayerPan(
      { x: pan.startPanX + deltaX, y: pan.startPanY + deltaY },
      zoom.scale,
      pan.geometry,
    );
    controller.setZoomState({
      feedbackVisible: true,
      gestureActive: true,
      panX: nextPan.x,
      panY: nextPan.y,
    });
    return true;
  };

  const onPointerEnd = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    const wasSuppressed = suppressedPointersRef.current.has(event.pointerId);
    pointerPointsRef.current.delete(event.pointerId);
    suppressedPointersRef.current.delete(event.pointerId);
    if (pinchRef.current || panRef.current?.active) {
      event.preventDefault();
      finishGesture();
      return true;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    return wasSuppressed;
  };

  const legacyTouchIsPointerBacked = () =>
    Date.now() - lastPointerEventAtRef.current < POINTER_TOUCH_DEDUPE_MS;

  const onTouchStart = (event: TouchEvent<HTMLButtonElement>) => {
    if (legacyTouchIsPointerBacked()) return false;
    if (event.touches.length >= 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) return false;
      event.preventDefault();
      suppressLegacyTouchUntilRef.current = Number.POSITIVE_INFINITY;
      return beginPinch(
        event.currentTarget,
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      );
    }
    const zoom = controller.getSnapshot().ui.zoom;
    const touch = event.touches[0];
    if (zoom.scale > 1 && touch) {
      panRef.current = {
        active: false,
        geometry: getGeometry(event.currentTarget),
        pointerId: touch.identifier,
        startPanX: zoom.panX,
        startPanY: zoom.panY,
        startX: touch.clientX,
        startY: touch.clientY,
      };
    }
    return false;
  };

  const onTouchMove = (event: TouchEvent<HTMLButtonElement>) => {
    if (legacyTouchIsPointerBacked()) return false;
    if (pinchRef.current && event.touches.length >= 2) {
      const first = event.touches[0];
      const second = event.touches[1];
      if (!first || !second) return false;
      event.preventDefault();
      return updatePinch(
        event.currentTarget,
        { x: first.clientX, y: first.clientY },
        { x: second.clientX, y: second.clientY },
      );
    }
    const pan = panRef.current;
    const touch = Array.from(event.touches).find(
      (candidate) => candidate.identifier === pan?.pointerId,
    );
    if (!pan || !touch) return false;
    const deltaX = touch.clientX - pan.startX;
    const deltaY = touch.clientY - pan.startY;
    if (!pan.active && Math.hypot(deltaX, deltaY) < PAN_START_DISTANCE_PX) {
      return false;
    }
    if (!pan.active) {
      pan.active = true;
      suppressLegacyTouchUntilRef.current = Number.POSITIVE_INFINITY;
      beginVisualFeedback();
    }
    event.preventDefault();
    const zoom = controller.getSnapshot().ui.zoom;
    const nextPan = clampPlayerPan(
      { x: pan.startPanX + deltaX, y: pan.startPanY + deltaY },
      zoom.scale,
      pan.geometry,
    );
    controller.setZoomState({
      feedbackVisible: true,
      gestureActive: true,
      panX: nextPan.x,
      panY: nextPan.y,
    });
    return true;
  };

  const onTouchEnd = (event: TouchEvent<HTMLButtonElement>) => {
    if (legacyTouchIsPointerBacked()) return false;
    if (!pinchRef.current && !panRef.current?.active) {
      if (event.touches.length === 0) panRef.current = null;
      return false;
    }
    event.preventDefault();
    finishGesture();
    return true;
  };

  return {
    onPointerDown,
    onPointerEnd,
    onPointerMove,
    onTouchEnd,
    onTouchMove,
    onTouchStart,
    suppressLegacyTouch: () =>
      pinchRef.current !== null ||
      Boolean(panRef.current?.active) ||
      Date.now() < suppressLegacyTouchUntilRef.current,
  };
}
