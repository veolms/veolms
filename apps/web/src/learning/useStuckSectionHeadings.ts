import { useEffect } from "react";
import type { RefObject } from "react";
import {
  BAR_APPROACH_PX,
  CURRICULUM_HELD_EVENT,
} from "./curriculumEarlyScroll";

const STICKY_BAR_SELECTOR = "[data-curriculum-sticky-bar]";
const OPEN_SECTION_HEADING_SELECTOR =
  '.learning-curriculum__section[data-expanded="true"] > .learning-curriculum__section-toggle';
const LESSON_LIST_SELECTOR = ".learning-curriculum__lesson-list";
/**
 * Scrolling slower than this (px per ms) when the bar comes to hold counts
 * as arriving slowly: a deliberate pull, not a flick. Only then is the
 * arrival played out (the ripple from the seam).
 */
const SLOW_ARRIVAL_PX_PER_MS = 0.8;

/**
 * Keeps what holds to the top of the curriculum panel in step with the
 * list as it scrolls, without rendering anything (the values are written
 * to the elements directly, in the scroll event itself, before the frame
 * is painted):
 *
 * - The bar of chips is told how near it is to holding (`--bar-stick`, 0
 *   far off to 1 held, over its last 48px of travel), for the room and the
 *   line it takes on as it arrives, and marked `data-stuck` once it holds;
 *   when it came to hold slowly (see SLOW_ARRIVAL_PX_PER_MS) it is also
 *   marked `data-collision`, for the arrival to be played out. A flick
 *   lands it in its held form with nothing played.
 * - With `stickHeadings`, the headings of open sections that hold under
 *   the bar: their lessons' frame is painted only below the heading's
 *   bottom edge (`--frame-clip-top` on the frame), so none of its sides
 *   ever shows beside the heading's corners; and over the frame's last
 *   16px (its rounded foot) the heading's bottom corners round off along
 *   the frame's own arc (`--section-foot-radius`), so the block's outline
 *   closes up into one card without a step, the heading taking over the
 *   bottom edge once the frame's has gone behind it
 *   (`--section-foot-border-width`: the edge is as wide as the sides).
 */
