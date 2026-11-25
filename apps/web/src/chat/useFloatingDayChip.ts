import { useCallback, useEffect, useRef, type RefObject } from "react";

/** How long the date stays at the top after the reader stops scrolling. */
export const FLOATING_DAY_CHIP_MS = 6_000;

/**
 * A chip this far below its day's top has been moved by `sticky`: it is
 * floating over the messages, not standing between two days. Its own
 * margin (`my-2`, 8px) plus a pixel of rounding.
 */
const STUCK_PX = 9;

/**
 * WhatsApp's date at the top of a chat: the day chips stand between the
 * days as always, and the one held at the top while scrolling (TODAY,
 * YESTERDAY, a date) shows only while the reader scrolls, fading out
 * `FLOATING_DAY_CHIP_MS` after they stop. A chat just opened shows none.
 *
 * Chips are marked with `data-day-chip` and sit first in their day's
 * section. Their `data-hidden` is written here, outside React, and only
 * when it changes, so scrolling never re-renders the list. The chips are
 * placed straight from the scroll event (which comes at most once a
 * frame), not on an animation frame: frames stop in a background tab,
 * and the chip would be left showing (or hidden) when the reader is back.
 */
export function useFloatingDayChip(
  scrollRef: RefObject<HTMLElement | null>,
  contentRef: RefObject<HTMLElement | null>,
) {
  const shownUntilRef = useRef(0);
  const hideTimerRef = useRef<number | undefined>(undefined);

  /** Shows or hides each chip held at the top; one per day, so few. */
  const place = useCallback(() => {
    const content = contentRef.current;
    if (!content || !scrollRef.current) return;
    const showing = Date.now() < shownUntilRef.current;
    for (const chip of content.querySelectorAll<HTMLElement>(
      "[data-day-chip]",
    )) {
      const section = chip.parentElement;
      const stuck =
        section !== null &&
        chip.getBoundingClientRect().top - section.getBoundingClientRect().top >
          STUCK_PX;
      const hide = stuck && !showing;
      if (hide !== chip.hasAttribute("data-hidden")) {
        chip.toggleAttribute("data-hidden", hide);
      }
    }
  }, [contentRef, scrollRef]);

  /** The list scrolled: shown for a while if the reader did it. */
  const onScroll = useCallback(
    (byReader: boolean) => {
      if (byReader) {
        shownUntilRef.current = Date.now() + FLOATING_DAY_CHIP_MS;
        window.clearTimeout(hideTimerRef.current);
        hideTimerRef.current = window.setTimeout(
          place,
          FLOATING_DAY_CHIP_MS + 20,
        );
      }
      place();
    },
    [place],
  );

  useEffect(() => () => window.clearTimeout(hideTimerRef.current), []);

  return { onScroll, place };
}
