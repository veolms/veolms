import { getApplicationScrollElement } from "../../shell/applicationScroll";

/**
 * Brings a discussion entry into view at once (the middle of the screen, or
 * just under the video where that stays at the top) and keeps it
 * there while the page settles. The list is virtualized and the lesson above
 * it is still loading, so the first jump lands on a layout that then grows.
 * It runs for `checks` looks at the page (150ms apart) and gives up as soon
 * as the visitor scrolls, taps or types.
 */
export function keepEntryCentered(
  elementId: string,
  checks: number,
): { stop: () => void; isRunning: () => boolean } {
  const interactions = [
    "wheel",
    "touchstart",
    "keydown",
    "pointerdown",
  ] as const;
  let timer: number | undefined;
  let remaining = checks;
  let running = true;
  const stop = () => {
    running = false;
    window.clearTimeout(timer);
    for (const name of interactions) {
      window.removeEventListener(name, stop, true);
    }
  };
  const check = () => {
    const target = document.getElementById(elementId);
    if (target) {
      const rect = target.getBoundingClientRect();
      // Where the video stays at the top of the page, the middle of the
      // screen is partly behind it: the entry goes just below the video.
      const playerSlot = document.querySelector<HTMLElement>(
        ".learning-workspace__player-wrap",
      );
      const scroller = getApplicationScrollElement();
      if (
        playerSlot &&
        scroller &&
        getComputedStyle(playerSlot).position === "sticky"
      ) {
        const wantedTop =
          scroller.getBoundingClientRect().top + playerSlot.offsetHeight + 16;
        const offset = rect.top - wantedTop;
        if (Math.abs(offset) > 12) {
          scroller.scrollBy({ top: offset, behavior: "auto" });
        }
      } else {
        const offCenter = rect.top + rect.height / 2 - window.innerHeight / 2;
        if (Math.abs(offCenter) > 24) {
          target.scrollIntoView({ behavior: "auto", block: "center" });
        }
      }
    }
    remaining -= 1;
    if (remaining > 0) timer = window.setTimeout(check, 150);
    else stop();
  };
  for (const name of interactions) {
    window.addEventListener(name, stop, { capture: true, passive: true });
  }
  check();
  return { stop, isRunning: () => running };
}
