import { VideoEngineError } from "../core/errors";
import type { VideoEngineEventMap } from "../core/events";
import {
  createInitialVideoEngineSnapshot,
  type VideoEngineSnapshot,
} from "../core/snapshot";
import { TypedEventEmitter } from "../core/typed-emitter";
import type {
  VideoAudioTrack,
  VideoEngineCapabilities,
  VideoLoadOptions,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "../core/types";
import type { VideoEngine } from "../core/VideoEngine";

/** Small deterministic engine used by the package's React integration tests. */
export class FakeVideoEngine implements VideoEngine {
  readonly name = "fake" as const;

  readonly #events = new TypedEventEmitter<VideoEngineEventMap>();
  #snapshot: VideoEngineSnapshot;
  #media: HTMLMediaElement | null = null;

  constructor(duration = 120) {
    this.#snapshot = {
      ...createInitialVideoEngineSnapshot(),
      duration,
    };
  }

  async attach(media: HTMLMediaElement): Promise<void> {
    this.#media = media;
    this.update({ lifecycle: "attached" });
  }

  async detach(): Promise<void> {
    this.#media = null;
    this.update({ lifecycle: "idle" });
  }

  async load(source: VideoSource, options?: VideoLoadOptions): Promise<void> {
    this.update({
      lifecycle: "loading",
      source,
      currentTime: options?.startTime ?? source.startTime ?? 0,
      error: null,
    });
    this.#events.emit("loadstart", { source });
    this.update({ lifecycle: "ready" });
    this.#events.emit("loaded", { source, duration: this.#snapshot.duration });
  }

  async unload(): Promise<void> {
    this.update({
      ...createInitialVideoEngineSnapshot(),
      lifecycle: this.#media ? "attached" : "idle",
    });
    this.#events.emit("unloaded", undefined);
  }

  async destroy(): Promise<void> {
    this.#media = null;
    this.update({ lifecycle: "destroyed" });
    this.#events.clear();
  }

  async play(): Promise<void> {
    this.update({ paused: false, playing: true, ended: false });
    this.#events.emit("play", undefined);
    this.#events.emit("playing", undefined);
  }

  pause(): void {
    this.update({ paused: true, playing: false });
    this.#events.emit("pause", undefined);
  }

  seek(time: number): void {
    const duration = this.#snapshot.duration;
    const currentTime = Math.min(Math.max(0, time), duration || time);
    this.update({ currentTime, seeking: false });
    this.#events.emit("seeking", { currentTime });
    this.#events.emit("timeupdate", { currentTime, duration });
    this.#events.emit("seeked", { currentTime });
  }

  setVolume(volume: number): void {
    this.update({ volume });
    this.#events.emit("volumechange", {
      volume,
      muted: this.#snapshot.muted,
    });
  }

  setMuted(muted: boolean): void {
    this.update({ muted });
    this.#events.emit("volumechange", {
      volume: this.#snapshot.volume,
      muted,
    });
  }

  setPlaybackRate(playbackRate: number): void {
    this.update({ playbackRate });
    this.#events.emit("ratechange", { playbackRate });
  }

  getCapabilities(): VideoEngineCapabilities {
    return {
      browserSupported: true,
      adaptiveStreaming: true,
      drm: true,
      nativeHls: true,
      pictureInPicture: false,
    };
  }

  getSnapshot(): VideoEngineSnapshot {
    return this.#snapshot;
  }

  getQualities(): readonly VideoQuality[] {
    return this.#snapshot.qualities;
  }

  selectQuality(id: string): void {
    this.update({ selectedQualityId: id, autoQuality: false });
  }

  enableAutoQuality(): void {
    this.update({ selectedQualityId: null, autoQuality: true });
  }

  getAudioTracks(): readonly VideoAudioTrack[] {
    return this.#snapshot.audioTracks;
  }

  selectAudioTrack(id: string): void {
    this.update({ selectedAudioTrackId: id });
  }

  getTextTracks(): readonly VideoTextTrack[] {
    return this.#snapshot.textTracks;
  }

  selectTextTrack(id: string | null): void {
    this.update({ selectedTextTrackId: id });
  }

  on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }

  emitTimeUpdate(currentTime: number): void {
    this.update({ currentTime });
    this.#events.emit("timeupdate", {
      currentTime,
      duration: this.#snapshot.duration,
    });
  }

  emitError(
    error = new VideoEngineError({
      category: "NETWORK",
      code: "FAKE_NETWORK_ERROR",
      message: "The fake stream failed.",
      recoverable: true,
    }),
  ): void {
    this.update({ lifecycle: "error", error });
    this.#events.emit("error", { error });
  }

  setSnapshot(patch: Partial<VideoEngineSnapshot>): void {
    this.update(patch);
  }

  private update(patch: Partial<VideoEngineSnapshot>): void {
    this.#snapshot = { ...this.#snapshot, ...patch };
    this.#events.emit("snapshotchange", this.#snapshot);
  }
}
