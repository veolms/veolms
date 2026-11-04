import { VideoEngineError, normalizeUnknownError } from "../../core/errors";
import type {
  VideoAudioTrack,
  VideoEngineCapabilities,
  VideoLoadOptions,
  VideoQuality,
  VideoSource,
  VideoTextTrack,
} from "../../core/types";
import { MediaElementEngineBase } from "../base/MediaElementEngineBase";
import {
  abandonEarlyShakaPreloadSession,
  consumeEarlyShakaPreloadSession,
  discardEarlyShakaPreloadManager,
  getEarlyShakaPreloadSession,
  noteEarlyShakaPreloadAdopted,
  noteShakaSourceLoading,
  onSpeculativeShakaPreload,
  waitForEarlyShakaPreloadSession,
  type EarlyShakaPreloadSession,
} from "./shaka-early-preload";
import {
  addExternalTextTrack,
  configureShakaPlayer,
  createShakaConfiguration,
  createShakaNetworkingFilters,
  defaultShakaRuntimeLoader,
  getShakaStartupBandwidthEstimate,
  isShakaAutoQuality,
  noteAssumedShakaBandwidthEstimate,
  normalizeShakaAudioTrack,
  PREFERRED_QUALITY_START_BANDWIDTH,
  normalizeShakaQuality,
  normalizeShakaTextTrack,
  registerShakaNetworkingFilters,
  rememberShakaBandwidthEstimate,
  resolveShakaLoadMimeType,
  resolveShakaRuntime,
  shakaDrmServers,
  shakaHeldVideoHeight,
  shakaPreferredVideoHeight,
  shakaStartVideoHeight,
  unregisterShakaNetworkingFilters,
  withoutPreferredVideoHeight,
  withoutStartVideoHeight,
} from "./shaka-internal";
import type {
  ShakaAudioTrackLike,
  ShakaErrorLike,
  ShakaEventLike,
  ShakaNetworkResponseLike,
  ShakaPlayerLike,
  ShakaPreloadManagerLike,
  ShakaRequestContextLike,
  ShakaResponseFilterLike,
  ShakaRuntimeLike,
  ShakaRuntimeLoader,
  ShakaTextTrackLike,
  ShakaVariantTrackLike,
} from "./shaka-internal";

export interface ShakaVideoEngineOptions {
  runtimeLoader?: () => Promise<unknown>;
}

type ShakaListener = (event: ShakaEventLike) => void;

const PRELOAD_START_TOLERANCE_SECONDS = 2;
/**
 * A quality switch keeps what is buffered up to a point ahead of the
 * playhead and fetches the new quality from there, so the picture changes
 * over without a stall. The new quality must start far enough ahead to
 * arrive in time: room for the request, an init segment and a licence...
 */
const QUALITY_SWITCH_BASE_LEAD_SECONDS = 1.5;
/** ...plus the new quality's first segment downloading, with room to spare. */
const QUALITY_SWITCH_DOWNLOAD_SAFETY = 1.25;
/**
 * The most that lead allows for. A link that really cannot fetch a segment
 * in this long cannot play that quality without stalls anyway.
 */
const QUALITY_SWITCH_MAX_LEAD_SECONDS = 6;
/**
 * A switch up cuts this far past the segment start it changes at, so the
 * segment Shaka fetches first (the one holding the cut) starts right there.
 */
const QUALITY_SWITCH_PAST_SEGMENT_START_SECONDS = 0.1;
/** The segment length assumed when Shaka cannot say (DASH lessons: ~8s). */
const QUALITY_SWITCH_FALLBACK_SEGMENT_SECONDS = 8;
/** Room for segment times that are not exactly what the manifest says. */
const QUALITY_SWITCH_SEGMENT_SLACK_SECONDS = 1;
/**
 * How much of the better picture already buffered a switch down plays
 * before the lower quality takes over (it changes at the segment holding
 * this point, so a few seconds sooner). All of it when less is buffered.
 */
const QUALITY_DOWN_SWITCH_KEEP_SECONDS = 20;
/**
 * A standby (the next video, prepared out of sight) keeps only its start:
 * enough to begin on at once, little to download for a hover that may not
 * turn into a click. The full buffer applies once it is switched to.
 */
const STANDBY_BUFFERING_GOAL_SECONDS = 6;
/** How long a load waits for a standby still decoding its first frame. */
const STANDBY_READY_WAIT_MS = 1_500;
/** A standby without a decoded first frame by then is given up. */
const STANDBY_FIRST_FRAME_TIMEOUT_MS = 8_000;
/** `HTMLMediaElement.HAVE_CURRENT_DATA`: a frame is decoded and showable. */
const HAVE_CURRENT_DATA = 2;
/**
 * A segment that still could not be downloaded after its own retries (the
 * CDN answering 500, or nothing arriving for a while) stops that stream for
 * good in Shaka on a video that is not live: it then switches to another
 * quality, but only with automatic quality on and another stream to switch
 * to. A chosen quality, and the one audio stream of a DASH lesson, have
 * none, so the error was final: "Something went wrong" on HLS lessons, and
 * on DASH lessons a picture that froze once what was buffered ran out. It
 * showed at the very end because that is where the last segments are
 * fetched on a slow link, beside the next lesson preloading. The stream is
 * now asked for again, this many times in a row before the error stands...
 */
const STREAMING_RETRY_LIMIT = 8;
/** ...this long after the first failure, twice as long after each next one... */
const STREAMING_RETRY_FIRST_DELAY_SECONDS = 1;
/** ...and never longer than this. */
const STREAMING_RETRY_MAX_DELAY_SECONDS = 8;

/** Resolves true once `media` has a decoded frame to show, false on timeout. */
function waitForFirstFrame(
  media: HTMLMediaElement,
  timeoutMs: number,
): Promise<boolean> {
  if (media.readyState >= HAVE_CURRENT_DATA) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = (ready: boolean) => {
      window.clearTimeout(timer);
      media.removeEventListener("loadeddata", onData);
      media.removeEventListener("canplay", onData);
      media.removeEventListener("emptied", onEmptied);
      resolve(ready);
    };
    const onData = () => {
      if (media.readyState >= HAVE_CURRENT_DATA) done(true);
    };
    const onEmptied = () => done(false);
    const timer = window.setTimeout(() => done(false), timeoutMs);
    media.addEventListener("loadeddata", onData);
    media.addEventListener("canplay", onData);
    media.addEventListener("emptied", onEmptied);
  });
}

