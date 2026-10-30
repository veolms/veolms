import { useEffect, type RefObject } from "react";

/** How long after the last scroll step the page counts as still again. */
const SCROLL_REST_MS = 120;

/**
 * Marks the page's scroller (`data-scrolling`) while it is being scrolled
 * without a button held, so that the page can stop answering the pointer for
 * that long (the scroller's class does that, see CoursesPage).
 *
 * Why: a pointer resting on the page is over a different thing at every step
 * of a scroll. Each thing it passes takes its hover look and gives it up
 * again, and where that look is eased (a course card fades its shadow and
 * ground in over 200ms) the browser repaints the thing for as long: a scroll
 * down the Courses page and back repainted cards 600 times and dropped
 * frames. With the page not answering, nothing changes under the pointer and
 * a scroll only moves what is already drawn. The mark is written on the
 * element itself, not through React, so a scroll renders nothing.
 *
 * A scroll with a button held is someone dragging: a text selection running
 * past the edge, the scrollbar's thumb, the scroll control. Those need the
 * page under the pointer, so they are left alone.
 */
export function useScrollingMark(scrollportRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const scrollport = scrollportRef.current;
    if (!scrollport) return undefined;
    let timer = 0;
    let buttonHeld = false;
    const rest = () => {
      timer = 0;
      scrollport.removeAttribute("data-scrolling");
    };
    const onScroll = () => {
      if (buttonHeld) return;
      if (timer) window.clearTimeout(timer);
      else scrollport.setAttribute("data-scrolling", "");
      timer = window.setTimeout(rest, SCROLL_REST_MS);
    };
    const onPointerDown = () => {
      buttonHeld = true;
      if (timer) {
        window.clearTimeout(timer);
        rest();
      }
    };
    const onPointerUp = () => {
      buttonHeld = false;
    };
    scrollport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointerup", onPointerUp, true);
    window.addEventListener("pointercancel", onPointerUp, true);
    return () => {
      window.clearTimeout(timer);
      scrollport.removeAttribute("data-scrolling");
      scrollport.removeEventListener("scroll", onScroll);
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointerup", onPointerUp, true);
      window.removeEventListener("pointercancel", onPointerUp, true);
    };
  }, [scrollportRef]);
}
