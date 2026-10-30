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
  canUseElementFullscreen,
  enterPageFullscreen,
  exitPageFullscreen,
  getPageFullscreenElement,
  PAGE_FULLSCREEN_CHANGE_EVENT,
} from "./pageFullscreen";
import {
  forwardedVideoEngineEvents,
  type VideoPlayerEvent,
  type VideoPlayerEventListener,
} from "./playerEvents";
import {
  createInitialPlayerUiState,
  createInitialPlayerZoomState,
  type PlayerHudOptions,
  type PlayerSettingsView,
  type PlayerSnapshot,
  type PlayerZoomState,
} from "./playerState";

type SnapshotListener = () => void;

/**
 * How far before the end of a buffered range a drag may still seek without
 * the player having to fetch: the last fraction of a range is often a
 * partial segment that cannot be decoded on its own yet.
 */
const SCRUB_BUFFERED_END_MARGIN_SECONDS = 0.1;
/** A scrub seek that never reports `seeked` stops blocking the next one. */
const SCRUB_SEEK_TIMEOUT_MS = 500;
/**
 * After a drag ends on a part not downloaded, the storyboard picture stays
 * until the video has the real frame, or this long at most.
 */
const SCRUB_FRAME_HOLD_TIMEOUT_MS = 8_000;
/**
 * A drag held still this long shows the lesson's own frame there, in its
 * playing quality, instead of the preview picture: over a part not
 * downloaded yet (a fetch, so not for a mere pause in the drag) ...
 */
const SCRUB_REST_MS = 300;
/** ... and over a part already downloaded (only a seek). */
const SCRUB_REST_BUFFERED_MS = 100;
/**
 * While a drag rests, the lesson fetches only this far ahead: the segment
 * under the pointer (segments run 2-6s), which is also enough to start
 * playing at once on release (playback starts at 1.5s buffered).
 */
const SCRUB_REST_BUFFER_AHEAD_SECONDS = 2;
/**
 * A drag counts as resting while it stays within this share of the video
 * of where it stopped: a finger held on the screen still trembles.
 */
const SCRUB_REST_TOLERANCE_SHARE = 0.006;
/**
 * The lesson's own frame, shown during a drag, gives way to the preview
 * again once it is this many tolerances behind the pointer (fewer brings
 * it back): a drag slowing down and speeding up does not flick between
 * the two.
 */
const SCRUB_LESSON_FALL_BEHIND_TOLERANCES = 2;
/**
 * The lesson's frame stands in for the pointer's moment only this close to
 * it, however long the video: the rest tolerance alone let a 4 h lesson
 * show a frame some 3 minutes from the pointer through a slow drag, where
 * the preview picture is the exact one.
 */
const SCRUB_LESSON_MAX_LAG_SECONDS = 1;

function isTimeBuffered(ranges: TimeRanges, time: number): boolean {
  for (let index = 0; index < ranges.length; index += 1) {
    if (
      time >= ranges.start(index) &&
      time <= ranges.end(index) - SCRUB_BUFFERED_END_MARGIN_SECONDS
    ) {
      return true;
    }
  }
  return false;
}

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

/**
 * The video element's own full screen (Safari on iPhone, which has no
 * element full screen): the system player, entered and left here, reported
 * by `webkitbeginfullscreen` / `webkitendfullscreen` on the element itself,
 * never by the document.
 */
interface WebkitFullscreenVideo extends HTMLVideoElement {
  webkitEnterFullscreen?: () => void;
  webkitExitFullscreen?: () => void;
  webkitDisplayingFullscreen?: boolean;
  webkitSupportsFullscreen?: boolean;
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
  return (
    document.fullscreenElement ??
    webkitDocument.webkitFullscreenElement ??
    getPageFullscreenElement()
  );
};

export interface PlayerLoadRequest {
  source: VideoSource;
  options?: VideoLoadOptions;
  autoPlay?: boolean;
}

