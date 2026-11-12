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
  /**
   * The streaming engine itself is holding playback for data: Shaka sets the
   * video's rate to 0 from under 0.5 s ahead until its rebuffering goal is
   * buffered, so the picture stops with data still at the playhead. Only an
   * engine that holds like this sets it; a native player leaves it false.
   */
  bufferingHold: boolean;
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
    bufferingHold: false,
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
