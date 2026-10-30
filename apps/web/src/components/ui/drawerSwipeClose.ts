// Base UI slides a swiped-away drawer out over `strength * 160ms`, where the
// strength comes from the release speed, and it starts that transition before
// the strength is applied, so every swipe close ran 160ms. Measured against
// YouTube's description sheet (2026-10-15, ~90 Hz phone recording): it leaves
// in about 55ms on an ease-out, starting fast and settling into the edge.
// Bottom (and top) sheets here do the same: the time follows the distance
// still to travel, a little longer than YouTube's so a 60 Hz screen still
// draws several frames of it, on an ease-out cubic.
const SWIPE_CLOSE_EASING = "cubic-bezier(0.33, 1, 0.68, 1)";
const SWIPE_CLOSE_SPEED = 6; // px per ms of distance left
const SWIPE_CLOSE_MIN_DURATION = 80;
const SWIPE_CLOSE_MAX_DURATION = 140;

function retimeTransitions(
  element: Element | null | undefined,
  duration: number,
  easing?: string,
) {
  for (const animation of element?.getAnimations() ?? []) {
    if (!(animation instanceof CSSTransition)) continue;
    if (animation.transitionProperty === "transform")
      animation.effect?.updateTiming(
        easing ? { duration, easing } : { duration },
      );
    else if (animation.transitionProperty === "opacity")
      animation.effect?.updateTiming({ duration });
  }
}

/**
 * Called when a swipe dismisses a drawer, after Base UI has started its close
 * transition. On the next frame, before that frame's own style and layout
 * work (reading the sheet's box during the touchend task forced an extra
 * layout), retimes the popup's slide and the backdrop's fade for vertical
 * sheets; side drawers keep Base UI's timing.
 */
export function speedUpSwipeClose(event: Event | undefined) {
  const target = event?.target;
  const popup =
    target instanceof Element
      ? target.closest<HTMLElement>('[data-slot="drawer-popup"]')
      : null;
  if (!popup?.hasAttribute("data-ending-style")) return;
  const direction = popup.getAttribute("data-swipe-direction");
  if (direction !== "down" && direction !== "up") return;

  window.requestAnimationFrame(() => {
    if (!popup.isConnected) return;
    const rect = popup.getBoundingClientRect();
    const distanceLeft =
      direction === "down" ? window.innerHeight - rect.top : rect.bottom;
    const duration = Math.min(
      SWIPE_CLOSE_MAX_DURATION,
      Math.max(SWIPE_CLOSE_MIN_DURATION, distanceLeft / SWIPE_CLOSE_SPEED),
    );
    retimeTransitions(popup, duration, SWIPE_CLOSE_EASING);
    // The backdrop's fade starts with Base UI's closed render; it finishes
    // with the sheet.
    retimeTransitions(
      popup
        .closest('[data-slot="drawer-viewport"]')
        ?.parentElement?.querySelector('[data-slot="drawer-overlay"]'),
      duration,
    );
  });
}
