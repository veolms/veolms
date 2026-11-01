import type { CoursePricingSummary } from "@veolms/contracts";
import { useSyncExternalStore } from "react";
import { coursesService } from "../services/courses/courses.service";

/**
 * The prices in force, for the course cards. A card is drawn from the
 * course list its page was built with (and that list is cached for hours),
 * so a price changed in the course editor reached the cards only with the
 * next build. Instead:
 *
 * - Once per full load (a refresh, not a move inside the app), the prices
 *   are asked from `GET /courses/access`, which is never cached, in the
 *   background.
 * - The answer is kept for the tab (sessionStorage), so a reload draws the
 *   prices it had at once, as soon as the page is interactive.
 * - Cards redraw only when the answer differs from what they show.
 *
 * Before the page is interactive it shows the prices it was built with:
 * what is painted first must be what the page was built with, or React
 * would throw the markup away. The course page itself takes its price from
 * its own uncached access answer (`useCoursePageData`).
 */

const STORAGE_KEY = "veolms-course-prices:v1";

export type LiveCoursePrices = Readonly<Record<string, CoursePricingSummary>>;

/** Undefined until the tab's kept copy has been read. */
let prices: LiveCoursePrices | null | undefined;
let asked = false;
const listeners = new Set<() => void>();

function readPrices(): LiveCoursePrices | null {
  if (prices === undefined) {
    try {
      const kept: unknown = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "null",
      );
      prices =
        kept && typeof kept === "object" ? (kept as LiveCoursePrices) : null;
    } catch {
      prices = null;
    }
  }
  return prices;
}

function publish(next: LiveCoursePrices) {
  // The same answer as before: nothing redraws.
  if (JSON.stringify(readPrices()) === JSON.stringify(next)) return;
  prices = next;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Asked again on the next load.
  }
  for (const listener of listeners) listener();
}

function askOnce() {
  if (asked) return;
  asked = true;
  coursesService
    .listAccess()
    .then((answer) =>
      publish(
        Object.fromEntries(
          answer.courses.map((course) => [course.courseId, course.pricing]),
        ),
      ),
    )
    .catch(() => {
      // The kept prices, or the ones the page was built with, stand.
    });
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  askOnce();
  return () => {
    listeners.delete(onChange);
  };
}

/** The prices in force by course id, or null before any are known. */
export function useLiveCoursePrices(): LiveCoursePrices | null {
  return useSyncExternalStore(subscribe, readPrices, () => null);
}

/** A course from a built list, with the price in force when one is known. */
export function withLivePricing<
  T extends { id: string; pricing: CoursePricingSummary },
>(course: T, livePrices: LiveCoursePrices | null): T {
  const live = livePrices?.[course.id];
  return live ? { ...course, pricing: live } : course;
}
