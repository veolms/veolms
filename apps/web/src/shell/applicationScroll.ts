export interface ApplicationScrollPosition {
  left: number;
  top: number;
}

const desktopFramedLayout = "(min-width: 641px)";

export const getApplicationScrollElement = (): HTMLElement | null => {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return null;
  }

  if (
    document.documentElement.dataset.contentLayout !== "framed" ||
    !window.matchMedia(desktopFramedLayout).matches
  ) {
    return null;
  }

  return document.querySelector<HTMLElement>("main.courses-main");
};

export const readApplicationScrollPosition = (): ApplicationScrollPosition => {
  const scrollElement = getApplicationScrollElement();
  return scrollElement
    ? { left: scrollElement.scrollLeft, top: scrollElement.scrollTop }
    : { left: window.scrollX, top: window.scrollY };
};

/** How long a restored position waits for a page that is still loading. */
const SCROLL_FOLLOW_TIMEOUT_MS = 4000;
const SCROLL_FOLLOW_INTERVAL_MS = 120;

/**
 * Keeps moving toward a restored position that the page cannot reach yet
 * because its code or data is still loading, so the page does not open at
 * the top and stay there. It gives up as soon as the position is reached,
 * the scroll moves for any other reason (the learner, or the page itself),
 * or the page has had long enough to load. Returns a function that stops it.
 */
export const followApplicationScrollPosition = (
  position: ApplicationScrollPosition,
): (() => void) => {
  const isReached = (current: ApplicationScrollPosition) =>
    Math.abs(current.top - position.top) < 1 &&
    Math.abs(current.left - position.left) < 1;
  let lastApplied = readApplicationScrollPosition();
  if (isReached(lastApplied)) return () => undefined;

  const startedAt = performance.now();
  const stop = () => window.clearInterval(interval);
  const interval = window.setInterval(() => {
    const current = readApplicationScrollPosition();
    if (
      current.top !== lastApplied.top ||
      current.left !== lastApplied.left ||
      performance.now() - startedAt > SCROLL_FOLLOW_TIMEOUT_MS
    ) {
      stop();
      return;
    }
    scrollApplicationTo({ ...position, behavior: "auto" });
    lastApplied = readApplicationScrollPosition();
    if (isReached(lastApplied)) stop();
  }, SCROLL_FOLLOW_INTERVAL_MS);
  return stop;
};

/**
 * The element whose smooth-scroll rule an instant scroll has switched off,
 * the value it had, and the frame that will put it back.
 */
let instantScrollHold: {
  element: HTMLElement;
  previous: string;
  frame: number;
} | null = null;

/**
 * Keeps the global smooth-scroll rule off on `element` until two frames
 * after the last instant scroll. Switched back at once, it was on again
 * for what the browser did next: the page shrinking as it changed (which
 * moves the scroll), or the restore repeated a frame later, and the page
 * glided to the top in front of the reader instead of opening there.
 */
const holdInstantScroll = (element: HTMLElement) => {
  if (instantScrollHold && instantScrollHold.element !== element) {
    window.cancelAnimationFrame(instantScrollHold.frame);
    instantScrollHold.element.style.scrollBehavior = instantScrollHold.previous;
    instantScrollHold = null;
  }
  const previous = instantScrollHold?.previous ?? element.style.scrollBehavior;
  if (instantScrollHold) window.cancelAnimationFrame(instantScrollHold.frame);
  element.style.scrollBehavior = "auto";
  const frame = window.requestAnimationFrame(() => {
    const next = window.requestAnimationFrame(() => {
      element.style.scrollBehavior = previous;
      instantScrollHold = null;
    });
    if (instantScrollHold) instantScrollHold.frame = next;
  });
  instantScrollHold = { element, previous, frame };
};

export const scrollApplicationTo = (options: ScrollToOptions): void => {
  const scrollElement = getApplicationScrollElement();
  const behaviorElement = scrollElement ?? document.documentElement;

  // `auto` normally inherits the global smooth-scroll rule. Route restoration
  // must be instant so an old page position is never animated on screen.
  if (options.behavior === "auto") holdInstantScroll(behaviorElement);

  if (scrollElement) {
    scrollElement.scrollTo(options);
    return;
  }
  window.scrollTo(options);
};

/**
 * Navigation state that tells the app shell to leave the scroll position
 * where it is. The shell normally puts a page back at its remembered
 * position (or the top) whenever the address changes; a page that only
 * tidies its own address (a lesson settling on its canonical address, a
 * link's one-off parameters being dropped) passes this so the reader is not
 * moved.
 */
export const KEEP_SCROLL_NAVIGATION_STATE = "academyKeepScroll";

export function withKeepScroll(state: unknown): Record<string, unknown> {
  return {
    ...(typeof state === "object" && state !== null ? state : {}),
    [KEEP_SCROLL_NAVIGATION_STATE]: true,
  };
}

/**
 * Takes the keep-scroll request back out of the current history entry once
 * the shell has acted on it, so returning to the entry later restores its
 * position like any other.
 */
export function forgetKeepScrollRequest(): void {
  const entry: unknown = window.history.state;
  if (typeof entry !== "object" || entry === null) return;
  const { usr } = entry as { usr?: unknown };
  if (!asksToKeepScroll(usr)) return;
  const rest = { ...(usr as Record<string, unknown>) };
  delete rest[KEEP_SCROLL_NAVIGATION_STATE];
  window.history.replaceState({ ...entry, usr: rest }, "");
}

export function asksToKeepScroll(state: unknown): boolean {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<string, unknown>)[KEEP_SCROLL_NAVIGATION_STATE] === true
  );
}
