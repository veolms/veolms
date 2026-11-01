import { forgetSessionTabs } from "../routing/tabSessionState";

/**
 * What this browser keeps about the account that was signed in, outside the
 * account's own (id-scoped) keys, and forgets when that session ends.
 *
 * It is called from `authStore.clearAuth`, which every way out of a session
 * goes through: signing out, a request answered "not signed in", `/auth/me`
 * finding no session, deactivating the account, calling off a sign-in. Only
 * the sign-out button used to forget anything, so after a session expired
 * the next account to sign in on the same tab opened on the previous one's
 * Settings tab and saw its course search.
 *
 * Only state that is cheap to lose and wrong to hand on is listed here.
 * Unsaved writing is deliberately not: the lesson-editor drafts
 * (`veolms:lesson-editor-draft:`), the quiz-builder drafts and the
 * discussion drafts stay, because a session that expires in the middle of
 * writing must not take the text with it.
 *
 * The quiz-builder drafts are no longer handed on either: each is kept under
 * its author's account (`veolms-account-v1:<user>:veolms:quiz-builder:draft:…`,
 * see `accountScopedStorage.ts`), and a draft saved under the old
 * browser-wide key is moved to the first account that opens that builder.
 *
 * The last-opened lesson of a course (`veolms-last-lesson-`) stays as well:
 * it is what brings the same learner back to their lesson after signing in
 * again. It is read while a lesson address is being settled, before the
 * session check has said who is signed in, so it cannot be keyed by account
 * the way the drafts are. It is handed on to nobody else instead: see
 * `claimLastOpenedLessons`.
 */

/** The course catalogue's search box (`CoursesPage`). */
export const COURSE_CATALOGUE_SEARCH_SESSION_KEY =
  "veolms-course-catalogue-search";

/**
 * Answers about the learner as last fetched in this tab, one copy per
 * account (see `services/accountSessionCopies.ts`): the enrolled courses
 * (`<prefix><user id>`), the wishlist (the same), and each course page's
 * access answer (`<prefix><user id>:<course slug>`).
 */
export const ENROLLED_COURSES_SESSION_KEY_PREFIX = "veolms-enrolled-courses:";
export const WISHLIST_SESSION_KEY_PREFIX = "veolms-wishlist:";
export const COURSE_ACCESS_SESSION_KEY_PREFIX = "veolms-course-access:";
export const NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX =
  "veolms-notification-summary:";
/** Where in a course to carry on (`<prefix><user id>:<course key>`). */
export const RESUME_CONTEXT_SESSION_KEY_PREFIX = "veolms-resume-context:";
/** Today's learning against the daily goal (the laptop on the home). */
export const LEARNING_SUMMARY_SESSION_KEY_PREFIX = "veolms-learning-summary:";
/**
 * A lesson's playback answer (its manifest and segment token), kept while
 * the token lasts (`<prefix><user id or guest>:<view>:<course>:<lesson>`,
 * see `learning/playbackBootstrapHeadStart.ts`).
 */
export const PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX =
  "veolms-playback-bootstrap:";
/**
 * The learner's home as it was last drawn in this tab, for the next load's
 * first paint (see `home/learner/learnerHomeSnapshot.ts`).
 */
export const LEARNER_HOME_SNAPSHOT_SESSION_KEY_PREFIX = "veolms-learner-home:";
/**
 * What the sidebar's profile button last showed under the name (the handle,
 * or the role with its icon), for the next load's first paint (see
 * `shell/profileHintEarlyState.ts`).
 */
export const PROFILE_CHIP_SESSION_KEY = "veolms-profile-chip";

/**
 * Session-storage keys forgotten with the session, besides the remembered
 * Settings and Discussions tabs: the catalogue search, each course's
 * lesson search and whether it was open (`learning/Curriculum.tsx`,
 * `veolms-learning-<course>-curriculum-search[-open]`), and the copies of
 * the learner's answers.
 */
