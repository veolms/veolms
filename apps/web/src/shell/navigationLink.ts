import type { MouseEvent } from "react";

/**
 * Whether a click on a link should be left to the browser: a click with
 * Ctrl, ⌘, Shift or Alt held (open in a new tab or window, download), or
 * any button but the main one. A middle click fires `auxclick`, not
 * `click`, so it never reaches here and opens a new tab by itself.
 */
export function leavesClickToBrowser(event: MouseEvent<HTMLElement>): boolean {
  return (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  );
}

/**
 * The address a menu item links to, or undefined when its destination is
 * not a path in the app (it is then reached by its click alone).
 */
export function navigationHref(destination: string): string | undefined {
  return destination.startsWith("/") ? destination : undefined;
}
