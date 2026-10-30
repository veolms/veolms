import type { CourseSummary, HomeDiscoveryResponse } from "@veolms/contracts";
import { HOME_PAGE_DISCUSSIONS_PER_PAGE } from "@veolms/contracts/home-page-defaults";

/**
 * The guest home is a fixed, prerendered page: one row of courses per section
 * and the first page of student comments, selected when the site is built.
 * The rest of the comments arrive with the page's own request, after load.
 *
 * A row shows two, three or four cards depending on the space it has, so four
 * are selected and the layout hides the ones that do not fit.
 */
export const GUEST_HOME_COURSES_PER_SECTION = 4;
export const GUEST_HOME_DISCUSSION_COUNT = HOME_PAGE_DISCUSSIONS_PER_PAGE;

export interface GuestHomeCourses {
  popularCourses: CourseSummary[];
  freeCourses: CourseSummary[];
}

/**
 * Picks the courses each guest home row shows. The free row prefers courses
 * that the popular row does not already show, and only repeats one when there
 * are not enough other free courses to fill the row.
 *
 * Selecting from an already selected result returns the same courses, so the
 * build can trim its data with this and the page can apply it again.
 */
export function selectGuestHomeCourses(
  discovery: Pick<HomeDiscoveryResponse, "popularCourses" | "freeCourses">,
): GuestHomeCourses {
  const popularCourses = discovery.popularCourses.slice(
    0,
    GUEST_HOME_COURSES_PER_SECTION,
  );
  const shownIds = new Set(popularCourses.map((course) => course.id));
  const freeCourses = [
    ...discovery.freeCourses.filter((course) => !shownIds.has(course.id)),
    ...discovery.freeCourses.filter((course) => shownIds.has(course.id)),
  ].slice(0, GUEST_HOME_COURSES_PER_SECTION);

  return { popularCourses, freeCourses };
}
