import { getActiveChapter } from "../chapters/getChapterAtTime";
import type { Chapter } from "../chapters/chapterTypes";
import { VideoEngineError } from "../core/errors";
import type { VideoEngineEvent, VideoEngineEventMap } from "../core/events";
import type { VideoEngineSnapshot } from "../core/snapshot";
import type { VideoEngine } from "../core/VideoEngine";
import type {
  VideoEngineCapabilities,
  VideoLoadOptions,
  VideoSource,
} from "../core/types";
import type { StoryboardFrame } from "../storyboard/storyboardTypes";
import type { TimelineMarker } from "../timeline/timelineMath";
import {
  forwardedVideoEngineEvents,
  type VideoPlayerEvent,
  type VideoPlayerEventListener,
} from "./playerEvents";
import {
  createInitialPlayerUiState,
  type PlayerSettingsView,
  type PlayerSnapshot,
} from "./playerState";

type SnapshotListener = () => void;

interface MediaWaiter {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface PendingMediaProperties {
  muted?: boolean;
  playbackRate?: number;
  seekTime?: number;
  volume?: number;
}

interface WebkitFullscreenDocument extends Document {
  webkitExitFullscreen?: () => Promise<void> | void;
  webkitFullscreenElement?: Element | null;
}

interface WebkitFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void;
}

interface PictureInPictureDocument {
  pictureInPictureEnabled?: boolean;
  pictureInPictureElement?: Element | null;
  exitPictureInPicture?: () => Promise<void>;
}

interface PictureInPictureVideo {
  disablePictureInPicture?: boolean;
  requestPictureInPicture?: () => Promise<unknown>;
}

const getFullscreenElement = () => {
  if (typeof document === "undefined") return null;
  const webkitDocument = document as WebkitFullscreenDocument;
  return document.fullscreenElement ?? webkitDocument.webkitFullscreenElement ?? null;
};

export interface PlayerLoadRequest {
  source: VideoSource;
  options?: VideoLoadOptions;
  autoPlay?: boolean;
}

export class PlayerController {
  readonly engine: VideoEngine;

  readonly #listeners = new Set<SnapshotListener>();
  readonly #eventListeners = new Set<VideoPlayerEventListener>();
  readonly #engineUnsubscribers: Array<() => void> = [];
  readonly #mediaWaiters: MediaWaiter[] = [];
  #snapshot: PlayerSnapshot;
  #focusTarget: HTMLElement | null = null;
  #presentationContainer: HTMLElement | null = null;
  #presentationContainerResolver: (() => HTMLElement | null) | null = null;
  #media: HTMLVideoElement | null = null;
  #requestedMedia: HTMLVideoElement | null = null;
  #mediaAttached = false;
  #mediaRequestGeneration = 0;
  #settledMediaGeneration = 0;
  #mediaTransition: Promise<void> = Promise.resolve();
  #pendingMediaProperties: PendingMediaProperties = {};
  #activated = false;
  #destroyed = false;
  #loadGeneration = 0;
  #playRequestGeneration = 0;
  #hudId = 0;

