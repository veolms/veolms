import { useEffect, useRef, type RefObject } from "react";

/** Past this share of the sheet's height, letting go closes it. */
const CLOSE_DISTANCE_RATIO = 0.25;
/** A flick this fast (px per ms) closes it from any distance. */
const CLOSE_SPEED = 0.45;
/** Movement before the gesture is read as a drag (or left to the page). */
const SLOP_PX = 8;
// The app's drawers leave the same way (see components/ui/drawerSwipeClose):
// the time follows the distance still to travel, on an ease-out cubic.
const CLOSE_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
const CLOSE_SPEED_PX_PER_MS = 6;
const CLOSE_MIN_MS = 80;
const CLOSE_MAX_MS = 140;
const SETTLE = "200ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * WhatsApp's bottom sheet: dragged down (on the handle or anywhere on it
 * while its content is scrolled to the top), it follows the finger and the
 * backdrop clears; let go past a quarter of its height or with a flick and
 * it slides away and closes, else it settles back. A drag that starts
 * sideways or upwards, or inside content scrolled down, is left alone.
 */
export function useSwipeDownToClose({
  sheetRef,
  backdropRef,
  backdropAlpha,
  enabled,
  onClose,
}: {
  sheetRef: RefObject<HTMLElement | null>;
  /** Its dim colour clears as the sheet goes down. */
  backdropRef?: RefObject<HTMLElement | null>;
  /** The backdrop's black at rest (0-1). */
  backdropAlpha?: number;
  enabled: boolean;
  onClose: () => void;
}) {
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!enabled || !sheet) return;
    const backdrop = backdropRef?.current ?? null;

    let tracking = false;
    let dragging = false;
    let startX = 0;
    let startY = 0;
    let lastY = 0;
    let lastAt = 0;
    let speed = 0;
    let closing = false;

    const place = (offset: number, transition: string) => {
      sheet.style.transition =
        transition === "none" ? "none" : `transform ${transition}`;
      sheet.style.transform =
        offset > 0 ? `translate3d(0, ${offset}px, 0)` : "";
      if (backdrop && backdropAlpha !== undefined) {
        const left = 1 - Math.min(1, offset / Math.max(1, sheet.offsetHeight));
        backdrop.style.transition =
          transition === "none" ? "none" : `background-color ${transition}`;
        backdrop.style.backgroundColor = `rgb(0 0 0 / ${backdropAlpha * left})`;
      }
    };

    const onStart = (event: TouchEvent) => {
      if (closing || event.touches.length !== 1) {
        tracking = false;
        return;
      }
      const touch = event.touches[0]!;
      tracking = true;
      dragging = false;
      startX = touch.clientX;
      startY = lastY = touch.clientY;
      lastAt = event.timeStamp;
      speed = 0;
    };

    const onMove = (event: TouchEvent) => {
      if (!tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dy = touch.clientY - startY;
      const dx = touch.clientX - startX;
      if (!dragging) {
        if (Math.abs(dy) < SLOP_PX && Math.abs(dx) < SLOP_PX) return;
        // Down, more down than sideways, with the content at its top: the
        // sheet's. Anything else scrolls or is a tap.
        if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || sheet.scrollTop > 0) {
          tracking = false;
          return;
        }
        dragging = true;
      }
      event.preventDefault();
      const elapsed = Math.max(1, event.timeStamp - lastAt);
      speed = (touch.clientY - lastY) / elapsed;
      lastY = touch.clientY;
      lastAt = event.timeStamp;
      place(Math.max(0, dy), "none");
    };

    const onEnd = () => {
      if (!tracking) return;
      tracking = false;
      if (!dragging) return;
      dragging = false;
      const offset = Math.max(0, lastY - startY);
      const height = sheet.offsetHeight;
      if (
        offset > height * CLOSE_DISTANCE_RATIO ||
        (speed > CLOSE_SPEED && offset > SLOP_PX * 2)
      ) {
        closing = true;
        const duration = Math.min(
          CLOSE_MAX_MS,
          Math.max(CLOSE_MIN_MS, (height - offset) / CLOSE_SPEED_PX_PER_MS),
        );
        place(height, `${duration}ms ${CLOSE_EASING}`);
        window.setTimeout(() => onCloseRef.current(), duration);
        return;
      }
      place(0, SETTLE);
    };

    sheet.addEventListener("touchstart", onStart, { passive: true });
    sheet.addEventListener("touchmove", onMove, { passive: false });
    sheet.addEventListener("touchend", onEnd);
    sheet.addEventListener("touchcancel", onEnd);
    return () => {
      sheet.removeEventListener("touchstart", onStart);
      sheet.removeEventListener("touchmove", onMove);
      sheet.removeEventListener("touchend", onEnd);
      sheet.removeEventListener("touchcancel", onEnd);
    };
  }, [backdropAlpha, backdropRef, enabled, sheetRef]);
}
