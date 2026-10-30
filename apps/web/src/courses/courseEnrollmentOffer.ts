/**
 * What the price card on a course's overview page offers its viewer.
 *
 * A course that is access-restricted and has no price is entered only by a
 * grant from staff; checkout refuses it. The card used to offer "Enroll for
 * Free" on it all the same (and the "pay what you want" amounts), and the
 * click then showed the refusal. The course overview now says whether the
 * course can be taken by the viewer themselves (`canSelfEnroll`), and the
 * card asks here before it offers anything.
 */
export type CourseEnrollmentOffer =
  /** Holds the course, or manages it: "Continue Learning", nothing to buy. */
  | "continue"
  /** The creator's read-only preview: a learner's buttons, which do nothing. */
  | "preview"
  /** A free course anyone may take: "Enroll for Free" and an optional amount. */
  | "enroll-free"
  /** A course that is sold: pay, a coupon, optionally pay more. */
  | "purchase"
  /** Nothing to enrol in or pay for: one line saying entry is by invitation. */
  | "invitation-only";

export interface CourseEnrollmentOfferInput {
  /** Its creator or an admin, looking at the course as they manage it. */
  managesCourse: boolean;
  /** The creator's read-only preview inside the course editor. */
  isPreview: boolean;
  /** A signed-in viewer who already holds the course. */
  isEnrolled: boolean;
  /** The course costs nothing. */
  isFree: boolean;
  /**
   * The overview's `canSelfEnroll`. Only an explicit `false` closes
   * enrolment: the field is absent from a preview built in the editor and
   * from an overview cached before it existed, and both keep their buttons.
   */
  canSelfEnroll: boolean | undefined;
}

export function resolveCourseEnrollmentOffer({
  managesCourse,
  isPreview,
  isEnrolled,
  isFree,
  canSelfEnroll,
}: CourseEnrollmentOfferInput): CourseEnrollmentOffer {
  // Whoever already has the course keeps "Continue Learning", restricted or
  // not: the restriction only stops new people enrolling themselves.
  if (managesCourse || isEnrolled) return "continue";
  if (isPreview) return "preview";
  if (canSelfEnroll === false) return "invitation-only";
  return isFree ? "enroll-free" : "purchase";
}

/** Shown on the card in place of the enrol button when entry is by grant. */
export const INVITATION_ONLY_MESSAGE =
  "Enrollment in this course is by invitation.";
