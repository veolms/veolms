import type { ApplicationScrollPosition } from "../shell/applicationScroll";

export interface NavigationOptions {
  captureScroll?: boolean;
  canRestoreScroll?: (position: ApplicationScrollPosition) => boolean;
  preserveScroll?: boolean;
  resetScroll?: boolean;
  /**
   * Opens the destination at this position instead of the one remembered for
   * it, and instead of any reset the destination would otherwise get.
   */
  scrollPosition?: ApplicationScrollPosition;
  /**
   * Picks where the destination opens, given the position remembered for it
   * (if any), instead of that position or the top. Called when the
   * navigation starts, so it can read the page as it is.
   */
  chooseScrollPosition?: (
    remembered: ApplicationScrollPosition | undefined,
  ) => ApplicationScrollPosition;
  scrollRestorationKey?: string;
  sourceScrollRestorationKey?: string;
  /**
   * Where the page being left was scrolled, read by the caller before it
   * changed the page. Reading it after such a change forces a style and
   * layout pass of the whole page there and then (1.7 s on a slow
   * computer when the mini player opens its lesson, 2026-11-15).
   */
  sourceScrollPosition?: ApplicationScrollPosition;
  exact?: boolean;
  replace?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
