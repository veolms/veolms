import { useSyncExternalStore } from "react";
import { authStore } from "../../store/auth.store";

/**
 * The course a learner has pinned to their home: the one its hero leads
 * with, whatever they opened last. Without a pin the hero chooses for
 * itself (see `planLearnerHome`).
 *
 * The pin is kept in this browser, one per account, as the wishlist is. It
 * does not follow the learner to another device.
 */
const STORAGE_KEY = "veolms-home-course";
const CHANGE_EVENT = "veolms-home-course-change";

function getStorageKey(): string | null {
  // Before the session check answers, the identity hint still names the
  // account this tab was signed in to.
  const userId =
    authStore.getState().user?.id ?? authStore.getIdentityHint()?.userId;
  return userId ? `${STORAGE_KEY}-${userId}` : null;
}

/**
 * The id of the course pinned to the home, if any, as it stands now. For
 * code that runs outside a component; a component uses the hook below.
 */
export function readPinnedHomeCourseId(): string | null {
  const storageKey = getStorageKey();
  if (!storageKey) return null;
  try {
    return window.localStorage.getItem(storageKey);
  } catch {
    return null;
  }
}

/** Pins a course to the home, or with `null` takes the pin off. */
export function pinHomeCourse(courseId: string | null) {
  const storageKey = getStorageKey();
  if (!storageKey) return;
  try {
    if (courseId) window.localStorage.setItem(storageKey, courseId);
    else window.localStorage.removeItem(storageKey);
  } catch {
    // Without storage there is nowhere to keep the pin.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Another tab of the same browser.
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** The id of the course pinned to the home, if any. */
export function usePinnedHomeCourseId(): string | null {
  return useSyncExternalStore(subscribe, readPinnedHomeCourseId, () => null);
}
