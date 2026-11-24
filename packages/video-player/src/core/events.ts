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
  qualitychange: {
    quality: VideoQuality | null;
    auto: boolean;
    /**
     * The player itself left a chosen quality the connection could not
     * carry and went to automatic quality.
     */
    fallback?: boolean;
  };
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
  /**
   * A segment (or a licence) could not be fetched and the engine will ask
   * for it again in `delaySeconds` (see ShakaVideoEngine's streaming
   * retries); playback waits meanwhile, with the loader up once what is
   * buffered runs out. `attempt` counts the retries in a row since the
   * last segment arrived; `offline` says the browser reports no network,
   * so the next try waits for it to come back.
   */
  streamingretry: {
    attempt: number;
    delaySeconds: number;
    code: string;
    httpStatus: number | null;
    offline: boolean;
  };
  /** Segments arrive again after one or more `streamingretry`. */
  streamingrecovered: { attempts: number };
  /**
   * A video played faster than 2x has stood still `stops` times within half
   * a minute: the device (`cause` "device", plenty was downloaded) or its
   * connection or processor (`cause` "loading", nothing was) is not keeping
   * up with `playbackRate` (see `PlaybackStrainDetector`).
   */
  playbackstrain: {
    playbackRate: number;
    stops: number;
    cause: "device" | "loading";
  };
  /**
   * A short message for the learner about what the player did on its own
   * (a decode-error recovery: "Switched to 720p for now"), shown like the
   * notice for a speed set outside the player.
   */
  playbacknotice: { title: string; detail?: string };
  /**
   * The engine now plays in another media element: the standby one it had
   * prepared the next video in (see `VideoEngine.setStandbyMedia`).
   */
  mediachange: { media: HTMLMediaElement; standby: HTMLMediaElement | null };
}

export type VideoEngineEventType = keyof VideoEngineEventMap;

export type VideoEngineEvent = {
  [Type in VideoEngineEventType]: {
    type: Type;
    detail: VideoEngineEventMap[Type];
  };
}[VideoEngineEventType];
