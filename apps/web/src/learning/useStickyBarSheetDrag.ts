import { useCallback } from "react";
import type { RefObject, TouchEvent as ReactTouchEvent } from "react";

const STICKY_BAR_SELECTOR = "[data-curriculum-sticky-bar]";

/**
 * The bar of chips (the current section and lesson) held to the top of the
 * phone curriculum sheet acts as the sheet's top edge: a drag that starts on
 * it pulls the sheet, like the grab handle, even when the list is scrolled
 * partway. A stuck section heading does not: a drag on it scrolls the list
 * as anywhere else. (With the list at its top, the drawer itself takes a
 * downward drag wherever it starts, so nothing is needed here then.)
 *
 * Base UI's drawer leaves a touch that starts inside a scrolled list to the
 * list. So while such a touch is down, the list stops being a scroll container
 * (`overflow-y: hidden` keeps its scroll position) and the drawer takes the
 * gesture as it does on the handle. Taps on the chips are untouched. Runs in
 * the capture phase, before the drawer's own touchstart.
 */
export function useStickyBarSheetDrag(
  scrollportRef: RefObject<HTMLElement | null>,
  enabled: boolean,
) {
  return useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const scrollport = scrollportRef.current;
      const target = event.target;
      if (
        !enabled ||
        !scrollport ||
        event.touches.length !== 1 ||
        scrollport.scrollTop <= 0 ||
        !(target instanceof Element)
      )
        return;

      const bar = target.closest(STICKY_BAR_SELECTOR);
      if (!bar || !scrollport.contains(bar)) return;

      const stickyTop = Number.parseFloat(getComputedStyle(bar).top) || 0;
      const barOffset =
        bar.getBoundingClientRect().top -
        scrollport.getBoundingClientRect().top;
      if (barOffset > stickyTop + 1) return;

      const previousOverflowY = scrollport.style.overflowY;
      scrollport.style.overflowY = "hidden";

      const doc = scrollport.ownerDocument;
      const release = (endEvent: TouchEvent) => {
        if (endEvent.touches.length > 0) return;
        scrollport.style.overflowY = previousOverflowY;
        doc.removeEventListener("touchend", release, true);
        doc.removeEventListener("touchcancel", release, true);
      };
      doc.addEventListener("touchend", release, true);
      doc.addEventListener("touchcancel", release, true);
    },
    [enabled, scrollportRef],
  );
}