  constructor(engine: VideoEngine) {
    this.engine = engine;
    this.#snapshot = {
      media: engine.getSnapshot(),
      capabilities: {
        ...engine.getCapabilities(),
        pictureInPicture: false,
      },
      ui: createInitialPlayerUiState(),
      chapters: [],
      activeChapterId: null,
      storyboard: [],
      markers: [],
    };
  }

  /**
   * Starts subscriptions owned by a committed PlayerRoot. Keeping construction
   * side-effect free lets React discard its development-only StrictMode render
   * without leaving document or engine listeners behind.
   */
  activate(): void {
    this.assertActive();
    if (this.#activated) return;
    this.#activated = true;

    this.#engineUnsubscribers.push(
      this.engine.on("snapshotchange", (media) => {
        const activeChapter = getActiveChapter(
          this.#snapshot.chapters,
          media.currentTime,
        );
        this.#snapshot = {
          ...this.#snapshot,
          media,
          activeChapterId: activeChapter?.id ?? null,
        };
        this.notify();
      }),
    );

    for (const type of forwardedVideoEngineEvents) {
      this.forwardEngineEvent(type);
    }

    if (typeof document !== "undefined") {
      document.addEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
      document.addEventListener(
        "webkitfullscreenchange",
        this.handleFullscreenChange,
      );
    }

    const media = this.engine.getSnapshot();
    const activeChapter = getActiveChapter(
      this.#snapshot.chapters,
      media.currentTime,
    );
    this.#snapshot = {
      ...this.#snapshot,
      media,
      capabilities: this.readCapabilities(),
      activeChapterId: activeChapter?.id ?? null,
    };
    this.notify();
  }

  /** Pauses committed-root subscriptions without destroying the engine. */
  deactivate(): void {
    if (!this.#activated) return;
    this.#activated = false;
    for (const unsubscribe of this.#engineUnsubscribers.splice(0)) unsubscribe();
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        this.handleFullscreenChange,
      );
    }
  }

  readonly subscribe = (listener: SnapshotListener): (() => void) => {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  };

  readonly getSnapshot = (): PlayerSnapshot => this.#snapshot;

  onEvent(listener: VideoPlayerEventListener): () => void {
    this.#eventListeners.add(listener);
    return () => this.#eventListeners.delete(listener);
  }

  setContainer(container: HTMLElement | null): void {
    this.#focusTarget = container;
    this.#presentationContainer = container;
    this.#presentationContainerResolver = null;
  }

  setFocusTarget(target: HTMLElement | null): void {
    this.#focusTarget = target;
  }

  setPresentationContainer(container: HTMLElement | null): void {
    this.#presentationContainer = container;
    this.#presentationContainerResolver = null;
  }

  setPresentationContainerResolver(
    resolver: (() => HTMLElement | null) | null,
  ): void {
    this.#presentationContainerResolver = resolver;
  }

  attachMedia(media: HTMLVideoElement): Promise<void> {
    this.assertActive();
    if (this.#requestedMedia === media) {
      if (this.isMediaReady(media)) return Promise.resolve();
      return this.waitForMedia();
    }

    this.#requestedMedia = media;
    const generation = ++this.#mediaRequestGeneration;
    this.syncCapabilities();
    return this.enqueueMediaTransition(() =>
      this.applyMediaRequest(media, generation),
    );
  }

  detachMedia(media?: HTMLVideoElement): Promise<void> {
    if (this.#destroyed) return Promise.resolve();
    if (media && this.#requestedMedia && media !== this.#requestedMedia) {
      return Promise.resolve();
    }
    if (this.#requestedMedia === null) return this.#mediaTransition;

    this.#requestedMedia = null;
    const generation = ++this.#mediaRequestGeneration;
    this.syncCapabilities();
    return this.enqueueMediaTransition(() =>
      this.applyMediaRequest(null, generation),
    );
  }

  async load({
    source,
    options,
    autoPlay = false,
  }: PlayerLoadRequest): Promise<void> {
    this.assertActive();
    const generation = ++this.#loadGeneration;
    await this.waitForMedia();
    if (generation !== this.#loadGeneration || this.#destroyed) return;
    await this.engine.load(source, options);
    if (generation !== this.#loadGeneration || this.#destroyed || !autoPlay) return;
    await this.engine.play();
  }

  async play(): Promise<void> {
    this.assertActive();
    const generation = ++this.#playRequestGeneration;
    if (!this.isMediaReady()) {
      await this.waitForMedia();
    }
    this.assertActive();
    if (generation !== this.#playRequestGeneration) return;
    await this.engine.play();
  }

  pause(): void {
    this.#playRequestGeneration += 1;
    if (!this.isMediaReady()) return;
    this.engine.pause();
  }

  async togglePlayback(): Promise<void> {
    if (this.#snapshot.media.paused || this.#snapshot.media.ended) {
      await this.play();
      return;
    }
    this.pause();
  }

  async reload(): Promise<void> {
    const { currentTime, source } = this.#snapshot.media;
    if (!source) return;
    await this.engine.load(source, { startTime: currentTime });
  }

  seekTo(time: number): void {
    if (!Number.isFinite(time)) {
      throw new VideoEngineError({
        category: "SOURCE",
        code: "INVALID_SEEK_TIME",
        message: "Seek time must be a finite number.",
      });
    }
    if (!this.isMediaReady()) {
      this.#pendingMediaProperties.seekTime = time;
      return;
    }
    this.engine.seek(time);
  }

  seekBy(delta: number): void {
    const currentTime =
      this.#pendingMediaProperties.seekTime ?? this.#snapshot.media.currentTime;
    this.seekTo(currentTime + delta);
  }

  setVolume(volume: number): void {
    if (!Number.isFinite(volume)) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "INVALID_VOLUME",
        message: "Volume must be a finite number.",
      });
    }
    if (!this.isMediaReady()) {
      this.#pendingMediaProperties.volume = volume;
      const muted =
        this.#pendingMediaProperties.muted ?? this.#snapshot.media.muted;
      if (volume > 0 && muted) this.#pendingMediaProperties.muted = false;
      return;
    }
    this.engine.setVolume(volume);
    if (volume > 0 && this.#snapshot.media.muted) this.engine.setMuted(false);
  }

  setMuted(muted: boolean): void {
    if (!this.isMediaReady()) {
      this.#pendingMediaProperties.muted = muted;
      return;
    }
    this.engine.setMuted(muted);
  }

  toggleMuted(): void {
    const muted =
      this.#pendingMediaProperties.muted ?? this.#snapshot.media.muted;
    this.setMuted(!muted);
  }

  setPlaybackRate(rate: number): void {
    if (!Number.isFinite(rate) || rate <= 0) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "INVALID_PLAYBACK_RATE",
        message: "Playback rate must be a positive finite number.",
      });
    }
    if (!this.isMediaReady()) {
      this.#pendingMediaProperties.playbackRate = rate;
      return;
    }
    this.engine.setPlaybackRate(rate);
  }

  selectQuality(id: string | null): void {
    if (id === null || id === "auto") this.engine.enableAutoQuality();
    else this.engine.selectQuality(id);
  }

  selectAudioTrack(id: string): void {
    this.engine.selectAudioTrack(id);
  }

  selectTextTrack(id: string | null): void {
    this.engine.selectTextTrack(id);
  }

  setChapters(chapters: readonly Chapter[]): void {
    const activeChapter = getActiveChapter(
      chapters,
      this.#snapshot.media.currentTime,
    );
    this.#snapshot = {
      ...this.#snapshot,
      chapters: [...chapters],
      activeChapterId: activeChapter?.id ?? null,
    };
    this.notify();
  }

  setStoryboard(frames: readonly StoryboardFrame[]): void {
    this.#snapshot = { ...this.#snapshot, storyboard: [...frames] };
    this.notify();
  }

  setMarkers(markers: readonly TimelineMarker[]): void {
    this.#snapshot = { ...this.#snapshot, markers: [...markers] };
    this.notify();
  }

  setControlsVisible(controlsVisible: boolean): void {
    if (this.#snapshot.ui.controlsVisible === controlsVisible) return;
    this.updateUi({ controlsVisible });
    this.emit({
      type: "controlsvisibilitychange",
      detail: { visible: controlsVisible },
    });
  }

  setControlsLocked(controlsLocked: boolean): void {
    this.updateUi({ controlsLocked });
  }

  setSettingsView(settingsView: PlayerSettingsView): void {
    this.updateUi({ settingsView, controlsVisible: true });
  }

  setScrubbing(scrubbing: boolean): void {
    this.updateUi({ scrubbing, controlsVisible: true });
  }

  setPreviewTime(previewTime: number | null): void {
    this.updateUi({ previewTime });
  }

  setTheaterMode(active: boolean): void {
    if (this.#snapshot.ui.theater === active) return;
    this.updateUi({ theater: active });
    this.emit({ type: "theaterchange", detail: { active } });
  }

  showHud(text: string): void {
    this.#hudId += 1;
    this.updateUi({ hud: { id: this.#hudId, text } });
  }

  clearHud(id?: number): void {
    if (id !== undefined && this.#snapshot.ui.hud?.id !== id) return;
    this.updateUi({ hud: null });
  }

  async enterFullscreen(): Promise<void> {
    const container = this.getPresentationContainer() as WebkitFullscreenElement | null;
    if (!container) return;
    if (container.requestFullscreen) await container.requestFullscreen();
    else await container.webkitRequestFullscreen?.();
    this.syncFullscreen();
  }

  async exitFullscreen(): Promise<void> {
    if (typeof document === "undefined") return;
    const webkitDocument = document as WebkitFullscreenDocument;
    if (document.exitFullscreen) await document.exitFullscreen();
    else await webkitDocument.webkitExitFullscreen?.();
    this.syncFullscreen();
  }

  async toggleFullscreen(): Promise<void> {
    if (getFullscreenElement()) await this.exitFullscreen();
    else await this.enterFullscreen();
  }

  canUsePictureInPicture(): boolean {
    return this.readCapabilities().pictureInPicture;
  }

  async enterPictureInPicture(): Promise<void> {
    if (!this.canUsePictureInPicture()) return;
    await (
      this.#media as unknown as PictureInPictureVideo
    ).requestPictureInPicture?.();
    this.syncPictureInPicture();
  }

  async exitPictureInPicture(): Promise<void> {
    if (typeof document === "undefined") return;
    const pipDocument = document as unknown as PictureInPictureDocument;
    if (!pipDocument.pictureInPictureElement) return;
    await pipDocument.exitPictureInPicture?.();
    this.syncPictureInPicture();
  }

  async togglePictureInPicture(): Promise<void> {
    const pipDocument =
      typeof document === "undefined"
        ? null
        : (document as unknown as PictureInPictureDocument);
    if (pipDocument?.pictureInPictureElement) {
      await this.exitPictureInPicture();
    } else {
      await this.enterPictureInPicture();
    }
  }

  focus(): void {
    this.#focusTarget?.focus();
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#loadGeneration += 1;
    this.#playRequestGeneration += 1;
    this.#requestedMedia = null;
    this.#mediaRequestGeneration += 1;
    this.#settledMediaGeneration = 0;
    this.#pendingMediaProperties = {};
    const error = new VideoEngineError({
      category: "ABORTED",
      code: "PLAYER_DESTROYED",
      message: "The player was destroyed before the operation completed.",
      fatal: false,
      recoverable: false,
    });
    for (const waiter of this.#mediaWaiters.splice(0)) waiter.reject(error);
    this.deactivate();
    this.#listeners.clear();
    this.#eventListeners.clear();
    await this.#mediaTransition;
    this.#media?.removeEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    this.#media?.removeEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    this.#media = null;
    this.#mediaAttached = false;
    await this.engine.destroy();
  }

  private readonly handleFullscreenChange = (): void => this.syncFullscreen();

  private readonly handlePictureInPictureChange = (): void =>
    this.syncPictureInPicture();

  private forwardEngineEvent<Type extends keyof VideoEngineEventMap>(
    type: Type,
  ): void {
    this.#engineUnsubscribers.push(
      this.engine.on(type, (detail) => {
        this.emit({ type, detail } as VideoEngineEvent);
      }),
    );
  }

  private emit(event: VideoPlayerEvent): void {
    for (const listener of this.#eventListeners) listener(event);
  }

  private updateUi(update: Partial<PlayerSnapshot["ui"]>): void {
    this.#snapshot = {
      ...this.#snapshot,
      ui: { ...this.#snapshot.ui, ...update },
    };
    this.notify();
  }

  private syncFullscreen(): void {
    const presentationContainer = this.getPresentationContainer();
    const active = Boolean(
      presentationContainer && getFullscreenElement() === presentationContainer,
    );
    if (active === this.#snapshot.ui.fullscreen) return;
    this.updateUi({ fullscreen: active });
    this.emit({ type: "fullscreenchange", detail: { active } });
  }

  private syncPictureInPicture(): void {
    const pipDocument =
      typeof document === "undefined"
        ? null
        : (document as unknown as PictureInPictureDocument);
    const active = Boolean(
      this.#media && pipDocument?.pictureInPictureElement === this.#media,
    );
    if (active === this.#snapshot.ui.pictureInPicture) return;
    this.updateUi({ pictureInPicture: active });
    this.emit({ type: "pictureinpicturechange", detail: { active } });
  }

  private readCapabilities(): VideoEngineCapabilities {
    const engineCapabilities = this.engine.getCapabilities();
    const media = this.isMediaReady()
      ? (this.#media as unknown as PictureInPictureVideo)
      : null;
    const pipDocument =
      typeof document === "undefined"
        ? null
        : (document as unknown as PictureInPictureDocument);
    return {
      ...engineCapabilities,
      pictureInPicture: Boolean(
        engineCapabilities.pictureInPicture &&
          pipDocument?.pictureInPictureEnabled &&
          media?.requestPictureInPicture &&
          !media.disablePictureInPicture,
      ),
    };
  }

  private syncCapabilities(): void {
    const capabilities = this.readCapabilities();
    const current = this.#snapshot.capabilities;
    if (
      current.browserSupported === capabilities.browserSupported &&
      current.adaptiveStreaming === capabilities.adaptiveStreaming &&
      current.drm === capabilities.drm &&
      current.nativeHls === capabilities.nativeHls &&
      current.pictureInPicture === capabilities.pictureInPicture
    ) {
      return;
    }
    this.#snapshot = { ...this.#snapshot, capabilities };
    this.notify();
  }

  private getPresentationContainer(): HTMLElement | null {
    return this.#presentationContainerResolver?.() ?? this.#presentationContainer;
  }

  private enqueueMediaTransition(operation: () => Promise<void>): Promise<void> {
    const transition = this.#mediaTransition.then(operation);
    this.#mediaTransition = transition.catch(() => undefined);
    return transition;
  }

  private async applyMediaRequest(
    media: HTMLVideoElement | null,
    generation: number,
  ): Promise<void> {
    if (this.#destroyed || generation !== this.#mediaRequestGeneration) return;

    if (!media) {
      await this.detachAttachedMedia();
      if (generation === this.#mediaRequestGeneration) {
        this.#settledMediaGeneration = generation;
        this.syncCapabilities();
      }
      return;
    }

    if (this.#media === media && this.#mediaAttached) {
      this.settleAttachedMedia(media, generation);
      return;
    }

    if (this.#media) {
      await this.detachAttachedMedia();
      if (this.#destroyed || generation !== this.#mediaRequestGeneration) return;
    }

    try {
      await this.engine.attach(media);
    } catch (error) {
      if (generation === this.#mediaRequestGeneration) {
        this.#requestedMedia = null;
        this.#settledMediaGeneration = 0;
        this.syncCapabilities();
        this.rejectMediaWaiters(error);
      }
      throw error;
    }

    this.#media = media;
    this.#mediaAttached = true;
    if (this.#destroyed || generation !== this.#mediaRequestGeneration) return;
    this.settleAttachedMedia(media, generation);
  }

  private settleAttachedMedia(
    media: HTMLVideoElement,
    generation: number,
  ): void {
    if (
      this.#destroyed ||
      generation !== this.#mediaRequestGeneration ||
      this.#requestedMedia !== media ||
      this.#media !== media ||
      !this.#mediaAttached
    ) {
      return;
    }
    media.removeEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.removeEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.addEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.addEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    this.#settledMediaGeneration = generation;
    this.flushPendingMediaProperties();
    this.syncCapabilities();
    this.resolveMediaWaiters();
    this.syncPictureInPicture();
  }

  private async detachAttachedMedia(): Promise<void> {
    const media = this.#media;
    if (!media || !this.#mediaAttached) return;
    media.removeEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.removeEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    this.#media = null;
    this.#mediaAttached = false;
    this.#settledMediaGeneration = 0;
    this.syncCapabilities();
    await this.engine.detach();
    this.syncCapabilities();
  }

  private isMediaReady(media = this.#requestedMedia): boolean {
    return Boolean(
      media &&
        this.#media === media &&
        this.#mediaAttached &&
        this.#settledMediaGeneration === this.#mediaRequestGeneration,
    );
  }

  private flushPendingMediaProperties(): void {
    const pending = this.#pendingMediaProperties;
    this.#pendingMediaProperties = {};
    if (pending.volume !== undefined) this.engine.setVolume(pending.volume);
    if (pending.muted !== undefined) this.engine.setMuted(pending.muted);
    if (pending.playbackRate !== undefined) {
      this.engine.setPlaybackRate(pending.playbackRate);
    }
    if (pending.seekTime !== undefined) this.engine.seek(pending.seekTime);
  }

  private waitForMedia(): Promise<void> {
    if (this.isMediaReady()) return Promise.resolve();
    return new Promise((resolve, reject) => {
      this.#mediaWaiters.push({ resolve, reject });
    });
  }

  private resolveMediaWaiters(): void {
    for (const waiter of this.#mediaWaiters.splice(0)) waiter.resolve();
  }

  private rejectMediaWaiters(reason: unknown): void {
    for (const waiter of this.#mediaWaiters.splice(0)) waiter.reject(reason);
  }

  private notify(): void {
    for (const listener of this.#listeners) listener();
  }

  private assertActive(): void {
    if (!this.#destroyed) return;
    throw new VideoEngineError({
      category: "PLAYER",
      code: "PLAYER_DESTROYED",
      message: "This player has already been destroyed.",
    });
  }
}
