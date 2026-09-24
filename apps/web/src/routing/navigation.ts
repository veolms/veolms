import type { ApplicationScrollPosition } from "../shell/applicationScroll";

export interface NavigationOptions {
  captureScroll?: boolean;
  canRestoreScroll?: (position: ApplicationScrollPosition) => boolean;
  preserveScroll?: boolean;
  resetScroll?: boolean;
  scrollRestorationKey?: string;
  sourceScrollRestorationKey?: string;
  exact?: boolean;
  skipAutosync?: boolean;
  replace?: boolean;
}

export type NavigateTo = (
  destination: string,
  options?: NavigationOptions,
) => void;
