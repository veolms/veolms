import type {
  CourseAccessLevel,
  CourseLockedLessonsNeed,
  CourseViewerRole,
} from "@veolms/contracts";

import { ADMIN_ROLE } from "../auth/index.ts";
import { isOpenFreeCourse } from "../access/index.ts";

export interface AccessViewer {
  id: string;
  roles: readonly string[];
  /** The viewer asked to be answered as a learner (their Student view). */
  learnerView: boolean;
  /** Holds `course.preview`: drafts and lessons open to them as to staff. */
  previewsEveryCourse: boolean;
}

export interface AccessDecision {
  viewer: CourseViewerRole;
  access: CourseAccessLevel;
  firstLessonOpen: boolean;
  lockedLessonsNeed: CourseLockedLessonsNeed | null;
}

/**
 * Which lessons of a course a viewer may open, by the rule lesson playback
 * (`assertPlaybackAccess`) and lesson text (`createLessonContentAccess`)
 * apply, so what a page shows unlocked is what the server then plays:
 *
 * - its creator, an admin and a reviewer open every lesson, in the Student
 *   view too;
 * - anyone signed in opens every lesson of a free course that is not
 *   restricted, and a visitor who is not signed in its first lesson;
 * - anyone else opens every lesson only while holding a grant for it;
 * - preview lessons open for everyone (the page knows which they are).
 */
export function decideCourseAccess(input: {
  course: {
    creatorId: string | null;
    storedPricingType: string | null;
    accessType: string | null;
    canSelfEnroll: boolean;
  };
  viewer: AccessViewer | undefined;
  holdsGrant: boolean;
}): AccessDecision {
  const { course, viewer, holdsGrant } = input;
  const openFree = isOpenFreeCourse({
    pricing_type: course.storedPricingType,
    access_type: course.accessType,
  });

  if (!viewer) {
    return {
      viewer: "guest",
      access: "limited",
      firstLessonOpen: openFree,
      lockedLessonsNeed: "sign-in",
    };
  }

  const isCreator = course.creatorId === viewer.id;
  const isAdmin = viewer.roles.some(
    (role) => role.trim().toLowerCase() === ADMIN_ROLE,
  );
  const role: CourseViewerRole =
    (isCreator || isAdmin) && !viewer.learnerView ? "manager" : "learner";

  const full =
    isCreator ||
    isAdmin ||
    viewer.previewsEveryCourse ||
    openFree ||
    holdsGrant;
  if (full) {
    return {
      viewer: role,
      access: "full",
      firstLessonOpen: true,
      lockedLessonsNeed: null,
    };
  }
  return {
    viewer: role,
    access: "limited",
    firstLessonOpen: false,
    lockedLessonsNeed: course.canSelfEnroll ? "purchase" : "grant",
  };
}

/** Whether a grant counts now: active and not past its end. */
export function isGrantInForce(
  grant: { status: string; validUntil?: Date | string | null },
  now: Date,
): boolean {
  if (grant.status !== "active") return false;
  return !grant.validUntil || new Date(grant.validUntil) > now;
}
