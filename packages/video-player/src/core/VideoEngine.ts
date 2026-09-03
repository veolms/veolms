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
  load(source: VideoSource, options?: VideoLoadOptions): Promise<void>;
  unload(): Promise<void>;
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