/** Seconds buffered without a gap from the playhead on. */
function bufferedAheadSeconds(media: HTMLMediaElement): number {
  const { buffered, currentTime } = media;
  for (let index = 0; index < buffered.length; index += 1) {
    if (
      buffered.start(index) <= currentTime + 0.1 &&
      currentTime < buffered.end(index)
    ) {
      return buffered.end(index) - currentTime;
    }
  }
  return 0;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

/** A `veo:` performance mark; diagnostic only, never in the way of playback. */
function markPlayback(name: string, detail?: Record<string, unknown>): void {
  try {
    performance.mark(`veo:${name}`, detail ? { detail } : undefined);
  } catch {
    // Marks are diagnostics.
  }
}

/**
 * The player's subtitle layer (see `SubtitleLayer`): subtitles drawn there
 * stay out of the picture's zoom and can be moved and resized on their own.
 * Without one Shaka draws them in the media element. Shaka makes its
 * subtitle renderer as media is attached, so it is handed over before every
 * attach.
 */
function subtitleLayerFor(media: HTMLMediaElement): HTMLElement | null {
  return (
    media
      .closest("[data-video-player-root]")
      ?.querySelector<HTMLElement>("[data-video-player-subtitles]") ?? null
  );
}

function preloadSessionMatchesSource(
  session: EarlyShakaPreloadSession,
  source: VideoSource,
): boolean {
  const manifestMatches = session.manifestUrl === source.src;
  const mediaKeyMatches = Boolean(
    session.mediaKey && source.id && session.mediaKey === source.id,
  );
  // The paid bootstrap can resolve after the player source was created. A
  // stable media key is sufficient to adopt that session; its manifest URL
  // may be the protected API HLS path rather than the local fallback URL.
  return manifestMatches || mediaKeyMatches;
}

function visualQualityKey(track: ShakaVariantTrackLike): string {
  return [
    track.width ?? "",
    track.height ?? "",
    track.frameRate ?? "",
    track.videoCodec ?? "",
    track.hdr ?? "",
  ].join("|");
}

function hasSameRoles(
  left: readonly string[] | undefined,
  right: readonly string[] | undefined,
): boolean {
  if (!left?.length || !right?.length) return true;
  if (left.length !== right.length) return false;
  const expected = new Set(left);
  return right.every((role) => expected.has(role));
}

function variantMatchesAudioTrack(
  variant: ShakaVariantTrackLike,
  audio: ShakaAudioTrackLike,
): boolean {
  if (
    variant.audioId != null &&
    audio.id != null &&
    String(variant.audioId) !== String(audio.id)
  ) {
    return false;
  }
  if (
    variant.language &&
    audio.language &&
    variant.language !== audio.language
  ) {
    return false;
  }
  if (!hasSameRoles(variant.audioRoles, audio.roles)) return false;
  if (
    variant.channelsCount != null &&
    audio.channelsCount != null &&
    variant.channelsCount !== audio.channelsCount
  ) {
    return false;
  }
  return true;
}

function variantsForSelectedAudio(
  variants: readonly ShakaVariantTrackLike[],
  audioTracks: readonly ShakaAudioTrackLike[],
): ShakaVariantTrackLike[] {
  const activeAudio = audioTracks.find((track) => track.active);
  const matching = activeAudio
    ? variants.filter((variant) =>
        variantMatchesAudioTrack(variant, activeAudio),
      )
    : [...variants];
  const candidates = matching.length > 0 ? matching : [...variants];
  const byVisualQuality = new Map<string, ShakaVariantTrackLike>();

  for (const candidate of candidates) {
    const key = visualQualityKey(candidate);
    const current = byVisualQuality.get(key);
    if (
      !current ||
      candidate.active ||
      (!current.active && (candidate.bandwidth ?? 0) > (current.bandwidth ?? 0))
    ) {
      byVisualQuality.set(key, candidate);
    }
  }

  return [...byVisualQuality.values()];
}

/**
 * The variant to play for a chosen height: the tallest not above it, or the
 * shortest when every variant is taller. Among variants of one height the
 * playing one, else the one with the most bandwidth (the best encode).
 */
function variantForHeight(
  variants: readonly ShakaVariantTrackLike[],
  height: number,
): ShakaVariantTrackLike | null {
  let best: ShakaVariantTrackLike | null = null;
  let shortest: ShakaVariantTrackLike | null = null;
  for (const variant of variants) {
    const variantHeight = variant.height ?? 0;
    if (!variantHeight) continue;
    if (
      !shortest ||
      variantHeight < (shortest.height ?? 0) ||
      (variantHeight === shortest.height &&
        (variant.bandwidth ?? 0) < (shortest.bandwidth ?? 0))
    ) {
      shortest = variant;
    }
    if (variantHeight > height) continue;
    const bestHeight = best?.height ?? 0;
    if (
      !best ||
      variantHeight > bestHeight ||
      (variantHeight === bestHeight &&
        !best.active &&
        (variant.active || (variant.bandwidth ?? 0) > (best.bandwidth ?? 0)))
    ) {
      best = variant;
    }
  }
  return best ?? shortest;
}

/** Whether `track` is a lower quality than `than`: shorter, or leaner. */
function isLowerQuality(
  track: ShakaVariantTrackLike,
  than: ShakaVariantTrackLike,
): boolean {
  if (track.height && than.height && track.height !== than.height) {
    return track.height < than.height;
  }
  return (track.bandwidth ?? 0) < (than.bandwidth ?? 0);
}

/**
 * The start of the first segment of the playing video at or after `time`
 * (seconds), from the manifest; null when Shaka cannot say. A new picture
 * can only begin at a segment start, where its keyframe is.
 */
function nextSegmentStart(
  player: ShakaPlayerLike,
  active: ShakaVariantTrackLike | undefined,
  time: number,
): number | null {
  if (!active) return null;
  try {
    const variant = player
      .getManifest?.()
      ?.variants.find(
        (candidate) => String(candidate.id) === String(active.id),
      );
    const index = variant?.video?.segmentIndex;
    if (!index) return null;
    const position = index.find(time);
    if (position === null) return null;
    const segment = index.get(position);
    if (!segment) return null;
    if (segment.startTime >= time) return segment.startTime;
    return index.get(position + 1)?.startTime ?? segment.endTime;
  } catch {
    return null;
  }
}

/** A response this big is a video segment, not a manifest or a key. */
const MEASURED_SEGMENT_MIN_BYTES = 100_000;

/**
 * The speed recent segment downloads showed (bits per second, latency
 * included), from the browser's own timing of them; null with too few.
 * Shaka's estimate runs far below the link: a lesson whose 1.3 MB 1080p
 * segments arrived in 0.9s was estimated at under 1 Mbps.
 */
function measuredSegmentBandwidth(): number | null {
  if (typeof performance === "undefined") return null;
  const speeds: number[] = [];
  const entries = performance.getEntriesByType(
    "resource",
  ) as PerformanceResourceTiming[];
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]!;
    if (!/\.(?:m4s|ts|mp4)(?:[?#]|$)/u.test(entry.name)) continue;
    if (entry.encodedBodySize < MEASURED_SEGMENT_MIN_BYTES) continue;
    const seconds =
      (entry.responseEnd - (entry.requestStart || entry.startTime)) / 1000;
    if (seconds > 0) speeds.push((entry.encodedBodySize * 8) / seconds);
    if (speeds.length === 6) break;
  }
  if (speeds.length < 2) return null;
  speeds.sort((left, right) => left - right);
  return speeds[Math.floor(speeds.length / 2)]!;
}

export class ShakaVideoEngine extends MediaElementEngineBase {
  readonly name = "shaka";

  readonly #runtimeLoader: ShakaRuntimeLoader;
  readonly #shakaListeners = new Map<string, ShakaListener>();
  readonly #qualityTracks = new Map<string, ShakaVariantTrackLike>();
  readonly #audioTracks = new Map<string, ShakaAudioTrackLike>();
  readonly #textTracks = new Map<string, ShakaTextTrackLike>();
  #runtime: ShakaRuntimeLike | null = null;
  #player: ShakaPlayerLike | null = null;
  #requestFilter: ReturnType<
    typeof createShakaNetworkingFilters
  >["requestFilter"] = null;
  #responseFilter: ReturnType<
    typeof createShakaNetworkingFilters
  >["responseFilter"] = null;
  #adoptedPreloadSession: EarlyShakaPreloadSession | null = null;
  /** The hidden element the next video is prepared in (see setStandbyMedia). */
  #standbyMedia: HTMLMediaElement | null = null;
  /** Settles once the player last playing in the standby element is gone. */
  #standbyReleased: Promise<void> = Promise.resolve();
  /** Streaming failures retried in a row (see `STREAMING_RETRY_LIMIT`). */
  #streamingRetries = 0;
  #stopWatchingSpeculativePreloads: (() => void) | null = null;
  /** Drops a source's streaming settings still waiting for its first frame. */
  #cancelDeferredStreaming: (() => void) | null = null;
  #autoQuality = true;
  /** The quality the viewer picked since the current load, if any. */
  #qualityChoice: "auto" | "manual" | null = null;
  /**
   * The height the current source holds at while its video segments come
   * from the device (see `holdVideoHeight`); null once released.
   */
  #heldHeight: number | null = null;
  /** Watches the responses for the first video segment from the network. */
  #holdReleaseFilter: ShakaResponseFilterLike | null = null;
  /** The element whose picture `hideOutgoingVideo` hid, until revealed. */
  #hiddenMedia: HTMLMediaElement | null = null;
  #selectedTextTrackId: string | null = null;
  #browserSupported: boolean | null = null;

  constructor(options: ShakaVideoEngineOptions = {}) {
    super();
    this.#runtimeLoader = options.runtimeLoader ?? defaultShakaRuntimeLoader;
  }

  setStandbyMedia(media: HTMLMediaElement | null): void {
    if (this.#standbyMedia === media) return;
    const previous = this.#standbyMedia;
    this.assignStandbyMedia(media);
    if (previous) void this.dropStandbyPreparedIn(previous);
    if (!media) {
      this.#stopWatchingSpeculativePreloads?.();
      this.#stopWatchingSpeculativePreloads = null;
      return;
    }
    this.#stopWatchingSpeculativePreloads ??= onSpeculativeShakaPreload(
      (session) => void this.prepareStandby(session),
    );
  }

  override getCapabilities(): VideoEngineCapabilities {
    const base = super.getCapabilities();
    return {
      ...base,
      browserSupported: this.#browserSupported ?? base.browserSupported,
      adaptiveStreaming: true,
      drm:
        typeof navigator !== "undefined" &&
        "requestMediaKeySystemAccess" in navigator,
    };
  }

  async load(
    source: VideoSource,
    options: VideoLoadOptions = {},
  ): Promise<void> {
    const media = this.requireMedia();
    let player = this.requirePlayer();
    const runtime = this.requireRuntime();
    const generation = this.beginOperation();
    this.#streamingRetries = 0;
    this.hideOutgoingVideo(media);
    this.startLoading(source);
    this.#selectedTextTrackId = null;
    this.#autoQuality = isShakaAutoQuality(source);
    this.#qualityChoice = null;
    this.#cancelDeferredStreaming?.();
    this.stopWatchingForHoldRelease();
    // Watched for release once the networking filters are in (they are
    // cleared and set again on the way, see installNetworkingFilters).
    this.#heldHeight = shakaHeldVideoHeight(source);
    if (this.#heldHeight !== null) {
      markPlayback("cached-height-held", { height: this.#heldHeight });
    }
    // What the previous video measured sets where this one starts.
    rememberShakaBandwidthEstimate(player);
    markPlayback("shaka-load", { id: source.id });

    try {
      // Prepared out of sight (a hovered or next lesson): switch to it.
      const standbySession = await this.readyStandbyFor(source);
      if (!this.isCurrentOperation(generation)) return;
      if (standbySession) {
        this.switchToStandby(standbySession, media);
        await this.completeStandbyLoad(
          standbySession,
          source,
          options,
          runtime,
          generation,
        );
        return;
      }

      const speculativeSession = await this.adoptSpeculativePreloadSession(
        source,
        media,
      );
      if (!this.isCurrentOperation(generation)) {
        if (speculativeSession) {
          await discardEarlyShakaPreloadManager(speculativeSession);
        }
        return;
      }
      player = this.requirePlayer();
      this.clearNetworkingFilters();
      const preloadSession =
        speculativeSession ?? this.takeMatchingPreloadSession(source);
      if (!preloadSession) noteShakaSourceLoading(source.src);
      const keepPreloadStreaming = Boolean(preloadSession?.preloadPromise);
      if (
        !configureShakaPlayer(player, source, runtime, {
          reset: !preloadSession,
          keepPreloadStreaming,
        })
      ) {
        throw new VideoEngineError({
          category: "PLAYER",
          code: "INVALID_SHAKA_CONFIGURATION",
          message: "Shaka rejected the supplied playback configuration.",
        });
      }
      this.installNetworkingFilters(source);

      const startTime = options.startTime ?? source.startTime;
      // A preload plays from where it was preloaded; one made for another
      // position (the learner's place changed since) would start there.
      if (
        preloadSession?.preloadPromise &&
        Math.abs((preloadSession.startTime ?? 0) - (startTime ?? 0)) >
          PRELOAD_START_TOLERANCE_SECONDS
      ) {
        markPlayback("preload-start-mismatch", {
          preloaded: preloadSession.startTime ?? 0,
          requested: startTime ?? 0,
        });
        await discardEarlyShakaPreloadManager(preloadSession);
      }
      // A preload keeps the licence servers it was started with. The page's
      // first lesson is preloaded from the document head, and when Shaka
      // comes from the browser cache that can be before an extension (DRM)
      // has added its licence server: played, it fails with Shaka 6012.
      if (
        preloadSession?.preloadPromise &&
        preloadSession.drmServers !== undefined &&
        preloadSession.drmServers !== shakaDrmServers(player)
      ) {
        markPlayback("preload-drm-mismatch");
        await discardEarlyShakaPreloadManager(preloadSession);
      }
      const mimeType = resolveShakaLoadMimeType(source, options);
      const asset =
        preloadSession?.preloadPromise != null
          ? await this.resolveLoadAsset(preloadSession, source.src)
          : source.src;
      if (typeof asset !== "string") {
        if (!this.isCurrentOperation(generation)) {
          await asset.destroy().catch(() => undefined);
          return;
        }
        await player.load(asset, startTime);
        if (this.isCurrentOperation(generation)) {
          this.applyStreamingAfterFirstFrame(player, source, runtime);
        }
      } else {
        if (keepPreloadStreaming) {
          // The preload was dropped after all (made for another position):
          // this source's buffering and quality apply from the start.
          player.configure({
            streaming: createShakaConfiguration(source, runtime).streaming,
            abr: this.abrConfiguration(source, runtime),
          });
        }
        const stopPreferring = this.startAtPreferredQuality(player, source);
        // A start height caps the first variant until the first frame.
        if (shakaStartVideoHeight(source) !== null) {
          this.applyStreamingAfterFirstFrame(player, source, runtime);
        }
        try {
          await player.load(asset, startTime, mimeType);
        } finally {
          stopPreferring();
        }
      }

      if (!this.isCurrentOperation(generation)) {
        return;
      }

      this.revealVideo();
      await this.finishLoad(player, source, generation);
    } catch (error) {
      if (!this.isCurrentOperation(generation)) {
        return;
      }

      this.revealVideo();
      const existing = this.getSnapshot().error;
      const normalized =
        existing ??
        this.normalizeShakaError(error, "SHAKA_LOAD_FAILED", "SOURCE");
      if (!existing) {
        this.emitError(normalized, normalized.fatal);
      }
      throw normalized;
    }
  }

  /**
   * See `VideoEngine.stop`. The Shaka player that played the video is
   * destroyed, which takes its MediaSource, its downloads and its licences
   * with it, and a new one is attached to the same element for the next
   * load. A load on its way is given up (`beginOperation`). The hidden
   * standby and what is prepared in it are left alone: they are for the
   * next video.
   */
  async stop(): Promise<void> {
    const media = this.mediaElement;
    const runtime = this.#runtime;
    const previous = this.#player;
    this.beginOperation();
    media?.pause();
    if (!media || !runtime || !previous) return;
    this.updateSnapshot({ lifecycle: "unloading" });
    this.#cancelDeferredStreaming?.();
    rememberShakaBandwidthEstimate(previous);
    this.clearNetworkingFilters();
    this.unbindShakaEvents(previous);
    const adoptedSession = this.#adoptedPreloadSession;
    this.#adoptedPreloadSession = null;
    if (adoptedSession && !adoptedSession.consumed) {
      consumeEarlyShakaPreloadSession(adoptedSession);
      await discardEarlyShakaPreloadManager(adoptedSession);
    }
    // In place before the old one is gone, so nothing finds no player.
    const next = new runtime.Player();
    this.#player = next;
    this.bindShakaEvents(next);
    await previous.destroy().catch(() => undefined);
    if (media.currentSrc || media.hasAttribute("src")) {
      media.removeAttribute("src");
      media.load();
    }
    next.setVideoContainer?.(subtitleLayerFor(media));
    await next.attach(media);
    this.revealVideo();
    this.clearTrackMaps();
    this.finishUnloading();
  }

  async unload(): Promise<void> {
    this.requireMedia();
    const player = this.requirePlayer();
    const generation = this.beginOperation();
    this.updateSnapshot({ lifecycle: "unloading" });
    rememberShakaBandwidthEstimate(player);
    this.clearNetworkingFilters();

    try {
      await player.unload();
      if (!this.isCurrentOperation(generation)) {
        return;
      }
      this.revealVideo();
      this.clearTrackMaps();
      this.finishUnloading();
    } catch (error) {
      if (!this.isCurrentOperation(generation)) {
        return;
      }
      const normalized = this.normalizeShakaError(
        error,
        "SHAKA_UNLOAD_FAILED",
        "PLAYER",
      );
      this.emitError(normalized);
      throw normalized;
    }
  }

  override selectQuality(id: string): void {
    if (id === "auto") {
      this.enableAutoQuality();
      return;
    }

    const player = this.requirePlayer();
    const track = this.#qualityTracks.get(id);
    if (!track) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "QUALITY_NOT_FOUND",
        message: `Quality '${id}' is not available.`,
      });
    }

    player.configure({ abr: { enabled: false } });
    this.#qualityChoice = "manual";
    this.#heldHeight = null;
    this.stopWatchingForHoldRelease();
    this.switchQualitySmoothly(player, track, { upAtOnce: true });
    this.#autoQuality = false;
    this.refreshTracks(false);
    const quality = this.getQualities().find((item) => item.id === id) ?? null;
    this.setTrackState({ autoQuality: false, selectedQualityId: id });
    this.emit("qualitychange", { quality, auto: false });
  }

  setBufferAheadLimit(seconds: number | null): void {
    const player = this.#player;
    const runtime = this.#runtime;
    const source = this.getSnapshot().source;
    if (!player || !runtime || !source) return;
    player.configure({
      streaming:
        seconds === null
          ? createShakaConfiguration(source, runtime).streaming
          : { bufferingGoal: seconds },
    });
  }

  override enableAutoQuality(): void {
    const player = this.requirePlayer();
    const runtime = this.#runtime;
    const source = this.getSnapshot().source;
    this.#qualityChoice = "auto";
    this.#heldHeight = null;
    this.stopWatchingForHoldRelease();
    player.configure({
      abr:
        runtime && source
          ? this.abrConfiguration(source, runtime)
          : { enabled: true },
    });
    this.#autoQuality = true;
    this.refreshTracks(false);
    const active =
      this.getQualities().find((quality) => quality.active) ?? null;
    this.setTrackState({
      autoQuality: true,
      selectedQualityId: active?.id ?? null,
    });
    this.emit("qualitychange", { quality: active, auto: true });
  }

  override selectAudioTrack(id: string): void {
    const player = this.requirePlayer();
    const track = this.#audioTracks.get(id);
    if (!track) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "AUDIO_TRACK_NOT_FOUND",
        message: `Audio track '${id}' is not available.`,
      });
    }

    player.selectAudioTrack(track);
    this.refreshTracks(false);
    const selected =
      this.getAudioTracks().find((item) => item.id === id) ?? null;
    this.setTrackState({ selectedAudioTrackId: id });
    this.emit("audiotrackchange", { track: selected });
  }

  override selectTextTrack(id: string | null): void {
    const player = this.requirePlayer();
    if (id === null) {
      this.#selectedTextTrackId = null;
      player.selectTextTrack(null);
      player.setTextTrackVisibility?.(false);
      this.refreshTracks(false);
      this.setTrackState({ selectedTextTrackId: null });
      this.emit("texttrackchange", { track: null });
      return;
    }

    const track = this.#textTracks.get(id);
    if (!track) {
      throw new VideoEngineError({
        category: "TEXT",
        code: "TEXT_TRACK_NOT_FOUND",
        message: `Text track '${id}' is not available.`,
      });
    }

    this.#selectedTextTrackId = id;
    player.selectTextTrack(track);
    player.setTextTrackVisibility?.(true);
    this.refreshTracks(false);
    const selected =
      this.getTextTracks().find((item) => item.id === id) ?? null;
    this.setTrackState({ selectedTextTrackId: id });
    this.emit("texttrackchange", { track: selected });
  }

  /**
   * Shaka shows captions through <track> elements of its own, which mirror
   * its text tracks under other ids and stay hidden until one is picked. The
   * list stays Shaka's, so a caption picked in the menu is one this engine
   * can select (from the browser's list it was "not available").
   */
  protected override refreshNativeTextTracks(): void {
    this.refreshTracks(true);
  }

  protected override async onAttached(media: HTMLMediaElement): Promise<void> {
    const preloadSession = await waitForEarlyShakaPreloadSession();
    const runtime =
      this.#runtime ?? resolveShakaRuntime(await this.#runtimeLoader());
    this.#runtime = runtime;
    runtime.polyfill.installAll();
    this.#browserSupported = runtime.Player.isBrowserSupported();

    if (!this.#browserSupported) {
      if (preloadSession) {
        await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      }
      throw new VideoEngineError({
        category: "UNSUPPORTED",
        code: "SHAKA_BROWSER_UNSUPPORTED",
        message: "This browser does not support Shaka Player.",
      });
    }

    if (!this.#player && preloadSession?.player && !preloadSession.standby) {
      markPlayback("preload-adopted-on-attach");
      noteEarlyShakaPreloadAdopted(preloadSession);
      this.#player = preloadSession.player;
      this.#adoptedPreloadSession = preloadSession;
      if (preloadSession.networkingFilters) {
        this.#requestFilter = preloadSession.networkingFilters.requestFilter;
        this.#responseFilter = preloadSession.networkingFilters.responseFilter;
      }
      this.bindShakaEvents(this.#player);
    } else if (!this.#player) {
      if (getEarlyShakaPreloadSession()) {
        await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      }
      this.#player = new runtime.Player();
      this.bindShakaEvents(this.#player);
    }
    this.#player.setVideoContainer?.(subtitleLayerFor(media));
    await this.#player.attach(media);
  }

  protected override async onDetaching(
    _media: HTMLMediaElement,
  ): Promise<void> {
    this.#selectedTextTrackId = null;
    this.#cancelDeferredStreaming?.();
    this.revealVideo();
    rememberShakaBandwidthEstimate(this.#player);
    this.clearNetworkingFilters();
    this.clearTrackMaps();
    await this.#player?.detach();
  }

  protected override async onDestroying(
    _media: HTMLMediaElement | null,
  ): Promise<void> {
    this.#cancelDeferredStreaming?.();
    rememberShakaBandwidthEstimate(this.#player);
    this.clearNetworkingFilters();
    this.#stopWatchingSpeculativePreloads?.();
    this.#stopWatchingSpeculativePreloads = null;
    if (this.#standbyMedia)
      await this.dropStandbyPreparedIn(this.#standbyMedia);
    this.assignStandbyMedia(null);
    const player = this.#player;
    const adoptedSession = this.#adoptedPreloadSession;
    this.#adoptedPreloadSession = null;
    if (adoptedSession && !adoptedSession.consumed) {
      consumeEarlyShakaPreloadSession(adoptedSession);
      await discardEarlyShakaPreloadManager(adoptedSession);
    } else if (!adoptedSession) {
      // A speculative preload (a hovered or next lesson) is for whichever
      // player opens that lesson next, often the one replacing this one; it
      // must outlive this player's teardown.
      const leftover = getEarlyShakaPreloadSession();
      if (leftover && !leftover.speculative) {
        await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      }
    }
    if (player) {
      this.unbindShakaEvents(player);
      await player.destroy();
    }
    this.#player = null;
    this.#runtime = null;
    this.clearTrackMaps();
  }

  /**
   * A preload plays with the settings it was made with (a hovered lesson
   * preloads less); this source's buffering and quality settings apply once
   * its first frame has played. Not before: in Shaka 5.2.7 every
   * `configure` call re-runs the whole configuration, which drops the
   * segments the preload fetched but has not appended yet (the prefetch
   * limit goes back to 0) and makes ABR choose again from the preload's
   * fast downloads. The first frame then waited for a fresh 1080p segment:
   * about 1.6 s of a 4.1 s lesson switch on production. The quality
   * settings were still given before the load as well (configureShakaPlayer
   * with `keepPreloadStreaming` leaves them out now): the lesson opened from
   * the home page, prepared there at 360p, fetched its start again in
   * 1080p. Quality then rises from the preload's tier as it plays.
   */
  private applyStreamingAfterFirstFrame(
    player: ShakaPlayerLike,
    source: VideoSource,
    runtime: ShakaRuntimeLike,
  ): void {
    this.#cancelDeferredStreaming?.();
    const media = this.mediaElement;
    const apply = (): void => {
      cancel();
      if (this.#player !== player) return;
      const abr = this.abrConfiguration(source, runtime);
      player.configure({
        streaming: createShakaConfiguration(source, runtime).streaming,
        abr: { ...abr, ...this.startHeightBandwidthFloor(player, source, abr) },
      });
      this.keepPreferredQuality(player, source);
    };
    const cancel = (): void => {
      media?.removeEventListener("playing", apply);
      if (this.#cancelDeferredStreaming === cancel) {
        this.#cancelDeferredStreaming = null;
      }
    };
    if (!media) {
      apply();
      return;
    }
    media.addEventListener("playing", apply);
    this.#cancelDeferredStreaming = cancel;
  }

  /**
   * Once a start height's cap is lifted, ABR has measured nothing (segments
   * from the device cache are not counted) and would step down to its
   * default estimate, fetching from the network what was kept. It starts
   * from at least the variant playing instead, and moves once it measures.
   */
  private startHeightBandwidthFloor(
    player: ShakaPlayerLike,
    source: VideoSource,
    abr: Record<string, unknown>,
  ): { defaultBandwidthEstimate?: number } {
    if (
      (shakaStartVideoHeight(source) === null &&
        shakaHeldVideoHeight(source) === null) ||
      abr.enabled === false
    ) {
      return {};
    }
    const active = player.getVariantTracks().find((track) => track.active);
    const bandwidth = active?.bandwidth;
    if (typeof bandwidth !== "number" || !(bandwidth > 0)) return {};
    const downgradeTarget =
      typeof abr.bandwidthDowngradeTarget === "number" &&
      abr.bandwidthDowngradeTarget > 0
        ? abr.bandwidthDowngradeTarget
        : 0.95;
    const floor = Math.ceil((bandwidth / downgradeTarget) * 1.01);
    const current =
      typeof abr.defaultBandwidthEstimate === "number"
        ? abr.defaultBandwidthEstimate
        : 0;
    if (floor <= current) return {};
    noteAssumedShakaBandwidthEstimate(player, floor);
    return { defaultBandwidthEstimate: floor };
  }

  /**
   * The ABR settings for `source` as the viewer has it now: auto quality
   * when they picked it since the load (or the source has no chosen
   * quality), the chosen quality's otherwise.
   */
  private abrConfiguration(
    source: VideoSource,
    runtime: ShakaRuntimeLike,
  ): Record<string, unknown> {
    const auto =
      this.#qualityChoice === null
        ? isShakaAutoQuality(source)
        : this.#qualityChoice === "auto";
    // A hold still on (nothing from the network yet, no choice made): ABR
    // stays off at the held height.
    if (this.#qualityChoice === null && this.#heldHeight !== null) {
      return createShakaConfiguration(source, runtime).abr as Record<
        string,
        unknown
      >;
    }
    // A start height only caps the first variant (see `startVideoHeight`).
    const abr = createShakaConfiguration(
      withoutStartVideoHeight(
        auto ? withoutPreferredVideoHeight(source) : source,
      ),
      runtime,
    ).abr as Record<string, unknown>;
    return { ...abr, enabled: auto };
  }

  /** The height the source is to play at: chosen, or held while on auto. */
  private targetVideoHeight(source: VideoSource): number | null {
    const chosen = shakaPreferredVideoHeight(source);
    if (chosen !== null) return chosen;
    return this.#qualityChoice === null ? this.#heldHeight : null;
  }

  /**
   * Releases a held height (see `holdVideoHeight`) the moment a video
   * segment comes from the network: the device no longer has what plays
   * next, so ABR chooses from here on, from at least the held variant.
   */
  private watchForHoldRelease(
    player: ShakaPlayerLike,
    source: VideoSource,
    runtime: ShakaRuntimeLike,
  ): void {
    const networkingEngine = player.getNetworkingEngine();
    const segmentType = runtime.net?.NetworkingEngine?.RequestType?.SEGMENT;
    if (!networkingEngine || typeof segmentType !== "number") return;
    const filter = (
      type: number,
      response: ShakaNetworkResponseLike,
      context?: ShakaRequestContextLike,
    ): void => {
      if (this.#holdReleaseFilter !== filter) return;
      if (type !== segmentType || response.fromCache) return;
      const streamType =
        context?.stream?.type ?? response.originalRequest?.contentType;
      if (streamType === "audio" || streamType === "text") return;
      this.releaseHold(player, source, runtime);
    };
    networkingEngine.registerResponseFilter(filter);
    this.#holdReleaseFilter = filter;
  }

  private stopWatchingForHoldRelease(): void {
    const filter = this.#holdReleaseFilter;
    if (!filter) return;
    this.#holdReleaseFilter = null;
    this.#player?.getNetworkingEngine()?.unregisterResponseFilter(filter);
  }

  private releaseHold(
    player: ShakaPlayerLike,
    source: VideoSource,
    runtime: ShakaRuntimeLike,
  ): void {
    const height = this.#heldHeight;
    this.stopWatchingForHoldRelease();
    if (height === null || this.#player !== player) return;
    this.#heldHeight = null;
    markPlayback("cached-height-released", { height });
    if (this.#qualityChoice !== null) return;
    const abr = this.abrConfiguration(source, runtime);
    player.configure({
      abr: { ...abr, ...this.startHeightBandwidthFloor(player, source, abr) },
    });
  }

  /** The variant to play for the height chosen for `source`, if any. */
  private preferredVariant(
    player: ShakaPlayerLike,
    source: VideoSource,
  ): ShakaVariantTrackLike | null {
    const height = this.targetVideoHeight(source);
    if (height === null) return null;
    return variantForHeight(
      variantsForSelectedAudio(
        player.getVariantTracks(),
        player.getAudioTracks(),
      ),
      height,
    );
  }

  /**
   * A player that has measured the connection (the one that played the
   * previous video) would let that measurement pick the first variant; with
   * a chosen quality the load starts at it instead. Shaka's `streaming`
   * event comes once the manifest is in, before the first variant is
   * picked. Returns the function that stops listening.
   */
  private startAtPreferredQuality(
    player: ShakaPlayerLike,
    source: VideoSource,
  ): () => void {
    if (this.targetVideoHeight(source) === null) return () => undefined;
    const onStreaming = (): void => {
      const variant = this.preferredVariant(player, source);
      if (variant) player.selectVariantTrack(variant);
    };
    player.addEventListener("streaming", onStreaming);
    return () => player.removeEventListener("streaming", onStreaming);
  }

  /**
   * A preload plays the quality it was made at; one made before the viewer
   * chose another moves to the chosen one (smoothly) once it plays.
   */
  private keepPreferredQuality(
    player: ShakaPlayerLike,
    source: VideoSource,
  ): void {
    if (this.#qualityChoice !== null || this.#player !== player) return;
    const variant = this.preferredVariant(player, source);
    if (!variant || variant.active) return;
    this.switchQualitySmoothly(player, variant);
    this.refreshTracks(false);
  }

  /**
   * Switches to `track` without a stall: what is buffered keeps playing up
   * to `qualitySwitchMargin` ahead, and the new quality's segments are
   * fetched from there while it plays and replace what lies beyond. Up, that
   * is the first segment start the new quality can reach in time. Down, the
   * better picture already buffered plays on for up to
   * `QUALITY_DOWN_SWITCH_KEEP_SECONDS` (all of it when there is less) while
   * the lower quality is fetched to follow. A 2s margin dropped the segments
   * the playhead was about to reach and left it waiting for the new
   * quality's first one: a buffering spinner on every switch.
   *
   * `upAtOnce` (a quality the viewer picked): a better quality replaces the
   * picture from where it is, the buffer dropped and its segment fetched
   * there, with the loader up for the moment that takes. Waiting for the
   * next segment start (6.3s apart on DASH lessons) kept the worse picture
   * for 3-7s, too long after asking for a better one.
   */
  private switchQualitySmoothly(
    player: ShakaPlayerLike,
    track: ShakaVariantTrackLike,
    options: { upAtOnce?: boolean } = {},
  ): void {
    const active = player.getVariantTracks().find((variant) => variant.active);
    const down = Boolean(active && isLowerQuality(track, active));
    if (options.upAtOnce && !down) {
      player.selectVariantTrack(track, true, 0);
      markPlayback("quality-switch", {
        height: track.height ?? null,
        atOnce: true,
      });
      return;
    }
    const margin = this.qualitySwitchMargin(player, track, active, down);
    if (margin === null) {
      player.selectVariantTrack(track, false);
    } else {
      player.selectVariantTrack(track, true, margin);
    }
  }

  /**
   * How far past the playhead a switch to `track` keeps the buffer. Shaka
   * cuts the buffer there but fetches the new quality from the start of the
   * segment holding the cut and appends it over what is there; the picture
   * changes at that segment's start. That start must lie at least the lead
   * ahead (the new quality's first segment arriving), or the frames being
   * decoded are replaced mid-group and the player waits (a spinner). Up,
   * the cut lies just past the first segment start beyond the lead, read
   * from the manifest; without one, a whole segment beyond the lead. Down,
   * at least `QUALITY_DOWN_SWITCH_KEEP_SECONDS`. Null when less than the
   * margin is buffered: the new quality then follows on from the end of it.
   */
  private qualitySwitchMargin(
    player: ShakaPlayerLike,
    track: ShakaVariantTrackLike,
    active: ShakaVariantTrackLike | undefined,
    down: boolean,
  ): number | null {
    const media = this.mediaElement;
    if (!media) return null;
    let stats: ReturnType<NonNullable<ShakaPlayerLike["getStats"]>> | undefined;
    try {
      stats = player.getStats?.();
    } catch {
      stats = undefined;
    }
    // What the downloads showed first; Shaka's estimate runs low, and with a
    // chosen quality it can still be the start value set to pick that
    // quality (above every link), which says nothing about this one.
    const estimate = stats?.estimatedBandwidth;
    const bandwidth =
      measuredSegmentBandwidth() ??
      (typeof estimate === "number" &&
      Number.isFinite(estimate) &&
      estimate > 0 &&
      estimate < PREFERRED_QUALITY_START_BANDWIDTH
        ? estimate
        : getShakaStartupBandwidthEstimate());
    const longest = stats?.maxSegmentDuration;
    const segmentSeconds =
      typeof longest === "number" && Number.isFinite(longest) && longest > 0
        ? longest
        : QUALITY_SWITCH_FALLBACK_SEGMENT_SECONDS;
    const downloadSeconds =
      ((track.bandwidth ?? 0) * segmentSeconds) / bandwidth;
    const lead = Math.min(
      QUALITY_SWITCH_MAX_LEAD_SECONDS,
      QUALITY_SWITCH_BASE_LEAD_SECONDS +
        downloadSeconds * QUALITY_SWITCH_DOWNLOAD_SAFETY,
    );
    const safeMargin =
      lead + segmentSeconds + QUALITY_SWITCH_SEGMENT_SLACK_SECONDS;
    const now = media.currentTime;
    const segmentStart = down
      ? null
      : nextSegmentStart(player, active, now + lead);
    const margin = down
      ? Math.max(QUALITY_DOWN_SWITCH_KEEP_SECONDS, safeMargin)
      : segmentStart === null
        ? safeMargin
        : segmentStart - now + QUALITY_SWITCH_PAST_SEGMENT_START_SECONDS;
    const ahead = bufferedAheadSeconds(media);
    markPlayback("quality-switch", {
      height: track.height ?? null,
      bandwidth,
      segmentSeconds,
      lead,
      segmentStart,
      margin,
      ahead,
    });
    return margin < ahead ? margin : null;
  }

  /**
   * A load into an element still holding another video (the lesson being
   * left, playing or paused) stops it at once and hides its picture until
   * the new video is in. Left alone it played on under the loader, or a
   * play asked for meanwhile started it again, until the new video had
   * loaded (up to seconds, waiting for a standby or a preload). A load
   * that switches to a ready standby swaps the elements in the same moment,
   * so nothing is seen of this.
   */
  private hideOutgoingVideo(media: HTMLMediaElement): void {
    if (media.readyState === 0 && !media.currentSrc) return;
    media.pause();
    if (this.#hiddenMedia !== media) this.revealVideo();
    this.#hiddenMedia = media;
    media.style.visibility = "hidden";
  }

  /** Shows the element `hideOutgoingVideo` hid, if any. */
  private revealVideo(): void {
    const media = this.#hiddenMedia;
    if (!media) return;
    this.#hiddenMedia = null;
    media.style.visibility = "";
  }

  private requirePlayer(): ShakaPlayerLike {
    this.assertNotDestroyed();
    if (!this.#player) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "SHAKA_NOT_INITIALIZED",
        message: "Attach a media element before loading with Shaka.",
      });
    }
    return this.#player;
  }

  private requireRuntime(): ShakaRuntimeLike {
    if (!this.#runtime) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "SHAKA_NOT_INITIALIZED",
        message: "The Shaka runtime has not been initialized.",
      });
    }
    return this.#runtime;
  }

  private async finishLoad(
    player: ShakaPlayerLike,
    source: VideoSource,
    generation: number,
  ): Promise<void> {
    this.refreshTracks(true);
    this.finishLoading(source);
    void this.addSourceTextTracks(player, source, generation);
  }

  /**
   * Subtitle files are fetched once the video is ready, so a slow or
   * missing file never holds back or fails playback; the captions menu
   * gains each track as it arrives.
   */
  private async addSourceTextTracks(
    player: ShakaPlayerLike,
    source: VideoSource,
    generation: number,
  ): Promise<void> {
    for (const track of source.textTracks ?? []) {
      if (!this.isCurrentOperation(generation)) return;
      try {
        await addExternalTextTrack(player, track);
      } catch {
        continue;
      }
      if (!this.isCurrentOperation(generation)) return;
      this.refreshTracks(true);
    }
  }

  /**
   * Gets a speculative preload (a hovered or next lesson) ready to show:
   * loaded into the hidden standby element, at its start position, with the
   * first frame decoded. A load of that lesson then only has to swap the two
   * elements (see switchToStandby): no teardown, no new media pipeline, no
   * black frame, no seek.
   */
  private async prepareStandby(
    session: EarlyShakaPreloadSession,
  ): Promise<void> {
    const standby = this.#standbyMedia;
    const player = session.player;
    const preloadPromise = session.preloadPromise;
    if (
      !standby ||
      !this.#player ||
      !this.mediaElement ||
      !player ||
      !preloadPromise ||
      session.consumed ||
      session.standby ||
      // The lesson already on screen needs no standby copy.
      this.getSnapshot().source?.src === session.manifestUrl
    ) {
      return;
    }

    let resolveReady: (ready: boolean) => void = () => undefined;
    const ready = new Promise<boolean>((resolve) => {
      resolveReady = resolve;
    });
    const prepared = { media: standby, ready, isReady: false };
    const settle = (isReady: boolean) => {
      prepared.isReady = isReady;
      resolveReady(isReady);
    };
    session.standby = prepared;
    markPlayback("standby-prepare");
    try {
      const manager = await preloadPromise;
      // The player last shown in this element must be gone first.
      await this.#standbyReleased;
      if (!manager || !this.isStandbyCurrent(session, standby)) {
        settle(false);
        return;
      }
      // The preload is spent here; nothing else may load it again.
      session.preloadPromise = null;
      player.configure({
        streaming: { bufferingGoal: STANDBY_BUFFERING_GOAL_SECONDS },
      });
      standby.muted = true;
      player.setVideoContainer?.(subtitleLayerFor(standby));
      await player.attach(standby);
      await player.load(manager, session.startTime ?? 0);
      if (!this.isStandbyCurrent(session, standby)) {
        settle(false);
        return;
      }
      const decoded = await waitForFirstFrame(
        standby,
        STANDBY_FIRST_FRAME_TIMEOUT_MS,
      );
      markPlayback(decoded ? "standby-ready" : "standby-not-ready");
      settle(decoded && this.isStandbyCurrent(session, standby));
    } catch {
      // A newer hover replaced it, or the browser refused; nothing to show.
      settle(false);
    }
  }

  /**
   * The standby never plays: it only holds the next video's first frame. A
   * page script reaching for "the" video element could otherwise start it
   * out of sight, and it would run on and drift from where it should start.
   */
  private readonly keepStandbyPaused = (event: Event): void => {
    const media = event.currentTarget;
    if (media instanceof HTMLMediaElement && media === this.#standbyMedia) {
      media.pause();
    }
  };

  private assignStandbyMedia(media: HTMLMediaElement | null): void {
    this.#standbyMedia?.removeEventListener("play", this.keepStandbyPaused);
    this.#standbyMedia = media;
    media?.addEventListener("play", this.keepStandbyPaused);
  }

  private isStandbyCurrent(
    session: EarlyShakaPreloadSession,
    standby: HTMLMediaElement,
  ): boolean {
    return (
      !session.consumed &&
      getEarlyShakaPreloadSession() === session &&
      this.#standbyMedia === standby
    );
  }

  /** Gives up a standby prepared in `media` (the element is going away). */
  private async dropStandbyPreparedIn(media: HTMLMediaElement): Promise<void> {
    const session = getEarlyShakaPreloadSession();
    if (session && !session.consumed && session.standby?.media === media) {
      await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    }
  }

  /**
   * The standby prepared for `source`, once its first frame is decoded
   * (waiting a moment for one still getting there), or null. A standby for
   * this source that did not get ready is dropped, so the load starts clean.
   */
  private async readyStandbyFor(
    source: VideoSource,
  ): Promise<EarlyShakaPreloadSession | null> {
    const session = getEarlyShakaPreloadSession();
    const standby = this.#standbyMedia;
    if (
      !session ||
      !standby ||
      session.consumed ||
      session.standby?.media !== standby ||
      !session.player ||
      session.player === this.#player ||
      !preloadSessionMatchesSource(session, source)
    ) {
      return null;
    }
    const ready = await Promise.race([
      session.standby.ready,
      delay(STANDBY_READY_WAIT_MS).then(() => false),
    ]);
    if (ready && this.isStandbyCurrent(session, standby)) return session;
    markPlayback("standby-not-used", { ready });
    if (getEarlyShakaPreloadSession() === session) {
      await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    }
    return null;
  }

  /**
   * Makes the standby the element on screen and its player this engine's;
   * the element that was playing becomes the standby. Synchronous, so the
   * swap lands in a single frame. The old player is destroyed afterwards,
   * out of sight, without holding up playback.
   */
  private switchToStandby(
    session: EarlyShakaPreloadSession,
    previousMedia: HTMLMediaElement,
  ): void {
    const player = session.player;
    const standby = session.standby?.media;
    if (!player || !standby) return;

    markPlayback("standby-switched");
    noteEarlyShakaPreloadAdopted(session);
    consumeEarlyShakaPreloadSession(session);
    this.#adoptedPreloadSession = null;

    const previous = this.#player;
    this.clearNetworkingFilters();
    if (previous) this.unbindShakaEvents(previous);
    this.#player = player;
    if (session.networkingFilters) {
      this.#requestFilter = session.networkingFilters.requestFilter;
      this.#responseFilter = session.networkingFilters.responseFilter;
    }
    this.bindShakaEvents(player);

    standby.volume = previousMedia.volume;
    standby.muted = previousMedia.muted;
    // The learner's speed, not the element's: during a stall Shaka holds
    // the element at 0, and the new lesson would start frozen at it.
    standby.playbackRate = this.getSnapshot().playbackRate;
    previousMedia.pause();
    this.assignStandbyMedia(previousMedia);
    this.replaceMediaElement(standby, previousMedia);
    // The element that was playing is the hidden standby now.
    this.revealVideo();
    this.#standbyReleased = previous
      ? previous.destroy().catch(() => undefined)
      : Promise.resolve();
  }

  /** The rest of a load switched to a standby: its settings and tracks. */
  private async completeStandbyLoad(
    session: EarlyShakaPreloadSession,
    source: VideoSource,
    options: VideoLoadOptions,
    runtime: ShakaRuntimeLike,
    generation: number,
  ): Promise<void> {
    const player = this.requirePlayer();
    if (!configureShakaPlayer(player, source, runtime, { reset: false })) {
      throw new VideoEngineError({
        category: "PLAYER",
        code: "INVALID_SHAKA_CONFIGURATION",
        message: "Shaka rejected the supplied playback configuration.",
      });
    }
    this.installNetworkingFilters(source);
    // The full buffer from here on (the standby kept only its start).
    player.configure({
      streaming: createShakaConfiguration(source, runtime).streaming,
    });
    this.keepPreferredQuality(player, source);
    if (shakaStartVideoHeight(source) !== null) {
      this.applyStreamingAfterFirstFrame(player, source, runtime);
    }

    // The learner's place moved since the standby was made: go there.
    const startTime = options.startTime ?? source.startTime;
    if (
      startTime !== undefined &&
      Math.abs((session.startTime ?? 0) - startTime) >
        PRELOAD_START_TOLERANCE_SECONDS
    ) {
      markPlayback("preload-start-mismatch", {
        preloaded: session.startTime ?? 0,
        requested: startTime,
      });
      this.requireMedia().currentTime = startTime;
    }

    await this.finishLoad(player, source, generation);
  }

  /**
   * A lesson hovered or about to come next may have been preloaded on its
   * own Shaka player while this engine kept playing. When this load is for
   * that lesson, the preloaded player (manifest and first segments already
   * fetched) replaces the current one on the media element.
   */
  private async adoptSpeculativePreloadSession(
    source: VideoSource,
    media: HTMLMediaElement,
  ): Promise<EarlyShakaPreloadSession | null> {
    if (this.#adoptedPreloadSession && !this.#adoptedPreloadSession.consumed) {
      return null;
    }
    const session = getEarlyShakaPreloadSession();
    const preloadedPlayer = session?.player;
    if (
      !session ||
      session.consumed ||
      // Loaded into a standby element: only switchToStandby can use it.
      session.standby ||
      !preloadedPlayer ||
      preloadedPlayer === this.#player ||
      !preloadSessionMatchesSource(session, source)
    ) {
      if (session && !session.consumed) {
        markPlayback("preload-not-adopted", {
          hasPlayer: Boolean(preloadedPlayer),
          samePlayer: preloadedPlayer === this.#player,
          matches: preloadSessionMatchesSource(session, source),
        });
      }
      return null;
    }

    // Claimed before any await, so a newer hover cannot abandon it mid-swap.
    markPlayback("preload-adopted-on-load");
    noteEarlyShakaPreloadAdopted(session);
    consumeEarlyShakaPreloadSession(session);
    this.#adoptedPreloadSession = null;
    const previous = this.#player;
    this.clearNetworkingFilters();
    if (previous) {
      this.unbindShakaEvents(previous);
      await previous.destroy().catch(() => undefined);
    }
    this.#player = preloadedPlayer;
    if (session.networkingFilters) {
      this.#requestFilter = session.networkingFilters.requestFilter;
      this.#responseFilter = session.networkingFilters.responseFilter;
    }
    this.bindShakaEvents(preloadedPlayer);
    try {
      preloadedPlayer.setVideoContainer?.(subtitleLayerFor(media));
      await preloadedPlayer.attach(media);
    } catch (error) {
      await discardEarlyShakaPreloadManager(session);
      throw error;
    }
    return session;
  }

  private takeMatchingPreloadSession(
    source: VideoSource,
  ): EarlyShakaPreloadSession | null {
    const session = this.#adoptedPreloadSession;
    if (!session || session.consumed) {
      this.#adoptedPreloadSession = null;
      const leftover = getEarlyShakaPreloadSession();
      if (leftover && leftover.player !== this.#player) {
        void abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      }
      return null;
    }

    if (!preloadSessionMatchesSource(session, source)) {
      consumeEarlyShakaPreloadSession(session);
      this.#adoptedPreloadSession = null;
      void discardEarlyShakaPreloadManager(session);
      return null;
    }

    consumeEarlyShakaPreloadSession(session);
    this.#adoptedPreloadSession = null;
    return session;
  }

  private async resolveLoadAsset(
    preloadSession: EarlyShakaPreloadSession | null,
    manifestUrl: string,
  ): Promise<string | ShakaPreloadManagerLike> {
    if (!preloadSession?.preloadPromise) {
      return manifestUrl;
    }

    let manager: ShakaPreloadManagerLike | null = null;
    try {
      manager = await preloadSession.preloadPromise;
    } catch {
      manager = null;
    }

    if (!manager) {
      return manifestUrl;
    }
    return manager;
  }

  private bindShakaEvents(player: ShakaPlayerLike): void {
    const listen = (type: string, listener: ShakaListener): void => {
      this.#shakaListeners.set(type, listener);
      player.addEventListener(type, listener);
    };

    listen("error", (event) => {
      const error = this.normalizeShakaError(
        event.detail,
        "SHAKA_ERROR",
        "UNKNOWN",
      );
      if (this.retryFailedStreaming(player, error)) return;
      // One Shaka got over by itself (another quality took over) is told to
      // whoever listens, but is not the player's error: shown as one, the
      // video played on under "Something went wrong" until it was paused.
      if (!error.fatal) {
        this.emit("error", { error });
        return;
      }
      this.emitError(error);
    });
    // A segment in again: the streams are healthy.
    listen("segmentappended", () => {
      this.#streamingRetries = 0;
    });
    listen("buffering", (event) => {
      this.setBuffering(Boolean(event.buffering));
    });
    listen("trackschanged", () => this.refreshTracks(true));
    listen("audiotrackschanged", () => this.refreshTracks(true));
    listen("audiotrackchanged", () => this.refreshTracks(true));
    listen("textchanged", () => this.refreshTracks(true));
    listen("texttrackvisibilitychanged", () => this.refreshTracks(true));
    listen("adaptation", () => {
      rememberShakaBandwidthEstimate(player);
      this.refreshTracks(false);
      const active =
        this.getQualities().find((quality) => quality.active) ?? null;
      this.emit("qualitychange", { quality: active, auto: true });
    });
    listen("variantchanged", () => {
      this.refreshTracks(false);
      const active =
        this.getQualities().find((quality) => quality.active) ?? null;
      this.emit("qualitychange", { quality: active, auto: this.#autoQuality });
    });
    listen("abrstatuschanged", (event) => {
      if (typeof event.newStatus === "boolean") {
        this.#autoQuality = event.newStatus;
        this.setTrackState({ autoQuality: event.newStatus });
      }
    });
    listen("manifestupdated", () => {
      this.refreshTracks(true);
      this.emit("manifestupdated", undefined);
    });
  }

  /**
   * Asks Shaka to stream again after a segment could not be downloaded
   * (see `STREAMING_RETRY_LIMIT`), waiting longer each time. True when it
   * will: the error is then not the player's, and the loader shows while
   * playback waits for the segment.
   */
  private retryFailedStreaming(
    player: ShakaPlayerLike,
    error: VideoEngineError,
  ): boolean {
    if (
      !error.fatal ||
      error.category !== "NETWORK" ||
      this.#player !== player ||
      this.getSnapshot().lifecycle !== "ready" ||
      this.#streamingRetries >= STREAMING_RETRY_LIMIT ||
      !player.retryStreaming
    ) {
      return false;
    }
    const delay = Math.min(
      STREAMING_RETRY_MAX_DELAY_SECONDS,
      STREAMING_RETRY_FIRST_DELAY_SECONDS * 2 ** this.#streamingRetries,
    );
    if (!player.retryStreaming(delay)) return false;
    this.#streamingRetries += 1;
    markPlayback("streaming-retry", {
      attempt: this.#streamingRetries,
      delay,
      code: error.code,
    });
    return true;
  }

  private unbindShakaEvents(player: ShakaPlayerLike): void {
    for (const [type, listener] of this.#shakaListeners) {
      player.removeEventListener(type, listener);
    }
    this.#shakaListeners.clear();
  }

  private refreshTracks(emitChange: boolean): void {
    const player = this.#player;
    if (!player) {
      return;
    }

    this.clearTrackMaps();
    const qualities: VideoQuality[] = [];
    const audioTrackCandidates = player.getAudioTracks();
    for (const track of variantsForSelectedAudio(
      player.getVariantTracks(),
      audioTrackCandidates,
    )) {
      const normalized = normalizeShakaQuality(track);
      qualities.push(normalized);
      this.#qualityTracks.set(normalized.id, track);
    }

    const audioTracks: VideoAudioTrack[] = [];
    for (const [index, track] of audioTrackCandidates.entries()) {
      const normalized = normalizeShakaAudioTrack(track, index);
      audioTracks.push(normalized);
      this.#audioTracks.set(normalized.id, track);
    }

    const isVisible = player.isTextTrackVisible
      ? player.isTextTrackVisible()
      : Boolean(this.#selectedTextTrackId);

    const textTracks: VideoTextTrack[] = [];
    for (const track of player.getTextTracks()) {
      const normalized = normalizeShakaTextTrack(track);
      if (!isVisible) {
        normalized.active = false;
      } else if (this.#selectedTextTrackId) {
        normalized.active = normalized.id === this.#selectedTextTrackId;
      }
      textTracks.push(normalized);
      this.#textTracks.set(normalized.id, track);
    }

    const activeQuality = qualities.find((track) => track.active) ?? null;
    const activeAudio = audioTracks.find((track) => track.active) ?? null;
    const activeText = isVisible
      ? (textTracks.find((track) => track.id === this.#selectedTextTrackId) ??
        textTracks.find((track) => track.active) ??
        null)
      : null;

    this.setTrackState({
      qualities,
      audioTracks,
      textTracks,
      autoQuality: this.#autoQuality,
      selectedQualityId: activeQuality?.id ?? null,
      selectedAudioTrackId: activeAudio?.id ?? null,
      selectedTextTrackId: activeText?.id ?? null,
    });

    if (emitChange) {
      this.emit("qualitieschange", {
        qualities: this.getQualities(),
        auto: this.#autoQuality,
      });
      this.emit("trackschanged", {
        qualities: this.getQualities(),
        audioTracks: this.getAudioTracks(),
        textTracks: this.getTextTracks(),
      });
    }
  }

  private clearTrackMaps(): void {
    this.#qualityTracks.clear();
    this.#audioTracks.clear();
    this.#textTracks.clear();
  }

  private installNetworkingFilters(source: VideoSource): void {
    const player = this.requirePlayer();
    const runtime = this.requireRuntime();
    const filters = createShakaNetworkingFilters(source, runtime);
    registerShakaNetworkingFilters(player, filters);
    this.#requestFilter = filters.requestFilter;
    this.#responseFilter = filters.responseFilter;
    if (this.#heldHeight !== null && this.#qualityChoice === null) {
      this.watchForHoldRelease(player, source, runtime);
    }
  }

  private clearNetworkingFilters(): void {
    this.stopWatchingForHoldRelease();
    unregisterShakaNetworkingFilters(this.#player, {
      requestFilter: this.#requestFilter,
      responseFilter: this.#responseFilter,
    });
    this.#requestFilter = null;
    this.#responseFilter = null;
  }

  private normalizeShakaError(
    error: unknown,
    fallbackCode: string,
    fallbackCategory: import("../../core/types").VideoEngineErrorCategory,
  ): VideoEngineError {
    if (error instanceof VideoEngineError) {
      return error;
    }

    const shakaError = error as ShakaErrorLike | null;
    if (!shakaError || typeof shakaError !== "object") {
      return normalizeUnknownError(error, {
        category: fallbackCategory,
        code: fallbackCode,
      });
    }

    const categories = this.#runtime?.util?.Error?.Category;
    const categoryEntries: Array<
      [string, import("../../core/types").VideoEngineErrorCategory]
    > = [
      ["NETWORK", "NETWORK"],
      ["TEXT", "TEXT"],
      ["MEDIA", "MEDIA"],
      ["MANIFEST", "MANIFEST"],
      ["STREAMING", "STREAMING"],
      ["DRM", "DRM"],
      ["PLAYER", "PLAYER"],
    ];
    const category =
      categoryEntries.find(
        ([name]) => categories?.[name] === shakaError.category,
      )?.[1] ?? fallbackCategory;
    const critical = this.#runtime?.util?.Error?.Severity?.CRITICAL;
    const recoverable = this.#runtime?.util?.Error?.Severity?.RECOVERABLE;
    const isRecoverable =
      recoverable !== undefined && shakaError.severity === recoverable;
    const isFatal =
      critical !== undefined
        ? shakaError.severity === critical
        : !isRecoverable;

    return new VideoEngineError({
      category,
      code:
        shakaError.code === undefined
          ? fallbackCode
          : `SHAKA_${String(shakaError.code)}`,
      message:
        shakaError.message ||
        `Shaka Player failed with code ${String(shakaError.code ?? fallbackCode)}.`,
      fatal: isFatal,
      recoverable: isRecoverable,
      details: shakaError.data ?? [],
      cause: error,
    });
  }
}
