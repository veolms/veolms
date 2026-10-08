import {
  useCallback,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
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
// Mouse: a press on the picture that is dragged zooms about the point that
// was pressed; with Shift held, it pans a zoomed picture instead. The drag
// has to start before the press would count as a long press, which belongs
// to the gesture surface, and it ends when the pointer leaves the player.
const MOUSE_DRAG_START_WINDOW_MS = 450;
/** Dragging this far from the pressed point doubles the zoom. */
const MOUSE_ZOOM_DRAG_PX_PER_DOUBLING = 120;

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

/**
 * A mouse press on the picture. Once it moves it becomes a drag that zooms
 * about the point that was pressed, growing with the distance dragged from
 * it. Pressed with Shift held, it pans the picture instead.
 */
interface MouseDragGesture {
  pointerId: number;
  pressedAt: number;
  root: HTMLElement;
  x: number;
  y: number;
  active: boolean;
  contentX: number;
  contentY: number;
  geometry: PlayerZoomGeometry;
  localX: number;
  localY: number;
  mode: "pan" | "zoom";
  startPanX: number;
  startPanY: number;
  startScale: number;
}

interface ZoomGestureHandlers {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerMove: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onPointerEnd: (event: ReactPointerEvent<HTMLElement>) => boolean;
  onTouchStart: (event: ReactTouchEvent<HTMLElement>) => boolean;
  onTouchMove: (event: ReactTouchEvent<HTMLElement>) => boolean;
  onTouchEnd: (event: ReactTouchEvent<HTMLElement>) => boolean;
  suppressLegacyTouch: () => boolean;
}

function distance(first: GesturePoint, second: GesturePoint): number {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first: GesturePoint, second: GesturePoint): GesturePoint {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function getPlayerRoot(element: HTMLElement): HTMLElement {
  return element.closest<HTMLElement>("[data-video-player-root]") ?? element;
}

function getGeometry(element: HTMLElement): PlayerZoomGeometry {
  const root = getPlayerRoot(element);
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
  element: HTMLElement,
  point: GesturePoint,
): GesturePoint {
  const root = getPlayerRoot(element);
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
  const mouseDragRef = useRef<MouseDragGesture | null>(null);
  // A drag that was ended early (the pointer left the player) still has a
  // release coming, which must not reach the surface as a click.
  const endedMouseDragPointerRef = useRef<number | null>(null);
  const hoveredRootRef = useRef<HTMLElement | null>(null);
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

  const recoverAbandonedPointerSession = useCallback(() => {
    const zoomGestureWasActive =
      pinchRef.current !== null ||
      Boolean(panRef.current?.active) ||
      controller.getSnapshot().ui.zoom.gestureActive;

    pointerPointsRef.current.clear();
    suppressedPointersRef.current.clear();
    pinchRef.current = null;
    panRef.current = null;
    suppressLegacyTouchUntilRef.current = Number.NEGATIVE_INFINITY;

    if (!zoomGestureWasActive) return;
    clearFeedbackTimer();
    clearTransitionTimer();
    controller.setZoomState({
      feedbackVisible: false,
      gestureActive: false,
      transitioning: false,
    });
    controller.setControlsVisible(true);
  }, [clearFeedbackTimer, clearTransitionTimer, controller]);

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

  const preparePan = useCallback(
    (element: HTMLElement, pointerId: number, point: GesturePoint) => {
      const zoom = controller.getSnapshot().ui.zoom;
      if (zoom.scale <= 1) {
        panRef.current = null;
        return;
      }
      panRef.current = {
        active: false,
        geometry: getGeometry(element),
        pointerId,
        startPanX: zoom.panX,
        startPanY: zoom.panY,
        startX: point.x,
        startY: point.y,
      };
    },
    [controller],
  );

  const beginPinch = useCallback(
    (element: HTMLElement, first: GesturePoint, second: GesturePoint) => {
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
    (element: HTMLElement, first: GesturePoint, second: GesturePoint) => {
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
      pointerPointsRef.current.clear();
      suppressedPointersRef.current.clear();
      pinchRef.current = null;
      panRef.current = null;
      mouseDragRef.current = null;
    },
    [clearFeedbackTimer, clearTransitionTimer],
  );

  // Shift over the picture offers the pan: an open hand, closed from the
  // moment the picture is pressed until it is let go. Set on the surface
  // itself, and as important, because host pages give buttons a cursor of
  // their own that a value inherited from the player would lose to.
  const syncPanCursor = useCallback((shiftKey: boolean) => {
    const surface = hoveredRootRef.current?.querySelector<HTMLElement>(
      "[data-player-zoom-surface]",
    );
    if (!surface) return;
    if (mouseDragRef.current?.mode === "pan") {
      surface.style.setProperty("cursor", "grabbing", "important");
    } else if (shiftKey) {
      surface.style.setProperty("cursor", "grab", "important");
    } else {
      surface.style.removeProperty("cursor");
    }
  }, []);

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Shift") syncPanCursor(event.type === "keydown");
    };
    window.addEventListener("keydown", handleKey);
    window.addEventListener("keyup", handleKey);
    return () => {
      window.removeEventListener("keydown", handleKey);
      window.removeEventListener("keyup", handleKey);
      hoveredRootRef.current
        ?.querySelector<HTMLElement>("[data-player-zoom-surface]")
        ?.style.removeProperty("cursor");
      hoveredRootRef.current = null;
    };
  }, [syncPanCursor]);

  // The drag is over the moment the pointer is outside the player or the
  // button is no longer down, whichever the page hears of first. The player
  // cannot count on being told: without pointer capture it gets no moves
  // from outside itself and no release that happens there, and the drag
  // would carry on when the pointer came back. So this listens on the
  // window, ahead of the player's own handlers.
  useEffect(() => {
    const endAbandonedMouseDrag = (event: PointerEvent) => {
      const drag = mouseDragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      const moving = event.type === "pointermove";
      const insidePlayer =
        event.target instanceof Node && drag.root.contains(event.target);
      // A release on the player is the ordinary end of the drag.
      if (!moving && insidePlayer) return;
      const bounds = drag.root.getBoundingClientRect();
      const stillDragging =
        moving &&
        (event.buttons & 1) === 1 &&
        event.clientX >= bounds.left &&
        event.clientX <= bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY <= bounds.bottom;
      if (stillDragging) return;
      mouseDragRef.current = null;
      if (drag.active) {
        // If the button is still down, its release must not count as a click.
        if (moving && (event.buttons & 1) === 1) {
          endedMouseDragPointerRef.current = drag.pointerId;
        }
        finishGesture();
      }
      syncPanCursor(event.shiftKey);
    };
    window.addEventListener("pointermove", endAbandonedMouseDrag, true);
    window.addEventListener("pointerup", endAbandonedMouseDrag, true);
    window.addEventListener("pointercancel", endAbandonedMouseDrag, true);
    return () => {
      window.removeEventListener("pointermove", endAbandonedMouseDrag, true);
      window.removeEventListener("pointerup", endAbandonedMouseDrag, true);
      window.removeEventListener("pointercancel", endAbandonedMouseDrag, true);
    };
  }, [finishGesture, syncPanCursor]);

  const onMousePointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    mouseDragRef.current = null;
    endedMouseDragPointerRef.current = null;
    const onSurface =
      event.target instanceof Element &&
      event.target.closest("[data-player-zoom-surface]") !== null;
    if (event.button !== 0 || !onSurface) return false;
    const press = {
      pointerId: event.pointerId,
      pressedAt: Date.now(),
      root: getPlayerRoot(event.currentTarget),
      x: event.clientX,
      y: event.clientY,
    };
    const zoom = controller.getSnapshot().ui.zoom;
    const geometry = getGeometry(event.currentTarget);
    const local = getLocalPoint(event.currentTarget, press);
    mouseDragRef.current = {
      ...press,
      active: false,
      contentX:
        (local.x - geometry.containerWidth / 2 - zoom.panX) / zoom.scale,
      contentY:
        (local.y - geometry.containerHeight / 2 - zoom.panY) / zoom.scale,
      geometry,
      localX: local.x,
      localY: local.y,
      mode: event.shiftKey ? "pan" : "zoom",
      startPanX: zoom.panX,
      startPanY: zoom.panY,
      startScale: zoom.scale,
    };
    hoveredRootRef.current = press.root;
    syncPanCursor(event.shiftKey);
    // The surface still sees this press: left unmoved, it is a click.
    return false;
  };

  const onMousePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    const root = getPlayerRoot(event.currentTarget);
    hoveredRootRef.current = root;
    const drag = mouseDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      syncPanCursor(event.shiftKey);
      return false;
    }
    const bounds = root.getBoundingClientRect();
    if (
      event.clientX < bounds.left ||
      event.clientX > bounds.right ||
      event.clientY < bounds.top ||
      event.clientY > bounds.bottom
    ) {
      // Out of the player: the drag is over, wherever the button is let go.
      mouseDragRef.current = null;
      syncPanCursor(event.shiftKey);
      if (!drag.active) return false;
      endedMouseDragPointerRef.current = drag.pointerId;
      finishGesture();
      return true;
    }
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.active && Math.hypot(deltaX, deltaY) < PAN_START_DISTANCE_PX) {
      return false;
    }
    if (!drag.active) {
      if (Date.now() - drag.pressedAt > MOUSE_DRAG_START_WINDOW_MS) {
        mouseDragRef.current = null;
        return false;
      }
      drag.active = true;
      beginVisualFeedback();
      syncPanCursor(event.shiftKey);
    }
    event.preventDefault();

    if (drag.mode === "pan") {
      const pan = clampPlayerPan(
        { x: drag.startPanX + deltaX, y: drag.startPanY + deltaY },
        drag.startScale,
        drag.geometry,
      );
      controller.setZoomState({
        feedbackVisible: true,
        gestureActive: true,
        panX: pan.x,
        panY: pan.y,
      });
      return true;
    }

    // The pressed point of the picture stays under the place it was pressed,
    // and the picture grows the further the pointer is dragged from it.
    const scale = clampPlayerZoom(
      drag.startScale *
        2 ** (Math.hypot(deltaX, deltaY) / MOUSE_ZOOM_DRAG_PX_PER_DOUBLING),
    );
    const pan = clampPlayerPan(
      {
        x:
          drag.localX -
          drag.geometry.containerWidth / 2 -
          drag.contentX * scale,
        y:
          drag.localY -
          drag.geometry.containerHeight / 2 -
          drag.contentY * scale,
      },
      scale,
      drag.geometry,
    );
    controller.setZoomState({
      feedbackVisible: true,
      gestureActive: true,
      panX: pan.x,
      panY: pan.y,
      scale,
      transitioning: false,
    });
    return true;
  };

  const onMousePointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = mouseDragRef.current;
    mouseDragRef.current = null;
    syncPanCursor(event.shiftKey);
    if (endedMouseDragPointerRef.current === event.pointerId) {
      endedMouseDragPointerRef.current = null;
      event.preventDefault();
      return true;
    }
    if (!drag?.active) return false;
    event.preventDefault();
    finishGesture();
    syncPanCursor(event.shiftKey);
    return true;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return onMousePointerDown(event);
    if (event.pointerType !== "touch") return false;
    if (
      event.isPrimary &&
      (pointerPointsRef.current.size > 0 ||
        pinchRef.current !== null ||
        panRef.current !== null)
    ) {
      recoverAbandonedPointerSession();
    }
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
      preparePan(event.currentTarget, event.pointerId, {
        x: event.clientX,
        y: event.clientY,
      });
    }
    return false;
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return onMousePointerMove(event);
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

  const onPointerEnd = (event: ReactPointerEvent<HTMLElement>) => {
    if (event.pointerType === "mouse") return onMousePointerEnd(event);
    if (event.pointerType !== "touch") return false;
    lastPointerEventAtRef.current = Date.now();
    const pinchWasActive = pinchRef.current !== null;
    const wasSuppressed = suppressedPointersRef.current.has(event.pointerId);
    pointerPointsRef.current.delete(event.pointerId);
    suppressedPointersRef.current.delete(event.pointerId);
    if (pinchWasActive) {
      event.preventDefault();
      finishGesture();
      const remainingPointer = pointerPointsRef.current.entries().next().value;
      if (remainingPointer) {
        preparePan(event.currentTarget, remainingPointer[0], {
          x: remainingPointer[1].x,
          y: remainingPointer[1].y,
        });
      }
      return true;
    }
    if (panRef.current?.active) {
      event.preventDefault();
      finishGesture();
      return true;
    }
    if (panRef.current?.pointerId === event.pointerId) panRef.current = null;
    return wasSuppressed;
  };

  const legacyTouchIsPointerBacked = () =>
    Date.now() - lastPointerEventAtRef.current < POINTER_TOUCH_DEDUPE_MS;

  const onTouchStart = (event: ReactTouchEvent<HTMLElement>) => {
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
      preparePan(event.currentTarget, touch.identifier, {
        x: touch.clientX,
        y: touch.clientY,
      });
    }
    return false;
  };

  const onTouchMove = (event: ReactTouchEvent<HTMLElement>) => {
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

  const onTouchEnd = (event: ReactTouchEvent<HTMLElement>) => {
    if (legacyTouchIsPointerBacked()) return false;
    if (pinchRef.current) {
      event.preventDefault();
      finishGesture();
      const remainingTouch = event.touches[0];
      if (remainingTouch) {
        preparePan(event.currentTarget, remainingTouch.identifier, {
          x: remainingTouch.clientX,
          y: remainingTouch.clientY,
        });
      }
      return true;
    }
    if (!panRef.current?.active) {
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
