export const PLAYER_FEEDBACK_DURATION_MS = 850;

// The play/pause circle in the middle of the video grows in, holds, and
// shrinks away over one second.
export const PLAYBACK_BEZEL_DURATION_MS = 1_000;

// A speed set from outside the player (`outside-speed`) is a sentence to read,
// not a glance.
export const OUTSIDE_SPEED_NOTICE_DURATION_MS = 6_000;

// Repeated mobile seek taps remain active only while their HUD number is visible.
export const MOBILE_SEEK_IDLE_DELAY_MS = PLAYER_FEEDBACK_DURATION_MS;
