import {
  VideoEngineError,
  normalizeUnknownError,
} from "../../core/errors";
import type { VideoEngineEventMap } from "../../core/events";
import {
  cloneVideoEngineSnapshot,
  createInitialVideoEngineSnapshot,
} from "../../core/snapshot";
import type { VideoEngineSnapshot } from "../../core/snapshot";
import { TypedEventEmitter } from "../../core/typed-emitter";
import type { VideoEngine } from "../../core/VideoEngine";
import type {
  TimeRange,
  VideoAudioTrack,
  VideoEngineCapabilities,
  VideoEngineName,
  VideoLoadOptions,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "../../core/types";

function readTimeRanges(ranges: TimeRanges | undefined): TimeRange[] {
  if (!ranges) {
    return [];
  }

  const result: TimeRange[] = [];
  for (let index = 0; index < ranges.length; index += 1) {
    result.push({ start: ranges.start(index), end: ranges.end(index) });
  }
  return result;
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function isExpectedPlayInterruption(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === "NotAllowedError" || error.name === "AbortError")
  );
}

function mediaErrorToVideoEngineError(
  mediaError: MediaError | null,
): VideoEngineError {
  const code = mediaError?.code ?? 0;
  const message = mediaError?.message || "The browser could not play this media.";

  if (code === 1) {
    return new VideoEngineError({
      category: "ABORTED",
      code: "MEDIA_ERR_ABORTED",
      message,
      fatal: false,
      recoverable: true,
      cause: mediaError,
    });
  }

  if (code === 2) {
    return new VideoEngineError({
      category: "NETWORK",
      code: "MEDIA_ERR_NETWORK",
      message,
      fatal: false,
      recoverable: true,
      cause: mediaError,
    });
  }

  if (code === 3) {
    return new VideoEngineError({
      category: "MEDIA",
      code: "MEDIA_ERR_DECODE",
      message,
      cause: mediaError,
    });
  }

  if (code === 4) {
    return new VideoEngineError({
      category: "UNSUPPORTED",
      code: "MEDIA_ERR_SRC_NOT_SUPPORTED",
      message,
      cause: mediaError,
    });
  }

  return new VideoEngineError({
    category: "MEDIA",
    code: "MEDIA_ERR_UNKNOWN",
    message,
    cause: mediaError,
  });
}

export abstract class MediaElementEngineBase implements VideoEngine {
  abstract readonly name: VideoEngineName;

  readonly #events = new TypedEventEmitter<VideoEngineEventMap>();
  readonly #mediaListeners = new Map<string, EventListener>();
  #media: HTMLMediaElement | null = null;
  #snapshot = createInitialVideoEngineSnapshot();
  #operationGeneration = 0;

  async attach(media: HTMLMediaElement): Promise<void> {
    this.assertNotDestroyed();
    if (this.#media === media) {
      return;
    }

    if (this.#media) {
      await this.detach();
    }

    const generation = this.beginOperation();
    this.#media = media;
    this.bindMediaEvents(media);
    this.syncMediaState();
    this.updateSnapshot({ lifecycle: "attached", error: null });

    try {
      await this.onAttached(media);
      if (!this.isCurrentOperation(generation)) {
        if (this.#snapshot.lifecycle === "destroyed") {
          await this.onDestroying(null);
        } else {
          await this.onDetaching(media);
        }
        throw new VideoEngineError({
          category: "ABORTED",
          code: "ATTACH_SUPERSEDED",
          message: "Media attachment was superseded by a newer lifecycle operation.",
          fatal: false,
          recoverable: true,
        });
      }
    } catch (error) {
      const normalized = normalizeUnknownError(error, {
        category: "PLAYER",
        code: "ATTACH_FAILED",
      });
      if (this.isCurrentOperation(generation)) {
        this.emitError(normalized);
      }
      throw normalized;
    }
  }

