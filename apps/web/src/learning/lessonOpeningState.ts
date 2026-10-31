import { useSyncExternalStore } from "react";

/**
 * Whether a lesson has been asked for and its page is not on screen yet.
 *
 * Opening a lesson from another page waits for the lesson page's code (the
 * player, the workspace) and, for a course's "Continue", a moment for the
 * answer that names the lesson. On a slow phone that was seconds in which a
 * tap seemed to do nothing. A press on a way into a lesson says so here at
 * once, and the academy layout puts up the lesson page's loading state
 * (`LessonOpeningOverlay`) until the lesson page itself is there: whatever
 * route the app lands on next ends it (see academy-layout).
 */
let opening = false;
let giveUpTimer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();

/**
 * A request that never leads anywhere (nothing navigated after all) must
 * not leave the page covered.
 */
const GIVE_UP_MS = 20_000;

const notify = () => {
  for (const listener of listeners) listener();
};

/** A lesson was asked for: show that it is on its way. */
export function beginLessonOpening() {
  if (giveUpTimer !== null) clearTimeout(giveUpTimer);
  giveUpTimer = setTimeout(endLessonOpening, GIVE_UP_MS);
  if (opening) return;
  opening = true;
  notify();
}

/** The app is on the next page (the lesson, or wherever it went instead). */
export function endLessonOpening() {
  if (giveUpTimer !== null) clearTimeout(giveUpTimer);
  giveUpTimer = null;
  if (!opening) return;
  opening = false;
  notify();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export function useLessonOpening(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => opening,
    () => false,
  );
}
