/**
 * Whether a course is open without a grant: it is free and not
 * access-restricted. A restricted course needs a grant even when it costs
 * nothing. A course with no pricing yet is not open.
 */
export function isOpenFreeCourse(course: {
  pricing_type: string | null | undefined;
  access_type: string | null | undefined;
}): boolean {
  return course.pricing_type === "free" && course.access_type !== "restricted";
}

/**
 * Whether a course is one nobody may take for themselves: it is
 * access-restricted and has no price to pay. Such a course is entered only
 * by a grant that staff give.
 *
 * Checkout asks this before it prices a course. Enrolling in a course that
 * costs nothing creates a grant, so without the question a restricted free
 * course could be opened by anyone who posted a checkout for it, and every
 * check that asks "does the viewer hold a grant" then let them in.
 *
 * "No price to pay" follows checkout's own reading, not `isOpenFreeCourse`'s:
 * checkout charges nothing for any course that is not priced as paid, a
 * course with no pricing row included. A restricted course that is sold is
 * not covered: buying it is how its grant is obtained.
 */
export function isRestrictedFreeCourse(course: {
  pricing_type: string | null | undefined;
  access_type: string | null | undefined;
}): boolean {
  return course.access_type === "restricted" && course.pricing_type !== "paid";
}

/**
 * What a course's status means for a learner, that is for anyone who does
 * not manage the course:
 *
 * - `open`: published. The course's own rules (free, paid, restricted,
 *   preview lessons) decide the rest.
 * - `holders_only`: archived. Archiving stops new enrolments and purchases;
 *   it does not take the course away from those who already have it. Nobody
 *   else is shown it, not even its preview lessons or, when it is free, its
 *   open lessons.
 * - `closed`: a draft, or anything else. No learner is shown it.
 *
 * A course in the bin is not decided here: every lookup leaves it out before
 * its status is read.
 */
export type LearnerCourseGate = "open" | "holders_only" | "closed";

export function learnerCourseGate(
  status: string | null | undefined,
): LearnerCourseGate {
  if (status === "published") return "open";
  if (status === "archived") return "holders_only";
  return "closed";
}

/**
 * Whether a learner may be shown a course of this status at all.
 * `holdsActiveAccess` is whether they hold a live grant for it. Passing this
 * is not access to the course: a published course still applies its own
 * rules afterwards.
 */
export function isCourseOpenToLearner(
  status: string | null | undefined,
  holdsActiveAccess: boolean,
): boolean {
  const gate = learnerCourseGate(status);
  return gate === "open" || (gate === "holders_only" && holdsActiveAccess);
}

/**
 * Whether a course can be enrolled in or bought. Only a published course
 * can: an archived one keeps its learners and takes no new ones.
 */
export function isCourseOpenForEnrolment(
  status: string | null | undefined,
): boolean {
  return learnerCourseGate(status) === "open";
}
