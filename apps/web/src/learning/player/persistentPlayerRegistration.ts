import type { LearningPlayerPresentation } from "./PersistentLearningPlayerHost";

interface PersistentPlayerCleanupState {
  presentation: LearningPlayerPresentation;
  restoreVersionAtRegistration: number;
  currentRestoreVersion: number;
}

/**
 * Registration cleanup runs in a microtask after its learning route unmounts.
 * A restore can win that race, so only the registration version that initiated
 * the cleanup is allowed to demote the still-full player.
 */
export const shouldDemoteDetachedPersistentPlayer = ({
  presentation,
  restoreVersionAtRegistration,
  currentRestoreVersion,
}: PersistentPlayerCleanupState) =>
  presentation === "full" &&
  currentRestoreVersion === restoreVersionAtRegistration;

/**
 * Playing the same course that is already in the mini player should expand
 * into the full lesson player instead of leaving a hollow learning page.
 */
export const shouldRestoreMiniPlayerForMatchingCourse = ({
  presentation,
  activeCourseRouteKey,
  requestedCourseRouteKey,
}: {
  presentation: LearningPlayerPresentation;
  activeCourseRouteKey?: string | null;
  requestedCourseRouteKey?: string | null;
}) =>
  presentation === "mini" &&
  Boolean(activeCourseRouteKey) &&
  activeCourseRouteKey === requestedCourseRouteKey;
