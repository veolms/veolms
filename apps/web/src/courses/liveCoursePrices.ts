import type { CoursePricingSummary } from "@veolms/contracts";
import { useSyncExternalStore } from "react";
import { coursesService } from "../services/courses/courses.service";
import { formatCoursePricing } from "./courseAdapter";
import { COURSE_PRICE_LINES_STORAGE_KEY } from "./coursePricesEarlyState";

/**
 * Course prices, for every place that shows one: the course cards, the
 * course page's price box, what a course that comes with another is worth.
 * A price is never drawn from what a page was built with. A built page is
 * the same for everyone and can be days old, and a price drawn from it
 * stood in for a learner's progress when their own courses failed to load.
 * Instead:
 *
 * - A built page has a shimmer wherever a price goes.
 * - Once per full load (a refresh, not a move inside the app), the prices
 *   are asked from `GET /courses/access`, which is never cached.
 * - The answer is kept for the tab (sessionStorage). A reload draws the
 *   kept prices at once, the course cards before the page's scripts have
 *   run (see `getCoursePricesEarlyBootstrapScript`), and the answer then
 *   changes only what differs.
 * - When the request fails and the tab has no price for a course, the
 *   place says it could not be loaded and offers to ask again.
 *
 * The course page asks for its own course's access answer, which carries
 * the price too; it keeps that price here (`keepCoursePrice`) rather than
 * asking for every course.
 */

const STORAGE_KEY = "veolms-course-prices:v1";

export type LiveCoursePrices = Readonly<Record<string, CoursePricingSummary>>;

export interface CoursePrices {
  /** By course id; null before any are known. */
  prices: LiveCoursePrices | null;
  /** This load's answer has come: a course it left out has no price. */
  answered: boolean;
  /** This load's request failed (the kept prices, if any, still stand). */
  failed: boolean;
}

/** A price as a place may show it, or why it cannot yet. */
export type CoursePriceState =
  | { status: "known"; pricing: CoursePricingSummary }
  | { status: "pending" }
  | { status: "failed" };

/** What a page is built with, and hydrates with: no price at all. */
const NOTHING_KNOWN: CoursePrices = {
  prices: null,
  answered: false,
  failed: false,
};

/** Undefined until the tab's kept copy has been read. */
let state: CoursePrices | undefined;
let asking = false;
let asked = false;
const listeners = new Set<() => void>();

function readState(): CoursePrices {
  if (state === undefined) {
    let kept: LiveCoursePrices | null = null;
    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem(STORAGE_KEY) ?? "null",
      );
      if (saved && typeof saved === "object") {
        kept = saved as LiveCoursePrices;
      }
    } catch {
      kept = null;
    }
    state = { prices: kept, answered: false, failed: false };
  }
  return state;
}

function setState(next: CoursePrices) {
  state = next;
  for (const listener of listeners) listener();
}

/** Each price as the course cards word it, for each region. */
function toPriceLines(prices: LiveCoursePrices) {
  const lines: Record<
    string,
    {
      d: { p: string; o: string; x: string };
      i: { p: string; o: string; x: string } | null;
    }
  > = {};
  for (const [courseId, pricing] of Object.entries(prices)) {
    const line = formatCoursePricing(pricing);
    if (!line) continue;
    const badge = line.showDiscountBadge === true;
    lines[courseId] = {
      d: {
        p: line.price,
        o: line.originalPrice,
        x: badge ? line.discount : "",
      },
      i: line.international
        ? {
            p: line.international.price,
            o: line.international.originalPrice,
            x: badge ? line.international.discount : "",
          }
        : null,
    };
  }
  return lines;
}

function keep(prices: LiveCoursePrices) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(prices));
    sessionStorage.setItem(
      COURSE_PRICE_LINES_STORAGE_KEY,
      JSON.stringify(toPriceLines(prices)),
    );
  } catch {
    // Asked again on the next load.
  }
}

function publish(next: LiveCoursePrices) {
  const current = readState();
  // The same prices as before: only the answer's arrival is news.
  if (JSON.stringify(current.prices) === JSON.stringify(next)) {
    if (!current.answered || current.failed) {
      setState({ ...current, answered: true, failed: false });
    }
    return;
  }
  keep(next);
  setState({ prices: next, answered: true, failed: false });
}

function ask() {
  if (asking) return;
  asking = true;
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
      setState({ ...readState(), failed: true });
    })
    .finally(() => {
      asking = false;
    });
}

/**
 * Asks for the prices again after a failure (a place's "Try again"); the
 * places shimmer meanwhile.
 */
export function retryCoursePrices() {
  if (asking) return;
  const current = readState();
  // This load's prices are in: only something else failed.
  if (current.answered && !current.failed) return;
  if (current.failed) setState({ ...current, failed: false });
  ask();
}

/**
 * Keeps a price the page learned on its own (the course page's access
 * answer), so the cards and the next reload show it too.
 */
export function keepCoursePrice(
  courseId: string,
  pricing: CoursePricingSummary,
) {
  const current = readState();
  const known = current.prices?.[courseId];
  if (known && JSON.stringify(known) === JSON.stringify(pricing)) return;
  const prices = { ...current.prices, [courseId]: pricing };
  keep(prices);
  setState({ ...current, prices });
}

function subscribeAsking(onChange: () => void) {
  listeners.add(onChange);
  if (!asked) ask();
  return () => {
    listeners.delete(onChange);
  };
}

function subscribeQuietly(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

/**
 * The prices in force by course id. Nothing is known in a built page and
 * while it hydrates; right after, the tab's kept prices are, and then this
 * load's answer. `ask: false` only reads: the course page, which has its
 * own answer for its course.
 */
export function useCoursePrices({ ask = true }: { ask?: boolean } = {}) {
  return useSyncExternalStore(
    ask ? subscribeAsking : subscribeQuietly,
    readState,
    () => NOTHING_KNOWN,
  );
}

/**
 * What a course list's card shows for a course's price (`Course.priceStatus`):
 * nothing to add when the price in force is known, or when it could not be
 * loaded for a visitor who is not signed in, who then sees the list's own
 * price (they hold no course, so a price is never wrong for them). A
 * signed-in learner's card says it could not be loaded instead.
 */
export function cardPriceStatus(
  price: CoursePriceState,
  signedIn: boolean,
): "pending" | "failed" | undefined {
  if (price.status === "known") return undefined;
  if (price.status === "failed" && !signedIn) return undefined;
  return price.status;
}

/** One course's price, or why it cannot be shown yet. */
export function coursePriceState(
  prices: CoursePrices,
  courseId: string,
): CoursePriceState {
  const pricing = prices.prices?.[courseId];
  if (pricing) return { status: "known", pricing };
  return prices.failed || prices.answered
    ? { status: "failed" }
    : { status: "pending" };
}