export function isAccountSessionStorageKey(key: string): boolean {
  return (
    key === COURSE_CATALOGUE_SEARCH_SESSION_KEY ||
    key.startsWith(ENROLLED_COURSES_SESSION_KEY_PREFIX) ||
    key.startsWith(WISHLIST_SESSION_KEY_PREFIX) ||
    key.startsWith(COURSE_ACCESS_SESSION_KEY_PREFIX) ||
    key.startsWith(NOTIFICATION_SUMMARY_SESSION_KEY_PREFIX) ||
    key.startsWith(RESUME_CONTEXT_SESSION_KEY_PREFIX) ||
    key.startsWith(LEARNING_SUMMARY_SESSION_KEY_PREFIX) ||
    key.startsWith(LEARNER_HOME_SNAPSHOT_SESSION_KEY_PREFIX) ||
    key.startsWith(PLAYBACK_BOOTSTRAP_SESSION_KEY_PREFIX) ||
    key === PROFILE_CHIP_SESSION_KEY ||
    /^veolms-learning-.+-curriculum-search(-open)?$/.test(key)
  );
}

/**
 * Local-storage keys forgotten with the session, and on the next page load
 * (`forgetLegacyLearningProgress`): the per-course progress map the player
 * used to write (`veolms-learning-<course>-progress`). Nothing writes or
 * reads it any more. It carried no account and was never lowered, and the
 * course cards showed the higher of it and the server's figure: the next
 * account was shown the previous one's progress, and a learner whose lesson
 * the server had cleared went on seeing the old percent. The cards now take
 * the server's figure, plus what the account-scoped store below holds as
 * not sent yet (`learning/catalogueCardProgress.ts`).
 *
 * The account-scoped progress store (`veolms-learning-progress-v1:<user>:…`,
 * `learning/learningProgressStorage.ts`) is not matched: it is the only key
 * of the two with a ":" in it, and it holds progress not yet sent.
 */
export function isAccountLocalStorageKey(key: string): boolean {
  return (
    key.startsWith("veolms-learning-") &&
    key.endsWith("-progress") &&
    !key.includes(":")
  );
}

function removeMatchingKeys(
  storage: Storage,
  shouldRemove: (key: string) => boolean,
) {
  const keys: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key !== null && shouldRemove(key)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
}

const LAST_OPENED_LESSON_KEY_PREFIX = "veolms-last-lesson-";
/** Whose the remembered lessons are. Not under the prefix above. */
const LAST_OPENED_LESSON_OWNER_KEY = "veolms-resume-owner";

/**
 * Called when an account is known to be signed in. The remembered
 * last-opened lessons belong to the account that was signed in when they
 * were written. The same account signing in again keeps them. A different
 * account does not inherit them: they are removed, and from then on the
 * entries are that account's. Lessons opened while signed out, with no owner
 * recorded, go to the first account that signs in, which is the person who
 * was just browsing.
 */
export function claimLastOpenedLessons(
  accountId: string,
  storage: Pick<
    Storage,
    "getItem" | "setItem" | "removeItem" | "key" | "length"
  > | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage) return;
  try {
    const owner = storage.getItem(LAST_OPENED_LESSON_OWNER_KEY);
    if (owner === accountId) return;
    if (owner !== null) {
      removeMatchingKeys(storage as Storage, (key) =>
        key.startsWith(LAST_OPENED_LESSON_KEY_PREFIX),
      );
    }
    storage.setItem(LAST_OPENED_LESSON_OWNER_KEY, accountId);
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
}

export function forgetAccountBrowserState(): void {
  if (typeof window === "undefined") return;
  forgetSessionTabs();
  try {
    removeMatchingKeys(window.sessionStorage, isAccountSessionStorageKey);
  } catch {
    // Session storage can be unavailable in privacy-restricted contexts.
  }
  try {
    removeMatchingKeys(window.localStorage, isAccountLocalStorageKey);
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
}

/**
 * Removes the progress maps the player used to leave under
 * `veolms-learning-<course>-progress` (see `isAccountLocalStorageKey`).
 * Nothing reads them any more; this clears what earlier visits left behind,
 * whoever is signed in.
 */
export function forgetLegacyLearningProgress(
  storage: Pick<
    Storage,
    "removeItem" | "key" | "length"
  > | null = typeof window === "undefined" ? null : window.localStorage,
): void {
  if (!storage) return;
  try {
    removeMatchingKeys(storage as Storage, isAccountLocalStorageKey);
  } catch {
    // Local storage can be unavailable in privacy-restricted contexts.
  }
}
