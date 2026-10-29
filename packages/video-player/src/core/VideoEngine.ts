import type { VideoEngineEventMap } from "./events";
import type { VideoEngineSnapshot } from "./snapshot";
import type {
  VideoAudioTrack,
  VideoEngineCapabilities,
  VideoEngineName,
  VideoLoadOptions,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "./types";

export interface VideoEngine {
  readonly name: VideoEngineName;

  attach(media: HTMLMediaElement): Promise<void>;
  detach(): Promise<void>;
  /**
   * A second, hidden media element the engine may prepare a likely next
   * video in (a hovered or upcoming lesson), decoded to its first frame. A
   * load of that video then switches to it at once instead of starting over
   * in the visible element; the two elements trade places, announced with
   * `mediachange`. Engines without this support leave it out.
   */
  setStandbyMedia?(media: HTMLMediaElement | null): void;
  /**
   * Limits how far ahead of the playhead the engine fetches; `null` gives
   * the source its own buffer back. A timeline drag resting on a moment
   * fetches just the segment there. Engines without control over buffering
   * leave it out.
   */
  setBufferAheadLimit?(seconds: number | null): void;
  load(source: VideoSource, options?: VideoLoadOptions): Promise<void>;
  unload(): Promise<void>;
  /**
   * Stops what is loaded outright, for good: paused, its source taken off
   * the element and the streaming player behind it destroyed, so nothing of
   * it can play on. The engine stays usable for the next load. Engines
   * without a player of their own leave it out (`unload` is used instead).
   */
  stop?(): Promise<void>;
  destroy(): Promise<void>;

  play(): Promise<void>;
  pause(): void;
  seek(time: number): void;
  setVolume(volume: number): void;
  setMuted(muted: boolean): void;
  setPlaybackRate(rate: number): void;

  getCapabilities(): VideoEngineCapabilities;
  getSnapshot(): VideoEngineSnapshot;

  getQualities(): readonly VideoQuality[];
  selectQuality(id: string): void;
  enableAutoQuality(): void;

  getAudioTracks(): readonly VideoAudioTrack[];
  selectAudioTrack(id: string): void;

  getTextTracks(): readonly VideoTextTrack[];
  selectTextTrack(id: string | null): void;

  on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void;
}
