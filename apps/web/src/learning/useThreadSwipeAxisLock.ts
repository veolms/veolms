import { useEffect } from "react";
import type { Swiper as SwiperInstance } from "swiper/types";

/** How far a finger travels before the gesture is given a direction. */
const AXIS_DECISION_DISTANCE = 10;
/** A gesture counts as vertical only when it is clearly steeper than this. */
const VERTICAL_STEEPNESS = 1.5;

/**
 * Keeps the phone thread drawer still while threads are swiped sideways.
 *
 * The drawer (Base UI) reads every touch move on the page in the capture
 * phase and starts dragging on the first pixel of vertical travel, because
 * the thread slides are not a native horizontal scroller it would yield to.
 * A sideways swipe that drifts a little up or down therefore moved the
 * drawer with it. This listener runs before the drawer's (window capture
 * comes before document capture) and, for gestures that start on the
 * slides, holds the moves back until the finger has travelled far enough to
 * tell the direction: a clearly vertical gesture is handed to the drawer,
 * anything else is kept from it for the rest of the touch. Swiper reads the
 * same touch moves on the document, so a move kept from the drawer is handed
 * to Swiper here directly.
 */
export function useThreadSwipeAxisLock(swiper: SwiperInstance | null) {
  useEffect(() => {
    const slidesElement = swiper?.el;
    if (!swiper || !slidesElement) return;
    const win = slidesElement.ownerDocument.defaultView;
    if (!win) return;

    let gesture: {
      startX: number;
      startY: number;
      axis: "x" | "y" | null;
    } | null = null;

    const handleTouchStart = (event: TouchEvent) => {
      const touch = event.touches[0];
      gesture =
        touch && event.touches.length === 1
          ? { startX: touch.clientX, startY: touch.clientY, axis: null }
          : null;
    };

    const handleTouchMove = (event: TouchEvent) => {
      const touch = event.touches[0];
      if (!gesture || !touch || event.touches.length !== 1) return;
      if (gesture.axis === null) {
        const dx = Math.abs(touch.clientX - gesture.startX);
        const dy = Math.abs(touch.clientY - gesture.startY);
        if (Math.max(dx, dy) >= AXIS_DECISION_DISTANCE) {
          gesture.axis = dy > dx * VERTICAL_STEEPNESS ? "y" : "x";
        }
      }
      if (gesture.axis === "y") return;
      event.stopPropagation();
      if (!swiper.destroyed) swiper.onTouchMove(event);
    };

    const endGesture = () => {
      gesture = null;
    };

    slidesElement.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    // Not passive: Swiper cancels the page's own scrolling once it moves.
    win.addEventListener("touchmove", handleTouchMove, {
      capture: true,
      passive: false,
    });
    win.addEventListener("touchend", endGesture, { capture: true });
    win.addEventListener("touchcancel", endGesture, { capture: true });
    return () => {
      slidesElement.removeEventListener("touchstart", handleTouchStart);
      win.removeEventListener("touchmove", handleTouchMove, { capture: true });
      win.removeEventListener("touchend", endGesture, { capture: true });
      win.removeEventListener("touchcancel", endGesture, { capture: true });
    };
  }, [swiper]);
}
