import { useLayoutEffect, useRef, type ReactNode } from "react";

/** How long the surface keeps trying to reach a position its content cannot cover yet. */
const SCROLL_SETTLE_TIMEOUT_MS = 4000;

interface LearningBackgroundSurfaceProps {
  children: ReactNode;
  /** Extra classes that give the surface the padding of the page it shows. */
  className?: string;
  scrollLeft: number;
  scrollTop: number;
}

/**
 * The page behind the lesson player, drawn while the player shrinks. It is a
 * viewport-sized copy of the application scrollport and is scrolled to where
 * the learner left that page, so the page that takes over when the player has
 * settled appears in exactly the same place.
 */
export function LearningBackgroundSurface({
  children,
  className = "",
  scrollLeft,
  scrollTop,
}: LearningBackgroundSurfaceProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;

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
  }, [scrollLeft, scrollTop]);

  return (
    <div
      ref={surfaceRef}
      className={`courses-main pointer-events-none sticky top-0 z-0 h-dvh max-h-dvh min-h-0! self-start overflow-hidden! transition-opacity ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none starting:opacity-0! ${className}`}
      style={{
        contain: "strict",
        opacity: "var(--learning-background-reveal, 0)",
        transitionDuration: "var(--learning-background-reveal-duration, 0ms)",
      }}
      aria-hidden="true"
      data-learning-background-surface=""
      inert
    >
      {children}
    </div>
  );
}
