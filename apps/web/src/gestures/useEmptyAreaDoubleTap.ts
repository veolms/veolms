import { useCallback, useMemo, useRef, type MouseEvent } from "react";

const MAX_TAP_GAP_MS = 400;
const MAX_TAP_DISTANCE_PX = 32;
const OCCUPIED_AREA_SELECTOR = [
  "button",
  "a",
  "input",
  "select",
  "textarea",
  "label",
  "[tabindex]",
  "[role='menu']",
  "[role='dialog']",
  "[role='separator']",
  "[data-double-tap-ignore]",
].join(",");

interface PreviousTap {
  x: number;
  y: number;
  at: number;
}

// Only controls inside the container count; its ancestors (e.g. a focusable
// dialog wrapper) must not mark the whole area as occupied.
function isEmptyAreaEvent(event: MouseEvent<HTMLElement>) {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  const container = event.currentTarget;
  const occupied = target.closest(OCCUPIED_AREA_SELECTOR);
  return !occupied || occupied === container || !container.contains(occupied);
}

/**
 * Returns handlers for a container that fires `onDoubleTap` only when
 * both taps land on the container's empty space, never on its controls.
 */
export function useEmptyAreaDoubleTap(onDoubleTap: () => void) {
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;
  const previousTapRef = useRef<PreviousTap | null>(null);

  const onClick = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.button !== 0 || !isEmptyAreaEvent(event)) {
      previousTapRef.current = null;
      return;
    }

    const previousTap = previousTapRef.current;
    const tap = { x: event.clientX, y: event.clientY, at: event.timeStamp };
    if (
      !previousTap ||
      tap.at - previousTap.at > MAX_TAP_GAP_MS ||
      Math.hypot(tap.x - previousTap.x, tap.y - previousTap.y) >
        MAX_TAP_DISTANCE_PX
    ) {
      previousTapRef.current = tap;
      return;
    }

    previousTapRef.current = null;
    onDoubleTapRef.current();
  }, []);

  // A repeated press would otherwise select the nearest text.
  const onMouseDown = useCallback((event: MouseEvent<HTMLElement>) => {
    if (event.detail > 1 && isEmptyAreaEvent(event)) event.preventDefault();
  }, []);

  return useMemo(() => ({ onClick, onMouseDown }), [onClick, onMouseDown]);
}
