import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { useCurrentUser } from "../services/auth";
import { enrollmentKeys, useEnrolledCourses } from "../services/enrollments";
import {
  useAuthIdentityHint,
  useAuthStore,
  useSessionPresentAtBoot,
} from "../store/auth.store";
import { retryCoursePrices } from "./liveCoursePrices";

const subscribeToNothing = () => () => {};

/** False in the prerendered page and while it hydrates, true after. */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}

/**
 * Whether a course card may say what it says to this viewer: a price to a
 * guest, progress to a learner holding the course. Nothing is known in the
 * prerendered page (the same for everyone) and while hydrating; right
 * after, a browser with no session is a guest at once, and a signed-in one
 * waits for its enrolments. A failed enrolment request makes it known too,
 * as not knowable (`isViewerCourseStateFailed`): the cards then offer
 * nothing, as a price would be wrong for a course the learner holds.
 */
export function isViewerCourseStateKnown({
  hydrated,
  signedIn,
  sessionChecked,
  sessionRemembered,
  enrolmentsLoaded,
  enrolmentsFailed,
}: {
  hydrated: boolean;
  signedIn: boolean;
  /** The session check (`/auth/me`) has answered. */
  sessionChecked: boolean;
  /**
   * This browser was signed in last time: the session-presence flag (kept
   * across tabs) or this tab's identity hint. A signed-in learner opening a
   * new tab has only the first.
   */
  sessionRemembered: boolean;
  enrolmentsLoaded: boolean;
  enrolmentsFailed: boolean;
}) {
  return (
    enrolmentsLoaded ||
    enrolmentsFailed ||
    (hydrated && !signedIn && (sessionChecked || !sessionRemembered))
  );
}

/**
 * A signed-in viewer's enrolments could not be loaded and this tab has no
 * copy of them: whether a course is theirs cannot be told. Not while the
 * request is being made again (the cards shimmer meanwhile).
 */
export function isViewerCourseStateFailed({
  signedIn,
  enrolmentsLoaded,
  enrolmentsFailed,
  enrolmentsFetching,
}: {
  signedIn: boolean;
  enrolmentsLoaded: boolean;
  enrolmentsFailed: boolean;
  enrolmentsFetching: boolean;
}) {
  return (
    signedIn && !enrolmentsLoaded && enrolmentsFailed && !enrolmentsFetching
  );
}

/** What the home page's course cards know about the viewer's courses. */
export interface ViewerCourseState {
  /** Neither a price nor progress may be shown yet. */
  pending: boolean;
  /** The viewer's courses could not be loaded (`isViewerCourseStateFailed`). */
  failed: boolean;
  /** Someone is signed in, as the shell decides it. */
  signedIn: boolean;
  /** Ids and slugs of the courses the viewer is enrolled in. */
  enrolled: ReadonlySet<string>;
  /** Progress by course id and slug. */
  progress: ReadonlyMap<string, number | null>;
}

/**
 * `isViewerCourseStateKnown` for a page outside the catalogue, with the
 * viewer's enrolments (shared with the rest of the app through the query
 * cache) by course id and slug.
 */
export function useViewerCourseState(): ViewerCourseState {
  const hydrated = useHydrated();
  const identityHint = useAuthIdentityHint();
  const sessionPresentAtBoot = useSessionPresentAtBoot();
  const currentUser = useCurrentUser();
  const storeUser = useAuthStore((state) => state.user);
  // As the shell decides it: once `/auth/me` has answered, its answer wins.
  const activeUser =
    currentUser.isFetched && !currentUser.isError
      ? currentUser.data
      : storeUser;
  const signedIn = Boolean(activeUser);
  const sessionRemembered = sessionPresentAtBoot || identityHint !== null;
  const enrolments = useEnrolledCourses({ enabled: signedIn });
  // The tab's copy of the list (restored after hydration) is used while the
  // session check is on its way; it is dropped if the check says otherwise.
  const enrolledCourses =
    signedIn || (!currentUser.isFetched && sessionRemembered)
      ? enrolments.data?.courses
      : undefined;

  const enrolmentsFailed = signedIn && enrolments.isError;
  const failed = isViewerCourseStateFailed({
    signedIn,
    enrolmentsLoaded: enrolledCourses !== undefined,
    enrolmentsFailed,
    enrolmentsFetching: enrolments.isFetching,
  });
  const pending = !isViewerCourseStateKnown({
    hydrated,
    signedIn,
    sessionChecked: currentUser.isFetched,
    sessionRemembered,
    enrolmentsLoaded: enrolledCourses !== undefined,
    enrolmentsFailed: failed,
  });

  return useMemo(() => {
    const enrolled = new Set<string>();
    const progress = new Map<string, number | null>();
    for (const course of enrolledCourses ?? []) {
      for (const key of [course.courseId, course.courseSlug]) {
        if (!key) continue;
        enrolled.add(key);
        progress.set(key, course.progress);
      }
    }
    return { pending, failed, signedIn, enrolled, progress };
  }, [enrolledCourses, failed, pending, signedIn]);
}

/**
 * A card's "Try again" (see `CourseCardLoadError`): asks again for what
 * did not load, the viewer's own courses and the prices.
 */
export function useRetryCourseCardState() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    retryCoursePrices();
    void queryClient.refetchQueries({
      queryKey: enrollmentKeys.courses(),
      type: "active",
    });
  }, [queryClient]);
}
