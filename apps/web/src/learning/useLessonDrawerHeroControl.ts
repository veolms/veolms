import { useEffect, useRef } from "react";
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from "react";

const GESTURE_ACTIVATION_DISTANCE = 10;
const GESTURE_DIRECTION_RATIO = 1.15;
const GESTURE_COMMIT_DISTANCE = 48;
const CLICK_SUPPRESSION_DURATION = 450;
const WHEEL_COMMIT_DISTANCE = 36;
const WHEEL_GESTURE_GAP = 180;
const WHEEL_ACTION_COOLDOWN = 320;

const WHEEL_CONTROL_EXCLUSION_SELECTOR = [
  "input",
  "textarea",
  "select",
  '[contenteditable="true"]',
].join(",");

interface LessonDrawerGesture {
  source: "mouse" | "pointer" | "touch";
  id: number;
  startX: number;
  startY: number;
  lastY: number;
  active: boolean;
  cancelled: boolean;
  expandedAtStart: boolean;
}

interface WheelGesture {
  direction: number;
  distance: number;
  lastEventAt: number;
  lockedUntil: number;
}

interface UseLessonDrawerHeroControlOptions {
  open: boolean;
  expanded: boolean;
  onExpand: () => void;
  onCollapse: () => void;
  onClose: () => void;
}

export interface LessonDrawerHeroControlProps {
  "data-base-ui-swipe-ignore": "";
  "data-learning-swipe-ignore": "";
  "data-lesson-drawer-gesture-control": "";
  "data-sidebar-swipe-ignore": "";
  style: CSSProperties;
  onClickCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseDownCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseMoveCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onMouseUpCapture: (event: ReactMouseEvent<HTMLDivElement>) => void;
  onPointerDownCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerMoveCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerUpCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onPointerCancelCapture: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onTouchStartCapture: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchMoveCapture: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchEndCapture: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onTouchCancelCapture: (event: ReactTouchEvent<HTMLDivElement>) => void;
  onWheelCapture: (event: ReactWheelEvent<HTMLDivElement>) => void;
}

export interface LessonDrawerViewportBounds {
  left: number;
  width: number;
}

export const LESSON_DRAWER_MAX_TABLET_WIDTH = 500;
export const LESSON_DRAWER_TABLET_GUTTER = 12;

export function getSideLessonDrawerBounds(
  playerBounds: Pick<DOMRect, "left" | "width">,
  viewportWidth: number,
): LessonDrawerViewportBounds | null {
  if (
    !Number.isFinite(playerBounds.left) ||
    !Number.isFinite(playerBounds.width) ||
    !Number.isFinite(viewportWidth) ||
    playerBounds.width <= 0 ||
    viewportWidth <= 0
  ) {
    return null;
  }

  const visibleLeft = Math.max(0, playerBounds.left);
  const visibleRight = Math.min(
    viewportWidth,
    playerBounds.left + playerBounds.width,
  );
  const visibleWidth = Math.max(0, visibleRight - visibleLeft);
  const width = Math.min(
    LESSON_DRAWER_MAX_TABLET_WIDTH,
    Math.max(0, visibleWidth - LESSON_DRAWER_TABLET_GUTTER * 2),
  );

  if (width <= 0) return null;

  return {
    left: visibleRight - LESSON_DRAWER_TABLET_GUTTER - width,
    width,
  };
}

const findTouch = (touches: ReactTouchEvent["touches"], identifier: number) =>
  Array.from(touches).find((touch) => touch.identifier === identifier);

const isWheelControlExcludedTarget = (target: EventTarget | null) =>
  target instanceof Element &&
  Boolean(target.closest(WHEEL_CONTROL_EXCLUSION_SELECTOR));