  async detach(): Promise<void> {
    this.assertNotDestroyed();
    const media = this.#media;
    if (!media) {
      return;
    }

    this.invalidateOperations();
    try {
      await this.onDetaching(media);
    } finally {
      this.unbindMediaEvents(media);
      this.#media = null;
      this.#snapshot = {
        ...createInitialVideoEngineSnapshot(),
        lifecycle: "idle",
      };
      this.emitSnapshot();
    }
  }

  abstract load(
    source: VideoSource,
    options?: VideoLoadOptions,
  ): Promise<void>;

  abstract unload(): Promise<void>;

  async destroy(): Promise<void> {
    if (this.#snapshot.lifecycle === "destroyed") {
      return;
    }

    this.invalidateOperations();
    const media = this.#media;
    let destroyError: unknown;

    try {
      await this.onDestroying(media);
    } catch (error) {
      destroyError = error;
    } finally {
      if (media) {
        this.unbindMediaEvents(media);
      }
      this.#media = null;
      this.#snapshot = {
        ...createInitialVideoEngineSnapshot(),
        lifecycle: "destroyed",
      };
      this.emitSnapshot();
      this.#events.clear();
    }

    if (destroyError !== undefined) {
      throw normalizeUnknownError(destroyError, {
        category: "PLAYER",
        code: "DESTROY_FAILED",
      });
    }
  }

  async play(): Promise<void> {
    const media = this.requireMedia();
    try {
      await media.play();
    } catch (error) {
      const normalized = normalizeUnknownError(error, {
        category: "MEDIA",
        code: "PLAY_FAILED",
        fatal: false,
        recoverable: true,
      });
      // Autoplay policy rejection and a source-switch AbortError are expected
      // control-flow states, not broken media. Keep the player paused without
      // replacing usable video with the blocking error overlay.
      if (!isExpectedPlayInterruption(error)) {
        this.emitError(normalized, false);
      }
      throw normalized;
    }
  }

  pause(): void {
    this.requireMedia().pause();
  }

  seek(time: number): void {
    const media = this.requireMedia();
    if (!Number.isFinite(time)) {
      throw new VideoEngineError({
        category: "SOURCE",
        code: "INVALID_SEEK_TIME",
        message: "Seek time must be a finite number.",
      });
    }

    const duration = finiteOrZero(media.duration);
    media.currentTime = Math.max(0, duration > 0 ? Math.min(time, duration) : time);
    this.updateSnapshot({ currentTime: finiteOrZero(media.currentTime) });
    this.#events.emit("timeupdate", {
      currentTime: this.#snapshot.currentTime,
      duration: this.#snapshot.duration,
    });
  }

  setVolume(volume: number): void {
    const media = this.requireMedia();
    if (!Number.isFinite(volume)) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "INVALID_VOLUME",
        message: "Volume must be a finite number.",
      });
    }
    media.volume = Math.max(0, Math.min(1, volume));
    this.syncVolume();
  }

  setMuted(muted: boolean): void {
    const media = this.requireMedia();
    media.muted = muted;
    this.syncVolume();
  }

  setPlaybackRate(rate: number): void {
    const media = this.requireMedia();
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "INVALID_PLAYBACK_RATE",
        message: "Playback rate must be a positive finite number.",
      });
    }
    media.playbackRate = rate;
    this.syncPlaybackRate();
  }

  getCapabilities(): VideoEngineCapabilities {
    const media = this.#media;
    const nativeHls =
      media?.canPlayType("application/vnd.apple.mpegurl") !== "" ||
      media?.canPlayType("application/x-mpegurl") !== "";

    return {
      browserSupported: typeof HTMLMediaElement !== "undefined",
      adaptiveStreaming: Boolean(nativeHls),
      drm: typeof navigator !== "undefined" && "requestMediaKeySystemAccess" in navigator,
      nativeHls: Boolean(nativeHls),
      pictureInPicture:
        typeof document !== "undefined" &&
        "pictureInPictureEnabled" in document &&
        Boolean(document.pictureInPictureEnabled),
    };
  }

  getSnapshot(): VideoEngineSnapshot {
    return cloneVideoEngineSnapshot(this.#snapshot);
  }

  getQualities(): readonly VideoQuality[] {
    return this.#snapshot.qualities.map((quality) => ({ ...quality }));
  }

  selectQuality(id: string): void {
    if (id === "auto") {
      this.enableAutoQuality();
      return;
    }

    throw new VideoEngineError({
      category: "UNSUPPORTED",
      code: "QUALITY_SELECTION_UNSUPPORTED",
      message: `${this.name} does not support manual quality selection.`,
    });
  }

  enableAutoQuality(): void {
    this.updateSnapshot({ autoQuality: true, selectedQualityId: null });
    this.#events.emit("qualitychange", { quality: null, auto: true });
  }

  getAudioTracks(): readonly VideoAudioTrack[] {
    return this.#snapshot.audioTracks.map((track) => ({
      ...track,
      roles: [...track.roles],
    }));
  }

  selectAudioTrack(_id: string): void {
    throw new VideoEngineError({
      category: "UNSUPPORTED",
      code: "AUDIO_TRACK_SELECTION_UNSUPPORTED",
      message: `${this.name} does not support audio track selection.`,
    });
  }

  getTextTracks(): readonly VideoTextTrack[] {
    return this.#snapshot.textTracks.map((track) => ({
      ...track,
      roles: [...track.roles],
    }));
  }

  selectTextTrack(id: string | null): void {
    const media = this.requireMedia();
    const tracks = Array.from(media.textTracks ?? []);
    let selected: VideoTextTrack | null = null;

    for (const [index, track] of tracks.entries()) {
      const normalized = this.normalizeNativeTextTrack(track, index);
      const active = id !== null && normalized.id === id;
      track.mode = active ? "showing" : "disabled";
      if (active) {
        selected = { ...normalized, active: true };
      }
    }

    if (id !== null && !selected) {
      throw new VideoEngineError({
        category: "TEXT",
        code: "TEXT_TRACK_NOT_FOUND",
        message: `Text track '${id}' is not available.`,
      });
    }

    this.refreshNativeTextTracks();
    this.#events.emit("texttrackchange", { track: selected });
  }

  on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void {
    return this.#events.on(type, listener);
  }

  protected get mediaElement(): HTMLMediaElement | null {
    return this.#media;
  }

  protected requireMedia(): HTMLMediaElement {
    this.assertNotDestroyed();
    if (!this.#media) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "MEDIA_NOT_ATTACHED",
        message: "Attach a media element before using the video engine.",
      });
    }
    return this.#media;
  }

  protected assertNotDestroyed(): void {
    if (this.#snapshot.lifecycle === "destroyed") {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "ENGINE_DESTROYED",
        message: "This video engine has already been destroyed.",
      });
    }
  }

  protected beginOperation(): number {
    this.assertNotDestroyed();
    this.#operationGeneration += 1;
    return this.#operationGeneration;
  }

  protected invalidateOperations(): void {
    this.#operationGeneration += 1;
  }

  protected isCurrentOperation(generation: number): boolean {
    return (
      generation === this.#operationGeneration &&
      this.#snapshot.lifecycle !== "destroyed"
    );
  }

  protected updateSnapshot(
    update: Partial<VideoEngineSnapshot>,
    emit = true,
  ): void {
    this.#snapshot = { ...this.#snapshot, ...update };
    if (emit) {
      this.emitSnapshot();
    }
  }

  protected emit<Type extends keyof VideoEngineEventMap>(
    type: Type,
    event: VideoEngineEventMap[Type],
  ): void {
    this.#events.emit(type, event);
  }

  protected emitError(error: VideoEngineError, setErrorState = true): void {
    this.updateSnapshot({
      error,
      lifecycle: setErrorState ? "error" : this.#snapshot.lifecycle,
    });
    this.#events.emit("error", { error });
  }

  protected startLoading(source: VideoSource): void {
    this.updateSnapshot({
      lifecycle: "loading",
      source,
      error: null,
      ended: false,
      buffering: false,
      currentTime: 0,
      duration: 0,
      buffered: [],
      seekable: [],
      qualities: [],
      audioTracks: [],
      textTracks: [],
      selectedQualityId: null,
      selectedAudioTrackId: null,
      selectedTextTrackId: null,
    });
    this.#events.emit("loadstart", { source });
  }

  protected finishLoading(source: VideoSource): void {
    this.syncMediaState();
    this.updateSnapshot({ lifecycle: "ready", source, error: null });
    this.#events.emit("loaded", {
      source,
      duration: this.#snapshot.duration,
    });
  }

  protected finishUnloading(): void {
    const media = this.#media;
    this.#snapshot = {
      ...createInitialVideoEngineSnapshot(),
      lifecycle: media ? "attached" : "idle",
      paused: media?.paused ?? true,
      volume: media?.volume ?? 1,
      muted: media?.muted ?? false,
      playbackRate: media?.playbackRate ?? 1,
    };
    this.emitSnapshot();
    this.#events.emit("unloaded", undefined);
  }

  protected setBuffering(buffering: boolean): void {
    if (this.#snapshot.buffering === buffering) {
      return;
    }
    this.updateSnapshot({ buffering });
    this.#events.emit("bufferingchange", { buffering });
  }

  protected setTrackState(options: {
    qualities?: readonly VideoQuality[];
    audioTracks?: readonly VideoAudioTrack[];
    textTracks?: readonly VideoTextTrack[];
    selectedQualityId?: string | null;
    selectedAudioTrackId?: string | null;
    selectedTextTrackId?: string | null;
    autoQuality?: boolean;
  }): void {
    this.updateSnapshot(options);
  }

  protected refreshNativeTextTracks(): void {
    const media = this.#media;
    if (!media) {
      this.setTrackState({ textTracks: [], selectedTextTrackId: null });
      return;
    }

    const textTracks = Array.from(media.textTracks ?? []).map((track, index) =>
      this.normalizeNativeTextTrack(track, index),
    );
    const active = textTracks.find((track) => track.active) ?? null;
    this.setTrackState({
      textTracks,
      selectedTextTrackId: active?.id ?? null,
    });
    this.#events.emit("trackschanged", {
      qualities: this.#snapshot.qualities,
      audioTracks: this.#snapshot.audioTracks,
      textTracks,
    });
  }

  protected async onAttached(_media: HTMLMediaElement): Promise<void> {}

  protected async onDetaching(_media: HTMLMediaElement): Promise<void> {}

  protected async onDestroying(_media: HTMLMediaElement | null): Promise<void> {}

  private emitSnapshot(): void {
    this.#events.emit("snapshotchange", this.getSnapshot());
  }

  private normalizeNativeTextTrack(
    track: TextTrack,
    index: number,
  ): VideoTextTrack {
    return {
      id: `native-text:${index}:${track.language}:${track.label}`,
      label: track.label || track.language || `Text track ${index + 1}`,
      language: track.language || "und",
      kind: track.kind,
      active: track.mode === "showing",
      roles: [],
    };
  }

  private bindMediaEvents(media: HTMLMediaElement): void {
    const listen = (type: string, listener: EventListener): void => {
      this.#mediaListeners.set(type, listener);
      media.addEventListener(type, listener);
    };

    listen("play", () => {
      this.updateSnapshot({ paused: false, ended: false, error: null });
      this.#events.emit("play", undefined);
    });
    listen("pause", () => {
      this.updateSnapshot({ paused: true, playing: false });
      this.#events.emit("pause", undefined);
    });
    listen("playing", () => {
      this.setBuffering(false);
      this.updateSnapshot({
        paused: false,
        playing: true,
        ended: false,
        error: null,
      });
      this.#events.emit("playing", undefined);
    });
    listen("ended", () => {
      this.updateSnapshot({ paused: true, playing: false, ended: true });
      this.#events.emit("ended", undefined);
    });
    listen("timeupdate", () => {
      this.syncTime();
      this.#events.emit("timeupdate", {
        currentTime: this.#snapshot.currentTime,
        duration: this.#snapshot.duration,
      });
    });
    listen("durationchange", () => {
      this.syncTime();
      this.#events.emit("durationchange", {
        duration: this.#snapshot.duration,
      });
    });
    listen("seeking", () => {
      this.syncTime();
      this.updateSnapshot({ seeking: true });
      this.#events.emit("seeking", {
        currentTime: this.#snapshot.currentTime,
      });
    });
    listen("seeked", () => {
      this.syncTime();
      this.updateSnapshot({ seeking: false });
      this.#events.emit("seeked", {
        currentTime: this.#snapshot.currentTime,
      });
    });
    listen("waiting", () => this.setBuffering(true));
    listen("stalled", () => this.setBuffering(true));
    listen("canplay", () => this.setBuffering(false));
    listen("canplaythrough", () => this.setBuffering(false));
    listen("progress", () => this.syncRanges());
    listen("volumechange", () => this.syncVolume());
    listen("ratechange", () => this.syncPlaybackRate());
    listen("loadedmetadata", () => {
      this.syncMediaState();
      this.refreshNativeTextTracks();
    });
    listen("error", () => this.emitError(mediaErrorToVideoEngineError(media.error)));
  }

  private unbindMediaEvents(media: HTMLMediaElement): void {
    for (const [type, listener] of this.#mediaListeners) {
      media.removeEventListener(type, listener);
    }
    this.#mediaListeners.clear();
  }

  private syncMediaState(): void {
    const media = this.#media;
    if (!media) {
      return;
    }

    this.#snapshot = {
      ...this.#snapshot,
      paused: media.paused,
      playing: !media.paused && !media.ended,
      ended: media.ended,
      currentTime: finiteOrZero(media.currentTime),
      duration: finiteOrZero(media.duration),
      volume: media.volume,
      muted: media.muted,
      playbackRate: media.playbackRate,
      buffered: readTimeRanges(media.buffered),
      seekable: readTimeRanges(media.seekable),
    };
    this.emitSnapshot();
  }

  private syncTime(): void {
    const media = this.#media;
    if (!media) {
      return;
    }
    this.updateSnapshot({
      currentTime: finiteOrZero(media.currentTime),
      duration: finiteOrZero(media.duration),
    });
  }

  private syncRanges(): void {
    const media = this.#media;
    if (!media) {
      return;
    }
    this.updateSnapshot({
      buffered: readTimeRanges(media.buffered),
      seekable: readTimeRanges(media.seekable),
    });
  }

  private syncVolume(): void {
    const media = this.#media;
    if (!media) {
      return;
    }
    this.updateSnapshot({ volume: media.volume, muted: media.muted });
    this.#events.emit("volumechange", {
      volume: media.volume,
      muted: media.muted,
    });
  }

  private syncPlaybackRate(): void {
    const media = this.#media;
    if (!media) {
      return;
    }
    this.updateSnapshot({ playbackRate: media.playbackRate });
    this.#events.emit("ratechange", { playbackRate: media.playbackRate });
  }
}
