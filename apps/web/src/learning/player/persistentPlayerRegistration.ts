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