export function useStuckSectionHeadings(
  scrollportRef: RefObject<HTMLElement | null>,
  enabled: boolean,
  /** Whether open sections' headings hold under the bar (the setting). */
  stickHeadings: boolean,
  /** How far under the bar's foot the headings hold, in px. */
  gapBelowBar: number,
  /** How deep the frame's rounded foot is, in px. */
  footDepth: number,
  /** Anything that changes which sections are open or in the page. */
  revision: string,
) {
  useEffect(() => {
    const scrollport = scrollportRef.current;
    if (!enabled || !scrollport) return undefined;

    const clear = (heading: HTMLElement, frame: HTMLElement | null) => {
      heading.style.removeProperty("--section-foot-radius");
      heading.style.removeProperty("--section-foot-border-width");
      frame?.style.removeProperty("--frame-clip-top");
    };
    const clearAll = () => {
      for (const heading of scrollport.querySelectorAll<HTMLElement>(
        OPEN_SECTION_HEADING_SELECTOR,
      )) {
        clear(heading, heading.nextElementSibling as HTMLElement | null);
      }
      const bar = scrollport.querySelector<HTMLElement>(STICKY_BAR_SELECTOR);
      delete bar?.dataset.stuck;
      delete bar?.dataset.collision;
      bar?.style.removeProperty("--bar-stick");
    };

    // How fast the list is scrolling, from one scroll event to the next.
    let lastScrollTop = scrollport.scrollTop;
    let lastScrollAt = 0;
    let speed = Infinity;

    // `fromScroll`: called from a scroll event, the only way the bar comes to
    // hold by the learner's hand. The first measure, a resize and a
    // transition's end measure too, and a bar found holding then (the page
    // built or opened at a lesson down the list) has not arrived at all:
    // nothing is played for it. Two such measures in a row also read as a
    // speed of zero, which looked like the slowest of arrivals.
    const update = (fromScroll = false) => {
      const now = performance.now();
      const scrollTop = scrollport.scrollTop;
      if (lastScrollAt) {
        const elapsed = now - lastScrollAt;
        if (elapsed > 0) {
          speed = Math.abs(scrollTop - lastScrollTop) / elapsed;
        }
      }
      lastScrollTop = scrollTop;
      lastScrollAt = now;

      const scrollportTop = scrollport.getBoundingClientRect().top;
      const bar = scrollport.querySelector<HTMLElement>(STICKY_BAR_SELECTOR);
      if (bar) {
        // Where the bar would be if it did not hold: just under the head
        // above it, which scrolls freely.
        const head = bar.previousElementSibling;
        const naturalTop = head
          ? head.getBoundingClientRect().bottom - scrollportTop
          : bar.getBoundingClientRect().top - scrollportTop;
        const stick = Math.min(
          1,
          Math.max(0, 1 - naturalTop / BAR_APPROACH_PX),
        );
        bar.style.setProperty("--bar-stick", stick.toFixed(3));
        if (stick >= 1) {
          // The moment it comes to hold decides whether the arrival is
          // played: only a slow one is. (On first measure, or after a jump
          // to a place where it already holds, nothing is played.)
          if (!("stuck" in bar.dataset)) {
            bar.dataset.stuck = "";
            if (fromScroll && speed < SLOW_ARRIVAL_PX_PER_MS) {
              bar.dataset.collision = "";
            }
          }
        } else {
          delete bar.dataset.stuck;
          delete bar.dataset.collision;
        }
      }
      if (!stickHeadings) return;

      // Headings hold a little under the bar's foot (wherever that stands
      // once the bar is stuck: it grows into the two buttons by then). A
      // heading on its way out keeps its foot until it has passed behind the
      // bar, not just above the line it held at: it is still in sight in
      // the room between the two.
      const hiddenAt = bar
        ? bar.getBoundingClientRect().bottom
        : scrollportTop + gapBelowBar;
      const line = hiddenAt + gapBelowBar;
      for (const heading of scrollport.querySelectorAll<HTMLElement>(
        OPEN_SECTION_HEADING_SELECTOR,
      )) {
        const section = heading.parentElement;
        const frame = heading.nextElementSibling as HTMLElement | null;
        if (!section) continue;
        const sectionBounds = section.getBoundingClientRect();
        const headingBounds = heading.getBoundingClientRect();
        const stuck =
          sectionBounds.top < line - 0.5 && headingBounds.bottom > hiddenAt;
        if (!stuck) {
          clear(heading, frame);
          continue;
        }
        // How much of the frame is still below the heading, up to the
        // depth of its foot. At the height where the heading's bottom
        // meets the foot's arc, the arc is this far in from the side; the
        // heading's corner radius matches, so the two outlines meet.
        const remaining = Math.min(
          footDepth,
          Math.max(0, sectionBounds.bottom - headingBounds.bottom),
        );
        const radius =
          footDepth -
          Math.sqrt(
            Math.max(0, 2 * footDepth * remaining - remaining * remaining),
          );
        heading.style.setProperty("--section-foot-radius", `${radius}px`);
        heading.style.setProperty(
          "--section-foot-border-width",
          remaining < 1 ? getComputedStyle(heading).borderTopWidth : "0px",
        );
        if (frame) {
          frame.style.setProperty(
            "--frame-clip-top",
            `${Math.max(0, headingBounds.bottom - frame.getBoundingClientRect().top)}px`,
          );
        }
      }
    };

    let frame = 0;
    const schedule = () => {
      if (!frame) {
        frame = window.requestAnimationFrame(() => {
          frame = 0;
          update();
        });
      }
    };

    clearAll();
    update();
    // From here on the bar and the headings are kept here; the head's
    // script that kept them while the page loaded stops.
    document.dispatchEvent(new Event(CURRICULUM_HELD_EVENT));
    // Scrolling is followed in the event itself, so the frame painted for
    // the scroll already has the new values; transitions can wait a frame.
    const onScroll = () => update(true);
    scrollport.addEventListener("scroll", onScroll, { passive: true });
    scrollport.addEventListener("transitionend", schedule);
    // A change of size is followed before the frame it shows in is
    // painted: lessons above one that holds a heading growing or
    // shrinking move its frame under the heading, and a cut measured
    // before that would crop the lessons below it for a frame.
    const resizeObserver = new ResizeObserver(() => update());
    resizeObserver.observe(scrollport);
    const lessonList = scrollport.querySelector(LESSON_LIST_SELECTOR);
    if (lessonList) resizeObserver.observe(lessonList);
    for (const heading of scrollport.querySelectorAll<HTMLElement>(
      OPEN_SECTION_HEADING_SELECTOR,
    )) {
      const frame = heading.nextElementSibling;
      if (frame) resizeObserver.observe(frame);
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      scrollport.removeEventListener("scroll", onScroll);
      scrollport.removeEventListener("transitionend", schedule);
      resizeObserver.disconnect();
      clearAll();
    };
  }, [enabled, footDepth, gapBelowBar, revision, scrollportRef, stickHeadings]);
}
