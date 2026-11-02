import { useMemo } from "react";
import type { RefObject } from "react";

/**
 * Where a scrollport's `scroll` events arrive. The document's own scroller
 * (`document.scrollingElement`) does not fire them on itself: they go to the
 * window.
 */
export function scrollEventTarget(scrollport: HTMLElement): EventTarget {
  return typeof document !== "undefined" &&
    scrollport === document.scrollingElement
    ? window
    : scrollport;
}

/**
 * Moves a scrollport to `top` at once. The page asks for smooth scrolling
 * (`scroll-behavior: smooth` on the root, foundation.css), and the
 * document's scroller follows it: each frame's small step of the control
 * then began a new glide from where the page was, so on a phone (where the
 * page is the document) the control crawled however far it was pulled.
 */
export function setScrollTopAtOnce(scrollport: HTMLElement, top: number) {
  const behavior = scrollport.style.scrollBehavior;
  scrollport.style.scrollBehavior = "auto";
  scrollport.scrollTop = top;
  scrollport.style.scrollBehavior = behavior;
}

/**
 * The element a page actually scrolls in. On a phone the shell lets its main
 * box grow with the page and scrolls the document instead, so the main box
 * never scrolls and a control watching it never saw a long page. Read when
 * the control sets itself up: the main box while it scrolls by itself,
 * otherwise the document's scroller.
 */
export function usePageScrollportRef(
  mainRef: RefObject<HTMLElement | null>,
): RefObject<HTMLElement | null> {
  return useMemo(
    () => ({
      get current() {
        const main = mainRef.current;
        if (!main) return null;
        const scrolls = /(auto|scroll)/.test(getComputedStyle(main).overflowY);
        return scrolls
          ? main
          : ((document.scrollingElement as HTMLElement | null) ?? main);
      },
    }),
    [mainRef],
  );
}
