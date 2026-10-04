import { useCallback, useRef, type MouseEvent } from "react";

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

/**
 * Returns a click handler for a container that fires `onDoubleTap` only when
 * both taps land on the container's empty space, never on its controls.
 */
export function useEmptyAreaDoubleTap(onDoubleTap: () => void) {
  const onDoubleTapRef = useRef(onDoubleTap);
  onDoubleTapRef.current = onDoubleTap;
  const previousTapRef = useRef<PreviousTap | null>(null);

  return useCallback((event: MouseEvent<HTMLElement>) => {
    const target = event.target;
    if (
      event.button !== 0 ||
      !(target instanceof Element) ||
      target.closest(OCCUPIED_AREA_SELECTOR)
    ) {
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
}
