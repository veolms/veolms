import { useEffect, useState } from "react";
import { watchLayoutQuery } from "../../shell/phoneVideoFullscreenHold";

export type ComposerMode = "collapsed" | "desktop" | "mobile";

export const DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT = 0.62;
/** The tallest the phone composer opens, in pixels (see below). */
const DISCUSSION_COMPOSER_MAX_COLLAPSED_HEIGHT = 300;

export const getDiscussionComposerCollapsedSnapPoint = (
  viewportHeight: number,
  playerBottom: number | undefined,
) => {
  if (
    !Number.isFinite(viewportHeight) ||
    viewportHeight <= 0 ||
    playerBottom === undefined ||
    !Number.isFinite(playerBottom)
  ) {
    return DISCUSSION_COMPOSER_FALLBACK_SNAP_POINT;
  }

  // On a phone the composer opens under the video, no taller than a few
  // lines and its toolbar need: given the whole screen under the video, it
  // stood mostly empty. It is pulled up to the full screen for a long post.
  return Math.max(
    2,
    Math.min(
      DISCUSSION_COMPOSER_MAX_COLLAPSED_HEIGHT,
      Math.round(viewportHeight - Math.max(0, playerBottom)),
    ),
  );
};

export const getDiscussionComposerViewportGeometry = (
  layoutViewportHeight: number,
  visualViewportHeight: number,
  visualViewportOffsetTop: number,
  playerBottom: number | undefined,
) => {
  const resolvedLayoutViewportHeight =
    Number.isFinite(layoutViewportHeight) && layoutViewportHeight > 0
      ? layoutViewportHeight
      : visualViewportHeight;
  const rawVisualViewportHeight =
    Number.isFinite(visualViewportHeight) && visualViewportHeight > 0
      ? visualViewportHeight
      : resolvedLayoutViewportHeight;
  const resolvedVisualViewportHeight = Math.min(
    resolvedLayoutViewportHeight,
    rawVisualViewportHeight,
  );
  const resolvedVisualViewportOffsetTop = Math.min(
    Math.max(
      0,
      Number.isFinite(visualViewportOffsetTop) ? visualViewportOffsetTop : 0,
    ),
    Math.max(0, resolvedLayoutViewportHeight - resolvedVisualViewportHeight),
  );
  const visualViewportBottom =
    resolvedVisualViewportOffsetTop + resolvedVisualViewportHeight;

  return {
    collapsedSnapPoint: getDiscussionComposerCollapsedSnapPoint(
      visualViewportBottom,
      playerBottom,
    ),
    keyboardInset: Math.max(
      0,
      Math.round(resolvedLayoutViewportHeight - visualViewportBottom),
    ),
    visualViewportHeight: Math.max(2, Math.round(resolvedVisualViewportHeight)),
  };
};

export function usePhoneComposerLayout() {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(max-width: 640px)");
    const sync = () => setIsPhone(media.matches);
    sync();
    return watchLayoutQuery(media, sync);
  }, []);

  return isPhone;
}
