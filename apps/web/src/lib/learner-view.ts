/**
 * Whether API requests should be answered as a learner's would be.
 *
 * An account that manages courses (a creator, an admin) is given every
 * lesson of a course by the API, unpublished ones included. In its Student
 * view it should see what a student sees, so while this is on the API client
 * sends `LEARNER_VIEW_HEADER` and the API leaves the unpublished lessons out.
 * A plain student account never turns it on: the API already answers it as
 * a learner.
 *
 * The page shell knows the view only once the session and the stored
 * workspace have been read, which is after the first requests have gone
 * out. So the last value is kept in the browser and read back at start-up:
 * a reload in Student view asks as a learner from its very first request.
 */
const STORAGE_KEY = "veolms-learner-view";

function readStoredLearnerView(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

let learnerView =
  typeof window === "undefined" ? false : readStoredLearnerView();

export function isLearnerView(): boolean {
  return learnerView;
}

/** Sets the view; returns whether it changed. */
export function setLearnerView(next: boolean): boolean {
  if (next === learnerView) return false;
  learnerView = next;
  try {
    if (next) window.localStorage.setItem(STORAGE_KEY, "1");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Without storage the view is found again once the page shell is ready.
  }
  return true;
}
