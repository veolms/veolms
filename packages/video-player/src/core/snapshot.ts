import type { VideoEngineError } from "./errors";
import type {
  EngineLifecycleState,
  TimeRange,
  VideoAudioTrack,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "./types";

export interface VideoEngineSnapshot {
  lifecycle: EngineLifecycleState;
  source: VideoSource | null;
  paused: boolean;
  playing: boolean;
  buffering: boolean;
  seeking: boolean;
  ended: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  playbackRate: number;
  buffered: readonly TimeRange[];
  seekable: readonly TimeRange[];
  autoQuality: boolean;
  selectedQualityId: string | null;
  selectedAudioTrackId: string | null;
  selectedTextTrackId: string | null;
  qualities: readonly VideoQuality[];
  audioTracks: readonly VideoAudioTrack[];
  textTracks: readonly VideoTextTrack[];
  error: VideoEngineError | null;
}

export function createInitialVideoEngineSnapshot(): VideoEngineSnapshot {
  return {
    lifecycle: "idle",
    source: null,
    paused: true,
    playing: false,
    buffering: false,
    seeking: false,
    ended: false,
    currentTime: 0,
    duration: 0,
    volume: 1,
    muted: false,
    playbackRate: 1,
    buffered: [],
    seekable: [],
    autoQuality: true,
    selectedQualityId: null,
    selectedAudioTrackId: null,
    selectedTextTrackId: null,
    qualities: [],
    audioTracks: [],
    textTracks: [],
    error: null,
  };
}

export function cloneVideoEngineSnapshot(
  snapshot: VideoEngineSnapshot,
): VideoEngineSnapshot {
  return {
    ...snapshot,
    buffered: snapshot.buffered.map((range) => ({ ...range })),
    seekable: snapshot.seekable.map((range) => ({ ...range })),
    qualities: snapshot.qualities.map((quality) => ({ ...quality })),
    audioTracks: snapshot.audioTracks.map((track) => ({
      ...track,
      roles: [...track.roles],
    })),
    textTracks: snapshot.textTracks.map((track) => ({
      ...track,
      roles: [...track.roles],
    })),
  };
}
