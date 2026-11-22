export const PLAYER_FEEDBACK_DURATION_MS = 850;

// The play/pause circle in the middle of the video grows in, holds, and
// shrinks away over one second.
export const PLAYBACK_BEZEL_DURATION_MS = 1_000;

// A speed set from outside the player (`outside-speed`) is a sentence to read,
// not a glance.
export const OUTSIDE_SPEED_NOTICE_DURATION_MS = 6_000;

// Repeated mobile seek taps remain active only while their HUD number is visible.
export const MOBILE_SEEK_IDLE_DELAY_MS = PLAYER_FEEDBACK_DURATION_MS;

/**
 * The seconds a seek's feedback shows: how far the run of presses or taps
 * actually moved playback. At the start (or the end) a seek moves nothing,
 * and the feedback then shows the one step, as YouTube does ("−5"), never a
 * total that keeps growing past 0:00.
 */
export function seekFeedbackSeconds(
  movedSeconds: number,
  stepSeconds: number,
): number {
  const moved = Math.round(Math.abs(movedSeconds));
  return moved > 0 ? moved : Math.max(1, Math.round(Math.abs(stepSeconds)));
}
