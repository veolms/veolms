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
  scrollRestorationKey?: string;
  sourceScrollRestorationKey?: string;
  exact?: boolean;
  replace?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
