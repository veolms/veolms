import type { VideoEngineSnapshot } from "./snapshot";

/** How much must lie buffered ahead of the playhead to count as playable. */
export const BUFFERED_PLAYBACK_GRACE_SECONDS = 0.25;

/** Whether the playhead has at least a little buffered media ahead of it. */
export function isCurrentPositionBuffered(
  media: Pick<VideoEngineSnapshot, "buffered" | "currentTime">,
): boolean {
  return media.buffered.some(
    (range) =>
      media.currentTime >= range.start &&
      range.end - media.currentTime >= BUFFERED_PLAYBACK_GRACE_SECONDS,
  );
}

/**
 * Whether playback is truly held up for data. Two cases:
 *
 * - The streaming engine holds a playing video itself (`bufferingHold`):
 *   Shaka stops the picture with up to 0.5 s still buffered and waits for
 *   its rebuffering goal. Checking the buffer alone missed nearly every
 *   such freeze at 1x: a still "playing" picture with no loader. A paused
 *   video is not held up, whatever Shaka still reports.
 * - The engine says it is buffering AND nothing is buffered at the
 *   playhead. The flag alone is not enough: Safari on iPhone reports
 *   `waiting` and `stalled` for a video that has plenty buffered (a held or
 *   paused one, a native HLS stream between segments) and never a
 *   `canplay` after, so anything that hides while "buffering" went missing
 *   there for good. The native engine never sets the hold.
 */
export function isPlaybackStalled(
  media: Pick<
    VideoEngineSnapshot,
    "buffered" | "buffering" | "bufferingHold" | "currentTime" | "paused"
  >,
): boolean {
  if (media.bufferingHold && !media.paused) return true;
  return media.buffering && !isCurrentPositionBuffered(media);
}
