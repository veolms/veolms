import { useEffect, useRef, type RefObject } from "react";

interface SwipeVolumePlayer {
  getSnapshot(): {
    media: { muted: boolean; playing: boolean; volume: number };
  };
  setVolume(volume: number): void;
}

/**
 * How long the sound takes to fade when the player is swiped away: within
 * the swipe's own animation (`DISMISS_DURATION`, 200ms), so it is silent
 * just before the player is closed.
 */
const DISMISS_FADE_MS = 180;

/**
 * How long the learner's volume is still held after it is given back, so
 * the change it makes is not taken for one of the learner's own.
 */
const RESTORE_SETTLE_MS = 150;

/**
 * A playing mini player's sound while it is dragged out of the window and
 * swiped away. Dragged, its volume drops by as much of it as is out of the
 * window (a quarter out, a quarter quieter); brought back in, the volume is
 * the learner's again. Swiped away, it fades to nothing over the swipe's
 * animation, from wherever the drag had brought it.
 *
 * Returns the learner's own volume while the sound is lowered (null
 * otherwise): nothing heard in between is the learner's, so it is what is
 * saved or handed on, and changes made meanwhile are not saved.
 */
export function useMiniPlayerSwipeVolume(
  playerRef: RefObject<SwipeVolumePlayer | null>,
  outsideFraction: number,
  dismissing: boolean,
) {
  const heldVolumeRef = useRef<number | null>(null);
  const releaseTimerRef = useRef<number | null>(null);

  const cancelRelease = () => {
    if (releaseTimerRef.current === null) return;
    window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
  };

  useEffect(() => {
    if (dismissing) return;
    const player = playerRef.current;
    if (!player) return;
    if (outsideFraction > 0) {
      cancelRelease();
      if (heldVolumeRef.current === null) {
        const media = player.getSnapshot().media;
        if (!media.playing || media.muted || media.volume <= 0) return;
        heldVolumeRef.current = media.volume;
      }
      player.setVolume(heldVolumeRef.current * (1 - outsideFraction));
      return;
    }
    const held = heldVolumeRef.current;
    if (held === null || releaseTimerRef.current !== null) return;
    player.setVolume(held);
    releaseTimerRef.current = window.setTimeout(() => {
      releaseTimerRef.current = null;
      heldVolumeRef.current = null;
    }, RESTORE_SETTLE_MS);
  }, [dismissing, outsideFraction, playerRef]);

  useEffect(() => {
    if (!dismissing) return undefined;
    const player = playerRef.current;
    const media = player?.getSnapshot().media;
    if (!player || !media?.playing || media.muted || media.volume <= 0) {
      return undefined;
    }
    cancelRelease();
    heldVolumeRef.current ??= media.volume;
    const startVolume = media.volume;
    const startedAt = performance.now();
    let frame = window.requestAnimationFrame(function fade(now) {
      const progress = Math.min(1, (now - startedAt) / DISMISS_FADE_MS);
      player.setVolume(startVolume * (1 - progress));
      if (progress < 1) frame = window.requestAnimationFrame(fade);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [dismissing, playerRef]);

  useEffect(() => () => cancelRelease(), []);

  return heldVolumeRef;
}
