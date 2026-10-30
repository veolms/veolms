/**
 * How much the course page knows about who is looking at it.
 *
 * Most of the page is the same for everyone and is built into the document
 * ahead of time: the title, the facts, the curriculum, the About text. Three
 * things are not, because they depend on the viewer: the band under the
 * hero (a price to pay, a learner's progress, or a manager's actions), the
 * heart that saves the course for later, and "Preview Course" where it
 * stands for the free lessons (with a trailer it is there for everyone).
 * Until the viewer is known those three hold their places with a
 * placeholder, and nothing else on the page waits.
 *
 * - `known`: the session has answered, and for someone signed in so have
 *   their view (learner or manager) and their enrolments.
 * - `pending`: someone is, or was last time, signed in on this browser and
 *   one of those answers is still out. The page used to show them the price
 *   and "Pay Now" meanwhile, and then swap it for their progress.
 * - `presumed-guest`: nothing has answered yet and nothing remembers a
 *   session, so the visitor is taken for a guest and shown the guest's
 *   page at once. This is also what the document is built with. A browser
 *   that does remember a session must not be shown the guest's parts while
 *   the page's code is still loading, so they are hidden there from the
 *   first paint and their placeholders shown instead, by the mark the
 *   document's head puts on the root (see `sessionPresence`).
 *
 * A signed-in browser whose tab holds copies of the learner's answers
 * (`data-course-cards-early`, see `courseCardEarlyState`) is shown the
 * page as the learner will get it from the first paint instead: the
 * guest's parts stay unless the learner holds the course, and a style
 * from the head puts their progress band in its place. The same goes while
 * the page is `pending`, so nothing changes when the answers come.
 */
export type CourseViewerState = "known" | "pending" | "presumed-guest";

/** On a guest's part of the page, while the visitor is only presumed one. */
export const presumedGuestOnlyClasses =
  "[:root[data-session-hint=signed-in]:not([data-course-cards-early])_&]:hidden!";

/** On the box that holds a placeholder standing in for such a part. */
export const sessionExpectedOnlyClasses =
  "hidden [:root[data-session-hint=signed-in]:not([data-course-cards-early])_&]:block";
