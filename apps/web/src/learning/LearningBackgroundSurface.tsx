import { useLayoutEffect, useRef, type ReactNode } from "react";
import { deepGroundClasses } from "../components/ElevatedCard";
import { SplitFrameBehindContext } from "../components/splitFrameBehind";

/** How long the surface keeps trying to reach a position its content cannot cover yet. */
const SCROLL_SETTLE_TIMEOUT_MS = 4000;

/** How long a page that arrives after its reveal has begun takes to fade in. */
const LATE_ARRIVAL_FADE_MS = 220;

interface LearningBackgroundSurfaceProps {
  children: ReactNode;
  /**
   * Whether the page is drawn behind the lesson player. When it is not, the
   * page is the route itself and the surface adds no box of its own.
   */
  behindLesson: boolean;
  /**
   * Not behind the lesson, but the page a minimized lesson has just handed
   * over to: it keeps a box of its own (see CoursesPage), so the browser
   * does not build the page again.
   */
  keepBox?: boolean;
  /** Extra classes that give the surface the padding of the page it shows. */
  className?: string;
  scrollLeft?: number;
  scrollTop?: number;
}

/**
 * The page behind the lesson player, drawn while the player shrinks. It is a
 * viewport-sized copy of the application scrollport and is scrolled to where
 * the learner left that page, so the page that takes over when the player has
 * settled appears in exactly the same place.
 *
 * The shell renders every page through this surface, behind the lesson or
 * not, so that when the minimize lands on that page's route React keeps the
 * same page instead of building it again. A page built again showed its
 * course pictures as placeholders for a few frames, a blink right after the
 * mini player had settled. For the same reason the copy lies on the deeper
 * ground the page has as a route (see `ElevatedCard`): without it the whole
 * page went one step darker at the hand-over.
 */
export function LearningBackgroundSurface({
  behindLesson,
  keepBox = false,
  children,
  className = "",
  scrollLeft = 0,
  scrollTop = 0,
}: LearningBackgroundSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const shownRef = useRef(false);

  // The page is rendered in the background while the player moves, and on a
  // slow device (or a quick flick) it can be ready only once the reveal is
  // well on, even after the mini player has landed. It then fades in rather
  // than appearing at once. Only the first time: a page that was already on
  // screen as the route, and is now behind an expanding player, is left as
  // it is.
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface || shownRef.current) return;
    shownRef.current = true;
    if (
      !behindLesson ||
      Number(getComputedStyle(surface).opacity) < 0.05 ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    surface.animate([{ opacity: 0, offset: 0 }], {
      duration: LATE_ARRIVAL_FADE_MS,
      // Gentler than the player's own curve, which would put most of the
      // fade in its first frame or two.
      easing: "ease-out",
    });
  }, [behindLesson]);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!behindLesson || !surface) return undefined;

    const applyScroll = () => {
      surface.scrollTo({
        left: scrollLeft,
        top: scrollTop,
        behavior: "instant",
      });
      return (
        Math.abs(surface.scrollTop - scrollTop) < 1 &&
        Math.abs(surface.scrollLeft - scrollLeft) < 1
      );
    };
    if (applyScroll()) return undefined;

    // The page may still be loading its code or data, so it is not tall
    // enough yet. Follow it as it grows until the position is reachable.
    const stop = () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
      window.clearTimeout(timeout);
    };
    const settle = () => {
      if (applyScroll()) stop();
    };
    const resizeObserver = new ResizeObserver(settle);
    const observeChildren = () => {
      for (const child of surface.children) resizeObserver.observe(child);
    };
    const mutationObserver = new MutationObserver(() => {
      observeChildren();
      settle();
    });
    observeChildren();
    mutationObserver.observe(surface, { childList: true, subtree: true });
    const timeout = window.setTimeout(stop, SCROLL_SETTLE_TIMEOUT_MS);
    return stop;
  }, [behindLesson, scrollLeft, scrollTop]);

  if (!behindLesson) {
    return (
      <div ref={surfaceRef} className={keepBox ? "min-w-0" : "contents"}>
        <SplitFrameBehindContext.Provider value={false}>
          {children}
        </SplitFrameBehindContext.Provider>
      </div>
    );
  }

  return (
    <div
      ref={surfaceRef}
      className={`courses-main pointer-events-none sticky top-0 z-0 h-dvh max-h-dvh min-h-0! self-start overflow-hidden! transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none starting:opacity-0! ${deepGroundClasses} ${className}`}
      style={{
        contain: "strict",
        opacity: "var(--learning-background-reveal, 0)",
        transitionDuration: "var(--learning-background-reveal-duration, 0ms)",
      }}
      aria-hidden="true"
      data-deep-ground=""
      data-learning-background-surface=""
      inert
    >
      <SplitFrameBehindContext.Provider value>
        {children}
      </SplitFrameBehindContext.Provider>
    </div>
  );
}
