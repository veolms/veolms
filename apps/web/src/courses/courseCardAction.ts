/**
 * What a course card's main button offers someone who does not manage the
 * course.
 *
 * A course that is access-restricted and has no price is entered only by a
 * grant from staff; nobody can enrol in it themselves. The card used to say
 * "Enroll Now" on it all the same, because the course list did not say
 * which courses those are. The list now carries `canSelfEnroll` (the same
 * value as the course overview's), and the card asks here before it offers
 * enrolment. The button opens the course overview either way; only what it
 * promises changes.
 */
export type CourseCardLearnerAction =
  /** Holds the course: "Continue Learning", or "Start Learning" before any progress. */
  | "continue"
  /** "View Course": the overview is all the card leads to. */
  | "view"
  /** "Enroll Now". */
  | "enroll";

export interface CourseCardOfferInput {
  /** The card of the public pages, as opposed to the catalogue's. */
  isPublic: boolean;
  /** What a public card was asked to show; a catalogue card always enrols. */
  publicAction: "view" | "enroll";
  /**
   * The course list's `canSelfEnroll`. Only an explicit `false` closes
   * enrolment: a course from a list built before the field existed, and a
   * course that did not come from the list, keep their button.
   */
  canSelfEnroll: boolean | undefined;
}

/** Whether the card may offer enrolment at all. */
export function courseCardOffersEnrollment({
  isPublic,
  publicAction,
  canSelfEnroll,
}: CourseCardOfferInput): boolean {
  if (canSelfEnroll === false) return false;
  return !isPublic || publicAction === "enroll";
}

export function resolveCourseCardLearnerAction(
  input: CourseCardOfferInput & {
    /** A signed-in viewer who already holds the course. */
    enrolled: boolean;
  },
): CourseCardLearnerAction {
  // Whoever already has the course keeps "Continue Learning", restricted or
  // not: the restriction only stops new people enrolling themselves.
  if (input.enrolled) return "continue";
  return courseCardOffersEnrollment(input) ? "enroll" : "view";
}
