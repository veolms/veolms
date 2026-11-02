import { useEffect, useRef, type RefObject } from "react";
import type { SubscribeOutsideFraction } from "./useLearningMiniPlayerGestures";

interface SwipeVolumePlayer {
  getSnapshot(): {
    media: {
      muted: boolean;
      paused: boolean;
      playing: boolean;
      volume: number;
    };
  };
  play(): Promise<void>;
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

/** A change of volume smaller than this is not made: it is not heard. */
const VOLUME_STEP = 0.01;

/**
 * A playing mini player's sound while it is dragged out of the window and
 * swiped away. Dragged, its volume drops by as much of it as is out of the
 * window (a quarter out, a quarter quieter); brought back in, the volume is
 * the learner's again. Swiped away, it fades to nothing over the swipe's
 * animation, from wherever the drag had brought it.
 *
 * The share out of the window is listened to, not passed down as a prop,
 * and the volume is set at most once a frame: the player is not drawn
 * again while it is dragged, which a phone could not keep up with.
 *
 * A video playing when the drag began and paused during it (a phone's
 * browser may pause a video that is mostly off the screen) plays again
 * once the player is back.
 *
 * Returns the learner's own volume while the sound is lowered (null
 * otherwise): nothing heard in between is the learner's, so it is what is
 * saved or handed on, and changes made meanwhile are not saved.
 */
export function useMiniPlayerSwipeVolume(
  playerRef: RefObject<SwipeVolumePlayer | null>,
  subscribeOutsideFraction: SubscribeOutsideFraction | undefined,
  dismissing: boolean,
) {
  const heldVolumeRef = useRef<number | null>(null);
  const playingAtDragStartRef = useRef(false);
  const releaseTimerRef = useRef<number | null>(null);
  const dismissingRef = useRef(dismissing);
  dismissingRef.current = dismissing;

  const cancelRelease = () => {
    if (releaseTimerRef.current === null) return;
    window.clearTimeout(releaseTimerRef.current);
    releaseTimerRef.current = null;
  };

  useEffect(() => {
    if (!subscribeOutsideFraction) return undefined;
    let frame: number | null = null;
    let pendingFraction = 0;

    const apply = () => {
      frame = null;
      if (dismissingRef.current) return;
      const player = playerRef.current;
      if (!player) return;
      const fraction = pendingFraction;
      const media = player.getSnapshot().media;

      if (fraction > 0) {
        cancelRelease();
        if (heldVolumeRef.current === null) {
          playingAtDragStartRef.current = media.playing;
          if (!media.playing || media.muted || media.volume <= 0) return;
          heldVolumeRef.current = media.volume;
        }
        const volume = heldVolumeRef.current * (1 - fraction);
        if (Math.abs(volume - media.volume) >= VOLUME_STEP || volume === 0) {
          player.setVolume(volume);
        }
        return;
      }

      // Back in the window.
      if (playingAtDragStartRef.current && media.paused) {
        void player.play().catch(() => undefined);
      }
      playingAtDragStartRef.current = false;
      const held = heldVolumeRef.current;
      if (held === null || releaseTimerRef.current !== null) return;
      player.setVolume(held);
      releaseTimerRef.current = window.setTimeout(() => {
        releaseTimerRef.current = null;
        heldVolumeRef.current = null;
      }, RESTORE_SETTLE_MS);
    };

    const unsubscribe = subscribeOutsideFraction((fraction) => {
      pendingFraction = fraction;
      frame ??= window.requestAnimationFrame(apply);
    });
    return () => {
      unsubscribe();
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, [playerRef, subscribeOutsideFraction]);

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
