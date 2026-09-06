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
  waitForEarlyShakaPreloadSession,
  type EarlyShakaPreloadSession,
} from "./shaka-early-preload";
import {
  addExternalTextTrack,
  configureShakaPlayer,
  createShakaNetworkingFilters,
  defaultShakaRuntimeLoader,
  normalizeShakaAudioTrack,
  normalizeShakaQuality,
  normalizeShakaTextTrack,
  registerShakaNetworkingFilters,
  resolveShakaLoadMimeType,
  resolveShakaRuntime,
  unregisterShakaNetworkingFilters,
} from "./shaka-internal";
import type {
  ShakaAudioTrackLike,
  ShakaErrorLike,
  ShakaEventLike,
  ShakaPlayerLike,
  ShakaPreloadManagerLike,
  ShakaRuntimeLike,
  ShakaRuntimeLoader,
  ShakaTextTrackLike,
  ShakaVariantTrackLike,
} from "./shaka-internal";

export interface ShakaVideoEngineOptions {
  runtimeLoader?: () => Promise<unknown>;
}

type ShakaListener = (event: ShakaEventLike) => void;

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
    ? variants.filter((variant) => variantMatchesAudioTrack(variant, activeAudio))
    : [...variants];
  const candidates = matching.length > 0 ? matching : [...variants];
  const byVisualQuality = new Map<string, ShakaVariantTrackLike>();

  for (const candidate of candidates) {
    const key = visualQualityKey(candidate);
    const current = byVisualQuality.get(key);
    if (
      !current ||
      candidate.active ||
      (!current.active &&
        (candidate.bandwidth ?? 0) > (current.bandwidth ?? 0))
    ) {
      byVisualQuality.set(key, candidate);
    }
  }

  return [...byVisualQuality.values()];
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
  #requestFilter: ReturnType<typeof createShakaNetworkingFilters>["requestFilter"] =
    null;
  #responseFilter: ReturnType<
    typeof createShakaNetworkingFilters
  >["responseFilter"] = null;
  #adoptedPreloadSession: EarlyShakaPreloadSession | null = null;
  #autoQuality = true;
  #browserSupported: boolean | null = null;

  constructor(options: ShakaVideoEngineOptions = {}) {
    super();
    this.#runtimeLoader = options.runtimeLoader ?? defaultShakaRuntimeLoader;
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

  async load(source: VideoSource, options: VideoLoadOptions = {}): Promise<void> {
    this.requireMedia();
    const player = this.requirePlayer();
    const runtime = this.requireRuntime();
    const generation = this.beginOperation();
    this.startLoading(source);
    this.#autoQuality = source.streaming?.abrEnabled ?? true;

    try {
      this.clearNetworkingFilters();
      const preloadSession = this.takeMatchingPreloadSession(source.src);
      if (
        !configureShakaPlayer(player, source, runtime, {
          reset: !preloadSession,
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
      } else {
        await player.load(asset, startTime, mimeType);
      }

      if (!this.isCurrentOperation(generation)) {
        return;
      }

      for (const track of source.textTracks ?? []) {
        await addExternalTextTrack(player, track);
        if (!this.isCurrentOperation(generation)) {
          return;
        }
      }

      this.refreshTracks(true);
      this.finishLoading(source);
    } catch (error) {
      if (!this.isCurrentOperation(generation)) {
        return;
      }

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

  async unload(): Promise<void> {
    this.requireMedia();
    const player = this.requirePlayer();
    const generation = this.beginOperation();
    this.updateSnapshot({ lifecycle: "unloading" });
    this.clearNetworkingFilters();

    try {
      await player.unload();
      if (!this.isCurrentOperation(generation)) {
        return;
      }
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
    player.selectVariantTrack(track, false);
    this.#autoQuality = false;
    this.refreshTracks(false);
    const quality = this.getQualities().find((item) => item.id === id) ?? null;
    this.setTrackState({ autoQuality: false, selectedQualityId: id });
    this.emit("qualitychange", { quality, auto: false });
  }

  override enableAutoQuality(): void {
    const player = this.requirePlayer();
    player.configure({ abr: { enabled: true } });
    this.#autoQuality = true;
    this.refreshTracks(false);
    const active = this.getQualities().find((quality) => quality.active) ?? null;
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
    const selected = this.getAudioTracks().find((item) => item.id === id) ?? null;
    this.setTrackState({ selectedAudioTrackId: id });
    this.emit("audiotrackchange", { track: selected });
  }

  override selectTextTrack(id: string | null): void {
    const player = this.requirePlayer();
    if (id === null) {
      player.selectTextTrack(null);
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

    player.selectTextTrack(track);
    this.refreshTracks(false);
    const selected = this.getTextTracks().find((item) => item.id === id) ?? null;
    this.setTrackState({ selectedTextTrackId: id });
    this.emit("texttrackchange", { track: selected });
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

    if (!this.#player && preloadSession?.player) {
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
    await this.#player.attach(media);
  }

  protected override async onDetaching(
    _media: HTMLMediaElement,
  ): Promise<void> {
    this.clearNetworkingFilters();
    this.clearTrackMaps();
    await this.#player?.detach();
  }

  protected override async onDestroying(
    _media: HTMLMediaElement | null,
  ): Promise<void> {
    this.clearNetworkingFilters();
    const player = this.#player;
    const adoptedSession = this.#adoptedPreloadSession;
    this.#adoptedPreloadSession = null;
    if (adoptedSession && !adoptedSession.consumed) {
      consumeEarlyShakaPreloadSession(adoptedSession);
      await discardEarlyShakaPreloadManager(adoptedSession);
    } else if (!adoptedSession && getEarlyShakaPreloadSession()) {
      await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    }
    if (player) {
      this.unbindShakaEvents(player);
      await player.destroy();
    }
    this.#player = null;
    this.#runtime = null;
    this.clearTrackMaps();
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

  private takeMatchingPreloadSession(
    manifestUrl: string,
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

    if (session.manifestUrl !== manifestUrl) {
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
      this.emitError(error, error.fatal);
    });
    listen("buffering", (event) => {
      this.setBuffering(Boolean(event.buffering));
    });
    listen("trackschanged", () => this.refreshTracks(true));
    listen("audiotrackschanged", () => this.refreshTracks(true));
    listen("audiotrackchanged", () => this.refreshTracks(true));
    listen("textchanged", () => this.refreshTracks(true));
    listen("adaptation", () => {
      this.refreshTracks(false);
      const active = this.getQualities().find((quality) => quality.active) ?? null;
      this.emit("qualitychange", { quality: active, auto: true });
    });
    listen("variantchanged", () => {
      this.refreshTracks(false);
      const active = this.getQualities().find((quality) => quality.active) ?? null;
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

    const textTracks: VideoTextTrack[] = [];
    for (const track of player.getTextTracks()) {
      const normalized = normalizeShakaTextTrack(track);
      textTracks.push(normalized);
      this.#textTracks.set(normalized.id, track);
    }

    const activeQuality = qualities.find((track) => track.active) ?? null;
    const activeAudio = audioTracks.find((track) => track.active) ?? null;
    const activeText = textTracks.find((track) => track.active) ?? null;
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
  }

  private clearNetworkingFilters(): void {
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
