import type { CourseSummary, EnrolledCourse } from "@veolms/contracts";
import { getEnrolledCourseKey } from "@veolms/contracts/learner-home-plan";

// Which course the home leads with, and the order of the rest, is decided
// by a rule the API shares: it sends that course's place with the home
// (see services/home), so both sides have to pick the same course.
export {
  getEnrolledCourseKey,
  hasStartedCourse,
  planLearnerHome,
  type LearnerHeroIntent,
  type LearnerHomePlan,
} from "@veolms/contracts/learner-home-plan";

/** The course's own page: what it covers, and its curriculum. */
export function getEnrolledCourseOverviewHref(course: EnrolledCourse) {
  return `/courses/${encodeURIComponent(getEnrolledCourseKey(course))}/overview`;
}

/** What a course's name says under the pointer, where it leads to that page. */
export const VIEW_COURSE_CURRICULUM_HINT = "View course curriculum";

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