export function useLessonDrawerHeroControl({
  open,
  expanded,
  onExpand,
  onCollapse,
  onClose,
}: UseLessonDrawerHeroControlOptions): LessonDrawerHeroControlProps {
  const gestureRef = useRef<LessonDrawerGesture | null>(null);
  const suppressClickUntilRef = useRef(0);
  const wheelResetTimerRef = useRef<number | null>(null);
  const wheelGestureRef = useRef<WheelGesture>({
    direction: 0,
    distance: 0,
    lastEventAt: 0,
    lockedUntil: 0,
  });
  const optionsRef = useRef({ open, expanded, onExpand, onCollapse, onClose });
  optionsRef.current = { open, expanded, onExpand, onCollapse, onClose };

  useEffect(
    () => () => {
      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
    },
    [],
  );

  const beginGesture = (
    source: LessonDrawerGesture["source"],
    id: number,
    clientX: number,
    clientY: number,
  ) => {
    if (!optionsRef.current.open || gestureRef.current) return;
    gestureRef.current = {
      source,
      id,
      startX: clientX,
      startY: clientY,
      lastY: clientY,
      active: false,
      cancelled: false,
      expandedAtStart: optionsRef.current.expanded,
    };
  };

  const updateGesture = (
    source: LessonDrawerGesture["source"],
    id: number,
    clientX: number,
    clientY: number,
  ) => {
    const gesture = gestureRef.current;
    if (
      !gesture ||
      gesture.source !== source ||
      gesture.id !== id ||
      gesture.cancelled
    ) {
      return false;
    }

    const deltaX = clientX - gesture.startX;
    const deltaY = clientY - gesture.startY;
    gesture.lastY = clientY;

    if (!gesture.active) {
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);
      if (
        horizontalDistance < GESTURE_ACTIVATION_DISTANCE &&
        verticalDistance < GESTURE_ACTIVATION_DISTANCE
      ) {
        return false;
      }
      if (verticalDistance < horizontalDistance * GESTURE_DIRECTION_RATIO) {
        gesture.cancelled = true;
        return false;
      }
      if (verticalDistance < GESTURE_ACTIVATION_DISTANCE) return false;
      gesture.active = true;
    }

    return true;
  };

  const finishGesture = (
    source: LessonDrawerGesture["source"],
    id: number,
    clientY: number,
  ) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.source !== source || gesture.id !== id) {
      return false;
    }

    gestureRef.current = null;
    if (!gesture.active || gesture.cancelled) return false;

    suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESSION_DURATION;
    const deltaY = clientY - gesture.startY;
    if (deltaY <= -GESTURE_COMMIT_DISTANCE) {
      optionsRef.current.onExpand();
    } else if (deltaY >= GESTURE_COMMIT_DISTANCE) {
      if (gesture.expandedAtStart) optionsRef.current.onCollapse();
      else optionsRef.current.onClose();
    }

    return true;
  };

  const cancelGesture = (source: LessonDrawerGesture["source"], id: number) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.source !== source || gesture.id !== id)
      return false;
    gestureRef.current = null;
    if (!gesture.active) return false;
    suppressClickUntilRef.current = Date.now() + CLICK_SUPPRESSION_DURATION;
    return true;
  };

  return {
    "data-base-ui-swipe-ignore": "",
    "data-learning-swipe-ignore": "",
    "data-lesson-drawer-gesture-control": "",
    "data-sidebar-swipe-ignore": "",
    style: { touchAction: "none" },
    onClickCapture: (event) => {
      if (Date.now() >= suppressClickUntilRef.current) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onMouseDownCapture: (event) => {
      if (event.button !== 0) return;
      beginGesture("mouse", 0, event.clientX, event.clientY);
    },
    onMouseMoveCapture: (event) => {
      if (gestureRef.current?.source !== "mouse" || event.buttons !== 1) return;
      if (!updateGesture("mouse", 0, event.clientX, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onMouseUpCapture: (event) => {
      if (gestureRef.current?.source !== "mouse") return;
      if (!finishGesture("mouse", 0, event.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onPointerDownCapture: (event) => {
      if (event.pointerType === "touch" || event.button !== 0) return;
      beginGesture("pointer", event.pointerId, event.clientX, event.clientY);
    },
    onPointerMoveCapture: (event) => {
      if (event.pointerType === "touch") return;
      if (
        !updateGesture("pointer", event.pointerId, event.clientX, event.clientY)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
    },
    onPointerUpCapture: (event) => {
      if (event.pointerType === "touch") return;
      const consumed = finishGesture("pointer", event.pointerId, event.clientY);
      if (!consumed) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    },
    onPointerCancelCapture: (event) => {
      if (event.pointerType === "touch") return;
      if (!cancelGesture("pointer", event.pointerId)) return;
      event.stopPropagation();
    },
    onTouchStartCapture: (event) => {
      if (event.touches.length !== 1) return;
      const [touch] = Array.from(event.touches);
      if (!touch) return;
      beginGesture("touch", touch.identifier, touch.clientX, touch.clientY);
    },
    onTouchMoveCapture: (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.source !== "touch") return;
      const touch = findTouch(event.touches, gesture.id);
      if (
        !touch ||
        !updateGesture("touch", gesture.id, touch.clientX, touch.clientY)
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
    },
    onTouchEndCapture: (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.source !== "touch") return;
      const touch = findTouch(event.changedTouches, gesture.id);
      if (!touch || !finishGesture("touch", gesture.id, touch.clientY)) return;
      event.preventDefault();
      event.stopPropagation();
    },
    onTouchCancelCapture: (event) => {
      const gesture = gestureRef.current;
      if (!gesture || gesture.source !== "touch") return;
      if (!cancelGesture("touch", gesture.id)) return;
      event.stopPropagation();
    },
    onWheelCapture: (event) => {
      if (
        !optionsRef.current.open ||
        isWheelControlExcludedTarget(event.target) ||
        Math.abs(event.deltaY) <= Math.abs(event.deltaX)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      const now = Date.now();
      const wheelGesture = wheelGestureRef.current;
      if (now < wheelGesture.lockedUntil) return;

      const direction = Math.sign(event.deltaY);
      const multiplier =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? window.innerHeight
            : 1;
      const distance = Math.abs(event.deltaY * multiplier);
      if (
        direction !== wheelGesture.direction ||
        now - wheelGesture.lastEventAt > WHEEL_GESTURE_GAP
      ) {
        wheelGesture.direction = direction;
        wheelGesture.distance = 0;
      }
      wheelGesture.distance += distance;
      wheelGesture.lastEventAt = now;

      if (wheelResetTimerRef.current !== null) {
        window.clearTimeout(wheelResetTimerRef.current);
      }
      wheelResetTimerRef.current = window.setTimeout(() => {
        wheelGesture.distance = 0;
        wheelGesture.direction = 0;
        wheelResetTimerRef.current = null;
      }, WHEEL_GESTURE_GAP);

      if (wheelGesture.distance < WHEEL_COMMIT_DISTANCE) return;
      wheelGesture.distance = 0;
      wheelGesture.lockedUntil = now + WHEEL_ACTION_COOLDOWN;
      if (direction > 0) {
        optionsRef.current.onExpand();
      } else if (optionsRef.current.expanded) {
        optionsRef.current.onCollapse();
      } else {
        optionsRef.current.onClose();
      }
    },
  };
}
