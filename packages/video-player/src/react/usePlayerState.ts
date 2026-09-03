import { useCallback, useRef, useSyncExternalStore } from "react";
import { usePlayerController } from "./context";
import type { PlayerSnapshot } from "./playerState";

export type PlayerStateSelector<Selected> = (
  snapshot: PlayerSnapshot,
) => Selected;

export function usePlayerState<Selected>(
  selector: PlayerStateSelector<Selected>,
  isEqual: (left: Selected, right: Selected) => boolean = Object.is,
): Selected {
  const controller = usePlayerController();
  const selectorRef = useRef(selector);
  const equalityRef = useRef(isEqual);
  const selectedRef = useRef<Selected | undefined>(undefined);
  const hasSelectionRef = useRef(false);
  selectorRef.current = selector;
  equalityRef.current = isEqual;

  const getSelectedSnapshot = useCallback(() => {
    const next = selectorRef.current(controller.getSnapshot());
    if (
      hasSelectionRef.current &&
      selectedRef.current !== undefined &&
      equalityRef.current(selectedRef.current, next)
    ) {
      return selectedRef.current;
    }
    hasSelectionRef.current = true;
    selectedRef.current = next;
    return next;
  }, [controller]);

  return useSyncExternalStore(
    controller.subscribe,
    getSelectedSnapshot,
    getSelectedSnapshot,
  );
}

export const usePlaybackState = () =>
  usePlayerState(({ media }) => ({
    paused: media.paused,
    playing: media.playing,
    buffering: media.buffering,
    ended: media.ended,
  }), shallowEqual);

export const useCurrentTime = () =>
  usePlayerState(({ media }) => media.currentTime);

export const useDuration = () =>
  usePlayerState(({ media }) => media.duration);

export const useVolume = () =>
  usePlayerState(({ media }) => ({
    volume: media.volume,
    muted: media.muted,
  }), shallowEqual);

export const useQuality = () =>
  usePlayerState(({ media }) => ({
    auto: media.autoQuality,
    selectedId: media.selectedQualityId,
    qualities: media.qualities,
  }), shallowEqual);

export const useTracks = () =>
  usePlayerState(({ media }) => ({
    audioTracks: media.audioTracks,
    textTracks: media.textTracks,
    selectedAudioTrackId: media.selectedAudioTrackId,
    selectedTextTrackId: media.selectedTextTrackId,
  }), shallowEqual);

export const useChapters = () =>
  usePlayerState((snapshot) => ({
    chapters: snapshot.chapters,
    activeChapterId: snapshot.activeChapterId,
  }), shallowEqual);

export const usePlayerCapabilities = () =>
  usePlayerState(({ capabilities }) => capabilities, shallowEqual);

function shallowEqual<Shape extends object>(left: Shape, right: Shape): boolean {
  if (left === right) return true;
  const keys = Object.keys(left) as Array<keyof Shape>;
  if (keys.length !== Object.keys(right).length) return false;
  return keys.every((key) => Object.is(left[key], right[key]));
}
