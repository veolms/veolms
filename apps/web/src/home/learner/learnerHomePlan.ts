import type { CourseSummary, EnrolledCourse } from "@veolms/contracts";

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
  /** Every enrolment, in the order "My Courses" lists them. */
  courses: EnrolledCourse[];
}

const progressOf = (course: EnrolledCourse) => course.progress ?? 0;

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
 */
export function planLearnerHome(
  enrolledCourses: readonly EnrolledCourse[],
): LearnerHomePlan | null {
  const inProgress = enrolledCourses
    .filter((course) => progressOf(course) > 0 && progressOf(course) < 100)
    .sort(byLastAccessed);
  const notStarted = enrolledCourses
    .filter((course) => progressOf(course) <= 0)
    .sort(byEnrolled);
  const completed = enrolledCourses
    .filter((course) => progressOf(course) >= 100)
    .sort(byLastAccessed);

  const courses = [...inProgress, ...notStarted, ...completed];
  const heroCourse = courses[0];
  if (!heroCourse) return null;

  const intent: LearnerHeroIntent =
    inProgress.length > 0
      ? "continue"
      : notStarted.length > 0
        ? completed.length > 0
          ? "next"
          : "start"
        : "review";

  return { heroCourse, intent, courses };
}

/** The course's public address key: its readable slug when it has one. */
export function getEnrolledCourseKey(course: EnrolledCourse) {
  return course.courseSlug.trim() || course.courseId;
}

/**
 * The published courses the learner is not enrolled in, paid ones first and
 * otherwise in the catalogue's order.
 */
export function selectCoursesToExplore(
  publishedCourses: readonly CourseSummary[],
  enrolledCourses: readonly EnrolledCourse[],
): CourseSummary[] {
  const enrolled = new Set(
    enrolledCourses.flatMap((course) => [course.courseId, course.courseSlug]),
  );
  const open = publishedCourses.filter(
    (course) => !enrolled.has(course.id) && !enrolled.has(course.slug),
  );
  return [
    ...open.filter((course) => course.pricing.pricingType === "paid"),
    ...open.filter((course) => course.pricing.pricingType !== "paid"),
  ];
}
