import type { VideoEngineError } from "./errors";
import type { VideoEngineSnapshot } from "./snapshot";
import type {
  VideoAudioTrack,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "./types";

export interface VideoEngineEventMap {
  snapshotchange: VideoEngineSnapshot;
  loadstart: { source: VideoSource };
  loaded: { source: VideoSource; duration: number };
  unloaded: undefined;
  play: undefined;
  pause: undefined;
  playing: undefined;
  ended: undefined;
  timeupdate: { currentTime: number; duration: number };
  durationchange: { duration: number };
  seeking: { currentTime: number };
  seeked: { currentTime: number };
  bufferingchange: { buffering: boolean };
  volumechange: { volume: number; muted: boolean };
  ratechange: { playbackRate: number };
  qualitychange: { quality: VideoQuality | null; auto: boolean };
  qualitieschange: { qualities: readonly VideoQuality[]; auto: boolean };
  audiotrackchange: { track: VideoAudioTrack | null };
  texttrackchange: { track: VideoTextTrack | null };
  trackschanged: {
    qualities: readonly VideoQuality[];
    audioTracks: readonly VideoAudioTrack[];
    textTracks: readonly VideoTextTrack[];
  };
  manifestupdated: undefined;
  error: { error: VideoEngineError };
}

export type VideoEngineEventType = keyof VideoEngineEventMap;

export type VideoEngineEvent = {
  [Type in VideoEngineEventType]: {
    type: Type;
    detail: VideoEngineEventMap[Type];
  };
}[VideoEngineEventType];
