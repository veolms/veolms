export const POINTER_GESTURE_CLAIM_EVENT = "veolms:pointer-gesture-claim";
export const DRAWER_SWIPE_THROUGH_VIEWPORT_CLASS =
  "drawer-swipe-through-viewport";

export const isDrawerSwipeThroughViewportTarget = (
  target: EventTarget | null,
) =>
  target instanceof Element &&
  target.classList.contains(DRAWER_SWIPE_THROUGH_VIEWPORT_CLASS);

export const isPointerInsideElementBounds = (
  element: Element | null,
  point: { clientX: number; clientY: number },
) => {
  if (!element) return false;
  const bounds = element.getBoundingClientRect();
  return (
    point.clientX >= bounds.left &&
    point.clientX <= bounds.right &&
    point.clientY >= bounds.top &&
    point.clientY <= bounds.bottom
  );
};

export const isFullLearningPlayerSwipeTarget = (
  target: EventTarget | null,
  point: { clientX: number; clientY: number },
  playerAnchor: Element | null,
) => {
  if (!isPointerInsideElementBounds(playerAnchor, point)) return false;
  if (!(target instanceof Element)) return false;

  return (
    isDrawerSwipeThroughViewportTarget(target) ||
    target.closest(
      "[data-learning-persistent-player]:not([data-learning-mini-player])",
    ) !== null
  );
};

/**
 * How much of the video, from its top, starts a sideways swipe that opens or
 * closes the side menu or the course content. The rest, along the bottom,
 * holds the timeline: a thumb slipping sideways while seeking there must not
 * move a panel.
 */
export const VIDEO_PANEL_SWIPE_AREA_FROM_TOP = 0.7;

/** True for a touch on the bottom of a video, where panel swipes never start. */
export const isVideoTimelineSwipeZone = (
  target: EventTarget | null,
  point: { clientY: number },
) => {
  if (!(target instanceof Element)) return false;
  const video = target.closest("[data-video-player-root]");
  if (!video) return false;
  const bounds = video.getBoundingClientRect();
  return (
    point.clientY > bounds.top + bounds.height * VIDEO_PANEL_SWIPE_AREA_FROM_TOP
  );
};

export const getLearningPlayerSwipeSplitX = (playerAnchor: Element) => {
  const playerBounds = playerAnchor.getBoundingClientRect();
  const courseDrawer = document.querySelector(
    '[data-slot="drawer-popup"][aria-label="Course lessons"]',
  );
  const drawerBounds = courseDrawer?.getBoundingClientRect();
  const visibleRight =
    drawerBounds &&
    drawerBounds.left > playerBounds.left &&
    drawerBounds.left < playerBounds.right
      ? drawerBounds.left
      : playerBounds.right;

  return playerBounds.left + Math.max(0, visibleRight - playerBounds.left) / 2;
};

export interface PointerGestureClaim {
  owner: "curriculum";
  pointerId: number;
}

export const claimPointerGesture = (claim: PointerGestureClaim) => {
  window.dispatchEvent(
    new CustomEvent<PointerGestureClaim>(POINTER_GESTURE_CLAIM_EVENT, {
      detail: claim,
    }),
  );
};

export const subscribeToPointerGestureClaims = (
  listener: (claim: PointerGestureClaim) => void,
) => {
  const handleClaim = (event: Event) => {
    const detail = (event as CustomEvent<PointerGestureClaim>).detail;
    if (detail?.owner !== "curriculum" || !Number.isInteger(detail.pointerId))
      return;
    listener(detail);
  };

  window.addEventListener(POINTER_GESTURE_CLAIM_EVENT, handleClaim);
  return () =>
    window.removeEventListener(POINTER_GESTURE_CLAIM_EVENT, handleClaim);
};
