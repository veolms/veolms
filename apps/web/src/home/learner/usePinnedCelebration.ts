import { useEffect, type RefObject } from "react";

/**
 * Marks the moment a course is pinned to the home: the hero's row swells a
 * little and settles back, a ring in the accent's colour leaves its edge,
 * and the pin itself lands with a small bounce. The row only swapped its
 * course before, which was easy to miss, most of all from a card far down
 * the page.
 *
 * It plays once per pin made on this page (`pulse` counts them), never for
 * a pin that was already there when the page opened. A pin made from below
 * scrolls the page up to the hero first, so the motion waits until the row
 * is in view. It is left out for someone who asked for less motion; the
 * page's message says the course was pinned either way.
 *
 * Run from here with the Web Animations API, not as classes: it is a
 * one-off on an element that is already on the page, and it must not leave
 * a transform behind on a row whose backdrop is blurred.
 */
export function usePinnedCelebration(
  rowRef: RefObject<HTMLElement | null>,
  pinRef: RefObject<HTMLElement | null>,
  /** How many pins have been made on this page; 0 until the first. */
  pulse: number,
) {
  useEffect(() => {
    const row = rowRef.current;
    if (!pulse || !row) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return undefined;
    }

    let animations: Animation[] = [];
    const play = () => {
      animations = [
        row.animate(
          {
            transform: ["scale(1)", "scale(1.045)", "scale(0.994)", "scale(1)"],
            offset: [0, 0.32, 0.68, 1],
          },
          { duration: 680, easing: "ease-in-out" },
        ),
        row.animate(
          [
            {
              outline: "2px solid color-mix(in srgb, var(--accent) 85%, white)",
              outlineOffset: "0px",
            },
            { outline: "2px solid transparent", outlineOffset: "10px" },
          ],
          { duration: 900, easing: "ease-out" },
        ),
      ];
      const pin = pinRef.current;
      if (pin) {
        animations.push(
          pin.animate(
            {
              transform: [
                "scale(0) rotate(-40deg)",
                "scale(1.6) rotate(10deg)",
                "scale(1) rotate(0deg)",
              ],
              offset: [0, 0.6, 1],
            },
            {
              duration: 560,
              delay: 140,
              easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
              fill: "backwards",
            },
          ),
        );
      }
    };
    const stop = () => {
      for (const animation of animations) animation.cancel();
    };

    const box = row.getBoundingClientRect();
    if (box.top >= 0 && box.bottom <= window.innerHeight) {
      play();
      return stop;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.intersectionRatio >= 0.9)) {
          observer.disconnect();
          play();
        }
      },
      { threshold: 0.9 },
    );
    observer.observe(row);
    return () => {
      observer.disconnect();
      stop();
    };
  }, [rowRef, pinRef, pulse]);
}
