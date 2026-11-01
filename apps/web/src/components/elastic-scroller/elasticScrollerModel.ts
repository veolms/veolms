export type ScrollDirection = "up" | "down";
export type ElasticScrollMode = "idle" | "edge" | "drag" | "locked";

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
/**
 * How near an edge counts as being at it. `scrollTop` is fractional while
 * `scrollHeight` and `clientHeight` are whole numbers, so a scrollport that
 * is scrolled as far as it goes can still read up to a pixel short of its
 * end (the phone lessons sheet reads 0.6px short): within 1px is at it.
 */
const SCROLL_EDGE_THRESHOLD = 1;

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

/**
 * How far the ends of the stretched control may go from where it rests,
 * up and down, before they would leave what can be seen of the scrollport.
 */
export interface ElasticScrollDragRoom {
  above: number;
  below: number;
}

/** Room kept between an end of the control and the edge it stops at. */
export const ELASTIC_SCROLL_CONTROL_EDGE_INSET = 28;

/**
 * Where the button and the socket stand, in px below where the control
 * rests. Stretched, they part evenly: the button with the pointer, the
 * socket as far the other way. An end that would pass an edge of what can
 * be seen stops at it, and the other end goes on in its own direction by
 * as much, so the control keeps its length (and its speed is still read
 * from how far it is pulled) until that end reaches the other edge too.
 */
export const getElasticScrollEndPositions = (
  dragOffset: number,
  room: ElasticScrollDragRoom | null,
) => {
  if (!room || room.above < 0 || room.below < 0) {
    return { button: dragOffset, socket: -dragOffset };
  }
  const top = -room.above;
  const bottom = room.below;
  // Both ends move by `shift`: first so the socket stays in sight, then so
  // the button does (when the two cannot both fit, the button wins, as it
  // is under the pointer, and the socket is held at its edge).
  let shift = 0;
  if (-dragOffset + shift > bottom) shift = bottom + dragOffset;
  else if (-dragOffset + shift < top) shift = top + dragOffset;
  if (dragOffset + shift > bottom) shift = bottom - dragOffset;
  else if (dragOffset + shift < top) shift = top - dragOffset;
  return {
    button: clamp(dragOffset + shift, top, bottom),
    socket: clamp(-dragOffset + shift, top, bottom),
  };
};
