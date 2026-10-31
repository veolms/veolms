import type { LearningProgressPlaying } from "@veolms/contracts";

export interface PlaybackDeniedPlayingOn {
  userAgent: string | null;
  location: string | null;
  lessonTitle: string | null;
  since: string;
}

interface PlayingClaimState {
  lessonId: string;
  isFreshClaim: boolean;
}

const activeClaimsByCourse = new Map<string, PlayingClaimState>();
const subscribersByCourse = new Map<string, Set<() => void>>();
const conflictListenersByCourse = new Map<
  string,
  Set<(conflict: PlaybackDeniedPlayingOn) => void>
>();
const activeConflictsByCourse = new Map<string, PlaybackDeniedPlayingOn>();

/**
 * Called on the player's `play` and `playing` events.
 * Remembers the lesson and sets a "fresh claim" flag.
 * If it's a fresh claim, notifies subscribers so an immediate flush is triggered.
 */
export function markPlaying(courseKey: string, lessonId: string): void {
  // Clear any existing conflict when play begins
  activeConflictsByCourse.delete(courseKey);

  const current = activeClaimsByCourse.get(courseKey);
  const isNewOrDifferent = !current || current.lessonId !== lessonId;

  activeClaimsByCourse.set(courseKey, {
    lessonId,
    isFreshClaim: isNewOrDifferent ? true : current.isFreshClaim,
  });

  if (isNewOrDifferent) {
    const listeners = subscribersByCourse.get(courseKey);
    if (listeners) {
      for (const listener of listeners) {
        listener();
      }
    }
  }
}

/**
 * Called on `pause`, `ended`, `unloaded`, `error`.
 * Clears the active claim for this course.
 */
export function markNotPlaying(courseKey: string): void {
  activeClaimsByCourse.delete(courseKey);
}

/**
 * Checks if a fresh playback claim is currently pending for this course.
 */
export function hasFreshClaim(courseKey: string): boolean {
  return activeClaimsByCourse.get(courseKey)?.isFreshClaim ?? false;
}

/**
 * Returns `{ lessonId, event: "play" | "heartbeat" }` or `undefined`,
 * clearing the fresh flag; the flush paths call it when building the payload.
 */
export function takePlayingReport(
  courseKey: string,
): LearningProgressPlaying | undefined {
  const current = activeClaimsByCourse.get(courseKey);
  if (!current) return undefined;

  const event = current.isFreshClaim ? "play" : "heartbeat";
  current.isFreshClaim = false;

  return {
    lessonId: current.lessonId,
    event,
  };
}

/**
 * `markPlaying` with a fresh claim asks for an immediate flush so the new
 * device claims at once instead of waiting for the next 15 second tick.
 * `useLearningProgress` and `detachedLearningProgress` subscribe here.
 */
export function subscribeToClaimRequests(
  courseKey: string,
  cb: () => void,
): () => void {
  let listeners = subscribersByCourse.get(courseKey);
  if (!listeners) {
    listeners = new Set();
    subscribersByCourse.set(courseKey, listeners);
  }
  listeners.add(cb);

  return () => {
    listeners?.delete(cb);
    if (listeners?.size === 0) {
      subscribersByCourse.delete(courseKey);
    }
  };
}

/**
 * Notifies players that playback on this device was paused because another
 * session claimed playback.
 */
export function notifyPlaybackConflict(
  courseKey: string,
  playingOn: PlaybackDeniedPlayingOn,
): void {
  activeConflictsByCourse.set(courseKey, playingOn);
  const listeners = conflictListenersByCourse.get(courseKey);
  if (listeners) {
    for (const listener of listeners) {
      listener(playingOn);
    }
  }
}

export function clearPlaybackConflict(courseKey: string): void {
  activeConflictsByCourse.delete(courseKey);
}

export function getPlaybackConflict(
  courseKey: string,
): PlaybackDeniedPlayingOn | null {
  return activeConflictsByCourse.get(courseKey) ?? null;
}

export function subscribeToPlaybackConflict(
  courseKey: string,
  cb: (conflict: PlaybackDeniedPlayingOn) => void,
): () => void {
  let listeners = conflictListenersByCourse.get(courseKey);
  if (!listeners) {
    listeners = new Set();
    conflictListenersByCourse.set(courseKey, listeners);
  }
  listeners.add(cb);

  return () => {
    listeners?.delete(cb);
    if (listeners?.size === 0) {
      conflictListenersByCourse.delete(courseKey);
    }
  };
}