/** Told which element plays now, and which one is the standby. */
export type ActiveMediaListener = (
  media: HTMLVideoElement,
  standby: HTMLVideoElement | null,
) => void;

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
  // The shell this player put in a page full screen (see pageFullscreen.ts).
  #pageFullscreenShell: HTMLElement | null = null;
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
  /** Settles once the last `stop` is done; a load waits for it. */
  #stopping: Promise<void> = Promise.resolve();
  #hudId = 0;
  #standbyMedia: HTMLVideoElement | null = null;
  // The newest drag position still waiting for the seek in flight to finish.
  #scrubTarget: number | null = null;
  #scrubSeekInFlight = false;
  // Ends the wait for the real frame after a drag released on a part not
  // downloaded (see `scrubFrameTime`).
  #scrubFrameRelease: (() => void) | null = null;
  // A drag pauses a playing video and plays it again from where it is let
  // go (see `setScrubbing`).
  #resumeAfterScrub = false;
  // Set while the storyboard is a preview video: see `scrubTo`.
  #scrubWithStoryboard = false;
  #scrubPausing = false;
  // A drag resting on a moment (see `scrubTo`): where it stopped, the
  // newest position since, the wait before the lesson seeks there, and
  // whether the lesson's own frame is showing instead of the preview.
  #scrubRestAnchor: number | null = null;
  #scrubRestTime: number | null = null;
  #scrubRestTimer: number | null = null;
  #scrubRestSeekCleanup: (() => void) | null = null;
  #scrubShowsLesson = false;
  #scrubBufferLimited = false;
  // The moment of the lesson's frame on screen during a drag: where its
  // last finished seek landed.
  #scrubLessonTime: number | null = null;
  readonly #activeMediaListeners = new Set<ActiveMediaListener>();

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
      this.engine.on("snapshotchange", (engineMedia) => {
        const activeChapter = getActiveChapter(
          this.#snapshot.chapters,
          engineMedia.currentTime,
        );
        // A speed chosen before the media could take it is shown as chosen
        // until it is applied (see setPlaybackRate).
        const pendingRate = this.#pendingMediaProperties.playbackRate;
        const media =
          pendingRate === undefined
            ? engineMedia
            : { ...engineMedia, playbackRate: pendingRate };
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

    this.#engineUnsubscribers.push(
      this.engine.on("mediachange", ({ media, standby }) =>
        this.handleEngineMediaChange(media, standby),
      ),
    );

    if (typeof document !== "undefined") {
      document.addEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
      document.addEventListener(
        "webkitfullscreenchange",
        this.handleFullscreenChange,
      );
      document.addEventListener(
        PAGE_FULLSCREEN_CHANGE_EVENT,
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
    for (const unsubscribe of this.#engineUnsubscribers.splice(0))
      unsubscribe();
    if (typeof document !== "undefined") {
      document.removeEventListener(
        "fullscreenchange",
        this.handleFullscreenChange,
      );
      document.removeEventListener(
        "webkitfullscreenchange",
        this.handleFullscreenChange,
      );
      document.removeEventListener(
        PAGE_FULLSCREEN_CHANGE_EVENT,
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

  /** Whether the engine can prepare the next video in a standby element. */
  get supportsStandbyMedia(): boolean {
    return typeof this.engine.setStandbyMedia === "function";
  }

  /**
   * The hidden second element the engine may prepare the next video in.
   * After a switch the two elements trade roles; `onActiveMediaChange`
   * says which is which.
   */
  setStandbyMedia(media: HTMLVideoElement | null): void {
    if (this.#destroyed || this.#standbyMedia === media) return;
    this.#standbyMedia = media;
    this.engine.setStandbyMedia?.(media);
  }

  onActiveMediaChange(listener: ActiveMediaListener): () => void {
    this.#activeMediaListeners.add(listener);
    return () => this.#activeMediaListeners.delete(listener);
  }

  /** The engine moved to its standby element: that one is the media now. */
  private handleEngineMediaChange(
    media: HTMLMediaElement,
    standby: HTMLMediaElement | null,
  ): void {
    if (!(media instanceof HTMLVideoElement)) return;
    const previous = this.#media;
    if (previous) {
      this.unlistenMedia(previous);
    }
    this.listenToMedia(media);
    this.#media = media;
    this.#requestedMedia = media;
    this.#standbyMedia = standby instanceof HTMLVideoElement ? standby : null;
    this.syncCapabilities();
    this.syncPictureInPicture();
    for (const listener of this.#activeMediaListeners) {
      listener(media, this.#standbyMedia);
    }
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
    this.resetZoom();
    this.#clearScrubFrame();
    const generation = ++this.#loadGeneration;
    // A pause asked for while the video loads holds: it used to be dropped
    // (nothing is ready to pause yet) and the load's autoplay started the
    // video anyway, a lesson being left among them.
    const playRequest = this.#playRequestGeneration;
    await this.#stopping;
    await this.waitForMedia();
    if (generation !== this.#loadGeneration || this.#destroyed) return;
    await this.engine.load(source, options);
    if (
      generation !== this.#loadGeneration ||
      this.#destroyed ||
      !autoPlay ||
      playRequest !== this.#playRequestGeneration
    )
      return;
    await this.engine.play();
  }

  /**
   * Stops the video outright (see `VideoEngine.stop`): paused at once, a
   * load on its way not played when it is in, the source taken off and the
   * engine's streaming player destroyed. The next `load` starts afresh.
   */
  async stop(): Promise<void> {
    this.assertActive();
    this.#playRequestGeneration += 1;
    this.#loadGeneration += 1;
    this.#media?.pause();
    const engine = this.engine;
    const stopping = (async () => {
      try {
        engine.pause();
      } catch {
        // Nothing loaded to pause.
      }
      await (engine.stop ? engine.stop() : engine.unload());
    })().catch(() => undefined);
    this.#stopping = stopping;
    await stopping;
  }

  async play(): Promise<void> {
    this.assertActive();
    // A player that has failed has nothing to play. Asked to anyway (a press
    // on the picture, the play button, a shortcut), it used to drop the
    // failure and wait for media that was never coming, so it showed
    // loading for good. Playing a failed video means trying it again.
    if (this.#snapshot.media.error) {
      if (!this.#snapshot.media.source) return;
      try {
        await this.reload();
      } catch {
        return;
      }
      this.assertActive();
      if (this.#snapshot.media.error) return;
    }
    const generation = ++this.#playRequestGeneration;
    if (!this.isMediaReady()) {
      await this.waitForMedia();
    }
    this.assertActive();
    // The next video is still loading into the element: played now, the one
    // it replaces (paused, or playing on) would start under the loader.
    await this.waitForSourceLoaded();
    this.assertActive();
    if (generation !== this.#playRequestGeneration) return;
    await this.engine.play();
  }

  waitForPresentedFrame(): Promise<void> {
    const media = this.#media;
    if (!media) return Promise.resolve();

    if (typeof media.requestVideoFrameCallback === "function") {
      return new Promise((resolve) => {
        media.requestVideoFrameCallback(() => resolve());
      });
    }

    if (
      typeof window === "undefined" ||
      typeof window.requestAnimationFrame !== "function"
    ) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
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
    // A deliberate seek replaces any drag position still queued.
    this.#scrubTarget = null;
    if (!this.isMediaReady()) {
      this.#clearScrubFrame();
      this.#pendingMediaProperties.seekTime = time;
      return;
    }
    if (this.#snapshot.ui.scrubFrameTime !== null) {
      this.#holdScrubFrameUntilSeeked(time);
    }
    this.engine.seek(time);
  }

  /**
   * One step of a timeline drag. The video shows the frame at `time` only
   * when that part is already downloaded: a drag never starts a fetch (the
   * seek on release does). Seeks run one at a time, each to the newest
   * position, because a seek started before the last one finished cancels
   * it, and a drag faster than decoding would then show no frame at all.
   */
  /**
   * With a preview video (pictures every half second, decoded at 100+ a
   * second) a moving drag shows its pictures everywhere, also over parts
   * already downloaded: seeking the lesson itself managed some 5 to 7
   * pictures a second at 1080p, and having it follow behind the preview
   * froze the page for up to a second at a time (20 frames instead of 152
   * in a 1.5s sweep). The lesson seeks only where the drag rests.
   */
  setScrubWithStoryboard(enabled: boolean): void {
    this.#scrubWithStoryboard = enabled;
  }

  scrubTo(time: number): void {
    const media = this.#media;
    if (!Number.isFinite(time) || !media || !this.isMediaReady()) return;
    const buffered = isTimeBuffered(media.buffered, time);
    if (!this.#scrubWithStoryboard && buffered) {
      this.#endScrubRest();
      this.#clearScrubFrame();
      this.#scrubTarget = time;
      if (!this.#scrubSeekInFlight) this.runScrubSeek(media);
      return;
    }

    // The storyboard picture stands in for the lesson while its own frame
    // is not close to the pointer; where the drag rests, the lesson seeks.
    this.#scrubTarget = null;
    this.#scrubRestTime = time;
    const tolerance = this.#scrubRestTolerance();
    const lessonTolerance = this.#scrubLessonTolerance();
    if (this.#scrubLessonTime === null && !media.seeking) {
      this.#scrubLessonTime = media.currentTime;
    }
    const lessonTime = this.#scrubLessonTime;
    const lag = lessonTime === null ? Infinity : Math.abs(time - lessonTime);
    if (!this.#scrubShowsLesson && lag <= lessonTolerance) {
      this.#scrubShowsLesson = true;
      this.#clearScrubFrame();
    } else if (
      this.#scrubShowsLesson &&
      lag > lessonTolerance * SCRUB_LESSON_FALL_BEHIND_TOLERANCES
    ) {
      this.#scrubShowsLesson = false;
    }
    if (!this.#scrubShowsLesson) {
      this.#releaseScrubFrameHold();
      if (this.#snapshot.ui.scrubFrameTime !== time) {
        this.updateUi({ scrubFrameTime: time });
      }
    }

    const anchor = this.#scrubRestAnchor;
    if (anchor === null || Math.abs(time - anchor) > tolerance) {
      this.#scrubRestAnchor = time;
      this.#cancelScrubRestSeek();
      this.#scheduleScrubRestSeek(
        buffered ? SCRUB_REST_BUFFERED_MS : SCRUB_REST_MS,
      );
    }
  }

  /**
   * The seek where a drag rested has finished: the lesson's frame takes
   * over from the preview if it is close enough to the pointer.
   */
  #noteScrubLessonFrame(media: HTMLMediaElement): void {
    if (media.seeking || this.#destroyed || !this.#snapshot.ui.scrubbing) {
      return;
    }
    this.#scrubLessonTime = media.currentTime;
    const time = this.#scrubRestTime;
    if (
      time === null ||
      this.#scrubShowsLesson ||
      Math.abs(time - media.currentTime) > this.#scrubLessonTolerance()
    ) {
      return;
    }
    this.#scrubShowsLesson = true;
    this.#clearScrubFrame();
  }

  #clearScrubRestTimer(): void {
    if (this.#scrubRestTimer === null) return;
    window.clearTimeout(this.#scrubRestTimer);
    this.#scrubRestTimer = null;
  }

  #scrubRestTolerance(): number {
    const duration = this.#snapshot.media.duration;
    return Number.isFinite(duration) && duration > 0
      ? duration * SCRUB_REST_TOLERANCE_SHARE
      : 0;
  }

  #scrubLessonTolerance(): number {
    return Math.min(this.#scrubRestTolerance(), SCRUB_LESSON_MAX_LAG_SECONDS);
  }

  #scheduleScrubRestSeek(delay: number): void {
    this.#clearScrubRestTimer();
    this.#scrubRestTimer = window.setTimeout(() => {
      this.#scrubRestTimer = null;
      this.#seekWhereScrubRests();
    }, delay);
  }

  /**
   * The drag has rested: the lesson seeks to where it is (fetching just the
   * segment there when it is not downloaded yet), and its frame replaces
   * the preview picture once decoded. Released there, it plays on from that
   * segment at once.
   */
  #seekWhereScrubRests(): void {
    const media = this.#media;
    const time = this.#scrubRestTime;
    if (
      !media ||
      time === null ||
      this.#destroyed ||
      !this.#snapshot.ui.scrubbing ||
      !this.isMediaReady()
    ) {
      return;
    }
    this.#cancelScrubRestSeek();
    if (!this.#scrubBufferLimited && !isTimeBuffered(media.buffered, time)) {
      this.#scrubBufferLimited = true;
      this.engine.setBufferAheadLimit?.(SCRUB_REST_BUFFER_AHEAD_SECONDS);
    }
    const onSeeked = () => {
      // Another seek is already on its way: its own `seeked` decides.
      if (media.seeking) return;
      this.#cancelScrubRestSeek();
      this.#noteScrubLessonFrame(media);
    };
    media.addEventListener("seeked", onSeeked);
    this.#scrubRestSeekCleanup = () =>
      media.removeEventListener("seeked", onSeeked);
    this.engine.seek(time);
  }

  #cancelScrubRestSeek(): void {
    this.#scrubRestSeekCleanup?.();
    this.#scrubRestSeekCleanup = null;
  }

  /** Ends a drag's rest: no seek pending, and the full buffer back. */
  #endScrubRest(): void {
    this.#clearScrubRestTimer();
    this.#cancelScrubRestSeek();
    this.#scrubRestAnchor = null;
    this.#scrubRestTime = null;
    this.#scrubLessonTime = null;
    this.#scrubShowsLesson = false;
    if (this.#scrubBufferLimited) {
      this.#scrubBufferLimited = false;
      this.engine.setBufferAheadLimit?.(null);
    }
  }

  /**
   * Keeps the storyboard picture of a released drag over the video until
   * the seek to it has a frame to show.
   */
  #holdScrubFrameUntilSeeked(time: number): void {
    this.#releaseScrubFrameHold();
    const media = this.#media;
    if (!media) {
      this.#clearScrubFrame();
      return;
    }
    if (this.#snapshot.ui.scrubFrameTime !== time) {
      this.updateUi({ scrubFrameTime: time });
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      media.removeEventListener("seeked", finish);
      media.removeEventListener("emptied", finish);
      window.clearTimeout(timeout);
      if (this.#scrubFrameRelease === release) this.#scrubFrameRelease = null;
    };
    const finish = () => {
      release();
      if (!this.#destroyed) this.#clearScrubFrame();
    };
    media.addEventListener("seeked", finish);
    media.addEventListener("emptied", finish);
    const timeout = window.setTimeout(finish, SCRUB_FRAME_HOLD_TIMEOUT_MS);
    this.#scrubFrameRelease = release;
  }

  #releaseScrubFrameHold(): void {
    this.#scrubFrameRelease?.();
    this.#scrubFrameRelease = null;
  }

  #clearScrubFrame(): void {
    this.#releaseScrubFrameHold();
    if (this.#snapshot.ui.scrubFrameTime !== null) {
      this.updateUi({ scrubFrameTime: null });
    }
  }

  private runScrubSeek(media: HTMLVideoElement): void {
    const time = this.#scrubTarget;
    this.#scrubTarget = null;
    if (time === null || media !== this.#media || this.#destroyed) {
      this.#scrubSeekInFlight = false;
      return;
    }
    this.#scrubSeekInFlight = true;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      media.removeEventListener("seeked", finish);
      window.clearTimeout(timeout);
      // One more frame so the decoded picture is painted before the next
      // seek replaces it.
      window.requestAnimationFrame(() => this.runScrubSeek(media));
    };
    media.addEventListener("seeked", finish);
    const timeout = window.setTimeout(finish, SCRUB_SEEK_TIMEOUT_MS);
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
      // Kept until the media is ready, and shown and reported as the speed
      // now: left at the old one, the speed menu snapped back and the
      // choice looked refused while a video loaded.
      this.#pendingMediaProperties.playbackRate = rate;
      if (this.#snapshot.media.playbackRate !== rate) {
        this.#snapshot = {
          ...this.#snapshot,
          media: { ...this.#snapshot.media, playbackRate: rate },
        };
        this.notify();
        this.emit({ type: "ratechange", detail: { playbackRate: rate } });
      }
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

  setTemporarySpeedBoost(temporarySpeedBoost: boolean): void {
    this.updateUi({ temporarySpeedBoost });
  }

  setSettingsView(settingsView: PlayerSettingsView): void {
    this.updateUi({ settingsView, controlsVisible: true });
  }

  /**
   * True while a drag holds the video paused, until it plays again after
   * the drag: pause and play then are the drag's, not the viewer's (the
   * play/pause feedback stays quiet).
   */
  get scrubPausing(): boolean {
    return this.#scrubPausing;
  }

  /**
   * A drag on the timeline. A playing video pauses for it, and plays again
   * from where the drag lets go (call after the seek it ends with), or from
   * where it was if the drag was cancelled.
   */
  setScrubbing(scrubbing: boolean): void {
    const wasScrubbing = this.#snapshot.ui.scrubbing;
    if (scrubbing !== wasScrubbing) this.#endScrubRest();
    if (scrubbing && !wasScrubbing) {
      const { media } = this.#snapshot;
      this.#resumeAfterScrub =
        this.isMediaReady() && !media.paused && !media.ended;
      if (this.#resumeAfterScrub) {
        this.#scrubPausing = true;
        this.pause();
      }
    }
    // A drag that ends without a seek (cancelled) drops its picture; one
    // that sought keeps it until the video catches up.
    if (!scrubbing && !this.#scrubFrameRelease) this.#clearScrubFrame();
    this.updateUi({ scrubbing, controlsVisible: true });
    if (!scrubbing && wasScrubbing) {
      const resume = this.#resumeAfterScrub;
      this.#resumeAfterScrub = false;
      if (resume && !this.#destroyed) {
        void this.play()
          .catch(() => undefined)
          .finally(() => {
            this.#scrubPausing = false;
          });
      } else {
        this.#scrubPausing = false;
      }
    }
  }

  setPreviewTime(previewTime: number | null): void {
    this.updateUi({ previewTime });
  }

  setZoomState(update: Partial<PlayerZoomState>): void {
    const zoom = { ...this.#snapshot.ui.zoom, ...update };
    const current = this.#snapshot.ui.zoom;
    if (
      zoom.scale === current.scale &&
      zoom.panX === current.panX &&
      zoom.panY === current.panY &&
      zoom.gestureActive === current.gestureActive &&
      zoom.feedbackVisible === current.feedbackVisible &&
      zoom.transitioning === current.transitioning &&
      zoom.fillSnapped === current.fillSnapped
    ) {
      return;
    }
    this.updateUi({ zoom });
  }

  resetZoom(): void {
    this.updateUi({ zoom: createInitialPlayerZoomState() });
  }

  setTheaterMode(active: boolean): void {
    if (this.#snapshot.ui.theater === active) return;
    this.updateUi({ theater: active });
    this.emit({ type: "theaterchange", detail: { active } });
  }

  showHud(text: string, options: PlayerHudOptions = {}): void {
    this.#hudId += 1;
    this.updateUi({ hud: { ...options, id: this.#hudId, text } });
  }

  clearHud(id?: number): void {
    if (id !== undefined && this.#snapshot.ui.hud?.id !== id) return;
    this.updateUi({ hud: null });
  }

  async enterFullscreen(): Promise<void> {
    const container =
      this.getPresentationContainer() as WebkitFullscreenElement | null;
    if (!container) return;
    if (!canUseElementFullscreen(container)) {
      const video = this.videoFullscreen();
      if (video) {
        // Safari on iPhone: the video's own system player, as YouTube's site
        // uses there. The page comes back as it was, with its own controls,
        // when the player is closed (`webkitendfullscreen`).
        try {
          video.webkitEnterFullscreen?.();
        } catch {
          // Refused until the video has loaded enough to show; a later
          // press works.
        }
      } else {
        this.#pageFullscreenShell = container;
        enterPageFullscreen(container, {
          contentLandscape: () => this.isContentLandscape(),
          onExitRequest: () =>
            void this.exitFullscreen().catch(() => undefined),
        });
      }
    } else if (container.requestFullscreen) {
      await container.requestFullscreen();
    } else {
      await container.webkitRequestFullscreen?.();
    }
    this.syncFullscreen();
  }

  async exitFullscreen(): Promise<void> {
    if (typeof document === "undefined") return;
    const video = this.videoFullscreen();
    if (video && (this.#videoFullscreen || video.webkitDisplayingFullscreen)) {
      video.webkitExitFullscreen?.();
      this.syncFullscreen();
      return;
    }
    const shell = this.#pageFullscreenShell;
    this.#pageFullscreenShell = null;
    if (shell && exitPageFullscreen(shell)) {
      this.syncFullscreen();
      return;
    }
    const webkitDocument = document as WebkitFullscreenDocument;
    if (document.exitFullscreen) await document.exitFullscreen();
    else await webkitDocument.webkitExitFullscreen?.();
    this.syncFullscreen();
  }

  async toggleFullscreen(): Promise<void> {
    if (this.isFullscreenActive()) await this.exitFullscreen();
    else await this.enterFullscreen();
  }

  /** The media as its own full-screen player, where the browser has one. */
  private videoFullscreen(): WebkitFullscreenVideo | null {
    const video = this.#media as WebkitFullscreenVideo | null;
    if (!video || typeof video.webkitEnterFullscreen !== "function")
      return null;
    if (video.webkitSupportsFullscreen === false) return null;
    return video;
  }

  /**
   * Whether the video is in its own system player, by its begin and end
   * events: `webkitDisplayingFullscreen` can still read true while the end
   * event is being delivered, which left the player believing it was full
   * screen after the system player had closed.
   */
  #videoFullscreen = false;

  /** Whether the player is full screen in any of its three ways. */
  private isFullscreenActive(): boolean {
    const presentationContainer = this.getPresentationContainer();
    if (
      presentationContainer &&
      getFullscreenElement() === presentationContainer
    ) {
      return true;
    }
    return this.#videoFullscreen;
  }

  private listenToMedia(media: HTMLVideoElement): void {
    media.addEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.addEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.addEventListener(
      "webkitbeginfullscreen",
      this.handleVideoFullscreenBegin,
    );
    media.addEventListener(
      "webkitendfullscreen",
      this.handleVideoFullscreenEnd,
    );
  }

  private unlistenMedia(media: HTMLVideoElement | null | undefined): void {
    if (!media) return;
    media.removeEventListener(
      "enterpictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.removeEventListener(
      "leavepictureinpicture",
      this.handlePictureInPictureChange,
    );
    media.removeEventListener(
      "webkitbeginfullscreen",
      this.handleVideoFullscreenBegin,
    );
    media.removeEventListener(
      "webkitendfullscreen",
      this.handleVideoFullscreenEnd,
    );
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

  /**
   * Whether destroy() has begun. A destroyed controller can never be
   * reactivated (its engine and media element are gone) — PlayerRoot uses
   * this to construct a replacement controller when React re-reveals a
   * player whose deferred destruction already ran (see PlayerRoot's
   * lifecycle effect).
   */
  get destroyed(): boolean {
    return this.#destroyed;
  }

  async destroy(): Promise<void> {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#releaseScrubFrameHold();
    this.#endScrubRest();
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
    // A page full screen is the page's own: it does not end with the player.
    if (this.#pageFullscreenShell)
      exitPageFullscreen(this.#pageFullscreenShell);
    this.#pageFullscreenShell = null;
    this.deactivate();
    this.#listeners.clear();
    this.#eventListeners.clear();
    await this.#mediaTransition;
    this.unlistenMedia(this.#media);
    this.#media = null;
    this.#mediaAttached = false;
    await this.engine.destroy();
  }

  private readonly handleFullscreenChange = (): void => this.syncFullscreen();

  /**
   * The system player closed (iPhone): the page is back, and the lesson's
   * controls are shown again so it does not come back bare. Safari may
   * close the player with the video paused; the controls say so.
   */
  private readonly handleVideoFullscreenBegin = (): void => {
    this.#videoFullscreen = true;
    this.syncFullscreen();
  };

  private readonly handleVideoFullscreenEnd = (): void => {
    this.#videoFullscreen = false;
    this.syncFullscreen();
    this.setSettingsView("closed");
    this.setControlsVisible(true);
  };

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

  /**
   * Whether the picture is wider than tall, which decides whether a page
   * full screen on an upright phone turns it (see pageFullscreen.ts). A
   * video whose size is not known yet counts as wide, as lessons are.
   */
  private isContentLandscape(): boolean {
    const media = this.#media;
    if (!media?.videoWidth || !media.videoHeight) return true;
    return media.videoWidth >= media.videoHeight;
  }

  private syncFullscreen(): void {
    const active = this.isFullscreenActive();
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
    return (
      this.#presentationContainerResolver?.() ?? this.#presentationContainer
    );
  }

  private enqueueMediaTransition(
    operation: () => Promise<void>,
  ): Promise<void> {
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
      if (this.#destroyed || generation !== this.#mediaRequestGeneration)
        return;
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
    this.unlistenMedia(media);
    this.listenToMedia(media);
    this.#settledMediaGeneration = generation;
    this.flushPendingMediaProperties();
    this.syncCapabilities();
    this.resolveMediaWaiters();
    this.syncPictureInPicture();
  }

  private async detachAttachedMedia(): Promise<void> {
    const media = this.#media;
    if (!media || !this.#mediaAttached) return;
    this.unlistenMedia(media);
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

  /** Settles once no source is loading (it loaded, or failed). */
  private waitForSourceLoaded(): Promise<void> {
    if (this.engine.getSnapshot().lifecycle !== "loading") {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      const stop = this.engine.on("snapshotchange", (media) => {
        if (media.lifecycle === "loading") return;
        stop();
        resolve();
      });
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
