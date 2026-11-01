import type { EnrolledCourse } from "./commerce/enrollment.ts";

/**
 * Which course a learner's home leads with, and in what order it lists the
 * rest. The web app draws the home from this, and the API uses the same
 * rule to send that course's place with the home (see `learner-home.ts`),
 * so the two cannot disagree about which course it is.
 *
 * Kept free of the schema library: the web app imports it into the code
 * every page starts with.
 */

/**
 * What the hero asks the learner to do next:
 * - `start`: nothing has been started yet, so begin the newest enrolment;
 * - `continue`: carry on with the course they were last in;
 * - `next`: everything started is finished, and another course is waiting;
 * - `review`: every course is finished.
 */
export type LearnerHeroIntent = "start" | "continue" | "next" | "review";

export interface LearnerHomePlan {
  heroCourse: EnrolledCourse;
  intent: LearnerHeroIntent;
  /** The learner pinned this course to the home; it was not chosen for them. */
  heroPinned: boolean;
  /** Every enrolment, in the order "My Courses" lists them. */
  courses: EnrolledCourse[];
}

const progressOf = (course: EnrolledCourse) => course.progress ?? 0;

/**
 * Whether the learner has begun the course: anything watched at all. A few
 * seconds of a long course leave its progress at 0.00%, but they are kept,
 * and the course has its last-watched time from then on.
 */
export function hasStartedCourse(
  course: Pick<EnrolledCourse, "progress" | "lastAccessedAt">,
): boolean {
  return (course.progress ?? 0) > 0 || Boolean(course.lastAccessedAt);
}

function timestamp(value: string | Date | null | undefined) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Later first; a course without the date goes after the ones that have it. */
function compareLatest(left: number | null, right: number | null) {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

const byLastAccessed = (left: EnrolledCourse, right: EnrolledCourse) =>
  compareLatest(
    timestamp(left.lastAccessedAt),
    timestamp(right.lastAccessedAt),
  ) ||
  compareLatest(timestamp(left.enrolledAt), timestamp(right.enrolledAt)) ||
  left.courseId.localeCompare(right.courseId);

const byEnrolled = (left: EnrolledCourse, right: EnrolledCourse) =>
  compareLatest(timestamp(left.enrolledAt), timestamp(right.enrolledAt)) ||
  left.courseId.localeCompare(right.courseId);

/**
 * Decides what the learner's home leads with. Courses in progress come
 * first (the one opened last leads), then the ones not started (newest
 * enrolment first), then the finished ones.
 *
 * A course the learner has pinned to the home leads instead, for as long
 * as they are enrolled in it; what the hero asks of them then follows that
 * course's own progress. The order of the courses is the same either way.
 */
export function planLearnerHome(
  enrolledCourses: readonly EnrolledCourse[],
  pinnedCourseId?: string | null,
): LearnerHomePlan | null {
  const inProgress = enrolledCourses
    .filter((course) => hasStartedCourse(course) && progressOf(course) < 100)
    .sort(byLastAccessed);
  const notStarted = enrolledCourses
    .filter((course) => !hasStartedCourse(course))
    .sort(byEnrolled);
  const completed = enrolledCourses
    .filter((course) => progressOf(course) >= 100)
    .sort(byLastAccessed);

  const courses = [...inProgress, ...notStarted, ...completed];
  const heroCourse = courses[0];
  if (!heroCourse) return null;

  const pinnedCourse = pinnedCourseId
    ? courses.find((course) => course.courseId === pinnedCourseId)
    : undefined;
  if (pinnedCourse) {
    const progress = progressOf(pinnedCourse);
    return {
      heroCourse: pinnedCourse,
      intent:
        progress >= 100
          ? "review"
          : hasStartedCourse(pinnedCourse)
            ? "continue"
            : "start",
      heroPinned: true,
      courses,
    };
  }

  const intent: LearnerHeroIntent =
    inProgress.length > 0
      ? "continue"
      : notStarted.length > 0
        ? completed.length > 0
          ? "next"
          : "start"
        : "review";

  return { heroCourse, intent, heroPinned: false, courses };
}

/** The course's public address key: its readable slug when it has one. */
export function getEnrolledCourseKey(course: EnrolledCourse) {
  return course.courseSlug.trim() || course.courseId;
}
