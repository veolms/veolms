export type ScrollDirection = "up" | "down";
export type ElasticScrollMode = "idle" | "edge" | "drag" | "locked";

export const ELASTIC_SCROLL_CONTROL_IDLE_DELAY_MS = 2400;
export const ELASTIC_SCROLL_CONTROL_LONG_PRESS_DELAY_MS = 360;
export const ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE = 4;
export const ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE = 192;
export const ELASTIC_SCROLL_CONTROL_INLINE_MAX_DISTANCE = 56;
export const ELASTIC_SCROLL_CONTROL_LOCK_THRESHOLD = 50;
export const ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS = 17.5;
export const ELASTIC_SCROLL_CONTROL_PROGRESS_CIRCUMFERENCE =
  2 * Math.PI * ELASTIC_SCROLL_CONTROL_PROGRESS_RADIUS;

const ELASTIC_SCROLL_CONTROL_DRAG_BASE_SPEED = 56;
const ELASTIC_SCROLL_CONTROL_DRAG_MID_SPEED = 2800;
const ELASTIC_SCROLL_CONTROL_DRAG_MID_DISTANCE =
  ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE / 2;
const ELASTIC_SCROLL_CONTROL_DRAG_MAX_SPEED = 5600;
const SCROLL_EDGE_THRESHOLD = 0.5;

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

export const getElasticScrollSpeed = (pointerDistance: number) => {
  if (
    !Number.isFinite(pointerDistance) ||
    pointerDistance <= ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE
  ) {
    return 0;
  }

  if (pointerDistance <= ELASTIC_SCROLL_CONTROL_DRAG_MID_DISTANCE) {
    const normalizedDistance =
      (pointerDistance - ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE) /
      (ELASTIC_SCROLL_CONTROL_DRAG_MID_DISTANCE -
        ELASTIC_SCROLL_CONTROL_DRAG_DEAD_ZONE);
    const easedDistance = Math.pow(normalizedDistance, 1.45);

    return (
      ELASTIC_SCROLL_CONTROL_DRAG_BASE_SPEED +
      (ELASTIC_SCROLL_CONTROL_DRAG_MID_SPEED -
        ELASTIC_SCROLL_CONTROL_DRAG_BASE_SPEED) *
        easedDistance
    );
  }

  const extendedDistance = clamp(
    (pointerDistance - ELASTIC_SCROLL_CONTROL_DRAG_MID_DISTANCE) /
      (ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE -
        ELASTIC_SCROLL_CONTROL_DRAG_MID_DISTANCE),
    0,
    1,
  );

  return (
    ELASTIC_SCROLL_CONTROL_DRAG_MID_SPEED +
    (ELASTIC_SCROLL_CONTROL_DRAG_MAX_SPEED -
      ELASTIC_SCROLL_CONTROL_DRAG_MID_SPEED) *
      Math.pow(extendedDistance, 1.2)
  );
};

export const getScrollDirectionAtEdge = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  fallbackDirection: ScrollDirection,
): ScrollDirection => {
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) {
    return fallbackDirection;
  }

  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (maximumScrollTop <= SCROLL_EDGE_THRESHOLD) {
    return fallbackDirection;
  }
  if (scrollTop <= SCROLL_EDGE_THRESHOLD) return "down";
  if (scrollTop >= maximumScrollTop - SCROLL_EDGE_THRESHOLD) {
    return "up";
  }
  return fallbackDirection;
};

export const getScrollProgress = (
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
) => {
  if (![scrollTop, scrollHeight, clientHeight].every(Number.isFinite)) return 0;

  const maximumScrollTop = Math.max(0, scrollHeight - clientHeight);
  if (maximumScrollTop <= SCROLL_EDGE_THRESHOLD) return 0;
  return clamp(scrollTop / maximumScrollTop, 0, 1);
};

export const getElasticScrollDragIntensity = (dragOffset: number) =>
  clamp(Math.abs(dragOffset) / ELASTIC_SCROLL_CONTROL_DRAG_MAX_DISTANCE, 0, 1);
