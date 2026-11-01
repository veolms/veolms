import type { VideoSource } from "../../core/types";
import {
  configureShakaPlayer,
  createShakaNetworkingFilters,
  defaultShakaRuntimeLoader,
  registerShakaNetworkingFilters,
  resolveShakaLoadMimeType,
  resolveShakaRuntime,
  shakaDrmServers,
  unregisterShakaNetworkingFilters,
  type ShakaNetworkingFilters,
  type ShakaPlayerLike,
  type ShakaPreloadManagerLike,
  type ShakaRuntimeLike,
} from "./shaka-internal";

export const EARLY_SHAKA_PRELOAD_GLOBAL_KEY = "__VEO_SHAKA_PRELOAD__";
const EARLY_SHAKA_PRELOAD_SETTLE_KEY = "__VEO_SHAKA_PRELOAD_SETTLE__";

export interface EarlyShakaPreloadSession {
  manifestUrl: string;
  mediaKey?: string;
  player: ShakaPlayerLike | null;
  preloadPromise: Promise<ShakaPreloadManagerLike | null> | null;
  consumed: boolean;
  ready: Promise<void>;
  networkingFilters?: ShakaNetworkingFilters;
  /**
   * Started ahead of a likely click (a hovered or next lesson) rather than
   * for the page being opened; a player being torn down leaves it alone.
   */
  speculative?: boolean;
  /** The position (seconds) the preload was made for. */
  startTime?: number;
  /** The licence servers the preload was made with (`shakaDrmServers`). */
  drmServers?: string;
  /**
   * Set when a playing engine loaded this preload into its hidden standby
   * element: `ready` settles true once the first frame is decoded there,
   * false when that did not work out.
   */
  standby?: {
    media: HTMLMediaElement;
    ready: Promise<boolean>;
    /** True from the moment `ready` settles true. */
    isReady: boolean;
  };
}

/**
 * Whether a standby with its first frame decoded is waiting for `src`: the
 * player then switches to it at once, so nothing (a poster) needs to cover
 * the change of video.
 */
export function isEarlyShakaStandbyReady(
  source: Pick<VideoSource, "src" | "id">,
): boolean {
  const session = getEarlyShakaPreloadSession();
  if (!session || session.consumed || !session.standby?.isReady) return false;
  return (
    session.manifestUrl === source.src ||
    Boolean(session.mediaKey && source.id && session.mediaKey === source.id)
  );
}

type SpeculativePreloadListener = (session: EarlyShakaPreloadSession) => void;
const speculativePreloadListeners = new Set<SpeculativePreloadListener>();

/**
 * Called with each speculative preload (a hovered or next lesson) once its
 * player has started preloading, so an engine with a standby element can
 * get it ready to show. Returns the unsubscribe function.
 */
export function onSpeculativeShakaPreload(
  listener: SpeculativePreloadListener,
): () => void {
  speculativePreloadListeners.add(listener);
  return () => speculativePreloadListeners.delete(listener);
}

interface EarlyShakaPreloadSettle {
  resolve: () => void;
  reject: (reason: unknown) => void;
}

interface EarlyShakaPreloadGlobal {
  [EARLY_SHAKA_PRELOAD_GLOBAL_KEY]?: EarlyShakaPreloadSession;
  [EARLY_SHAKA_PRELOAD_SETTLE_KEY]?: EarlyShakaPreloadSettle;
}

function preloadGlobal(): EarlyShakaPreloadGlobal {
  return globalThis as EarlyShakaPreloadGlobal;
}

export function getEarlyShakaPreloadSession(): EarlyShakaPreloadSession | null {
  return preloadGlobal()[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] ?? null;
}

export function setEarlyShakaPreloadSessionForTests(
  session: EarlyShakaPreloadSession | null,
): void {
  const store = preloadGlobal();
  if (session) {
    store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] = session;
    return;
  }
  delete store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY];
  delete store[EARLY_SHAKA_PRELOAD_SETTLE_KEY];
}

function settleEarlySession(error?: unknown): void {
  const store = preloadGlobal();
  const settle = store[EARLY_SHAKA_PRELOAD_SETTLE_KEY];
  delete store[EARLY_SHAKA_PRELOAD_SETTLE_KEY];
  if (!settle) {
    return;
  }
  if (error === undefined) {
    settle.resolve();
    return;
  }
  settle.reject(error);
}

async function destroyPreloadManager(
  preloadPromise: Promise<ShakaPreloadManagerLike | null> | null,
): Promise<void> {
  if (!preloadPromise) {
    return;
  }
  try {
    const manager = await preloadPromise;
    await manager?.destroy();
  } catch {
    // Preload failure is abandoned; playback falls back independently.
  }
}

export async function abandonEarlyShakaPreloadSession(
  options: { destroyPlayer?: boolean } = {},
): Promise<void> {
  const session = getEarlyShakaPreloadSession();
  if (!session || session.consumed) {
    return;
  }

  session.consumed = true;
  const player = session.player;
  const filters = session.networkingFilters ?? {
    requestFilter: null,
    responseFilter: null,
  };
  unregisterShakaNetworkingFilters(player, filters);
  await destroyPreloadManager(session.preloadPromise);

  if (options.destroyPlayer !== false && player) {
    try {
      await player.destroy();
    } catch {
      // The unused early player should not block the fallback load path.
    }
  }

  const store = preloadGlobal();
  if (store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] === session) {
    delete store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY];
  }
  settleEarlySession();
}

export async function discardEarlyShakaPreloadManager(
  session: EarlyShakaPreloadSession,
): Promise<void> {
  const preloadPromise = session.preloadPromise;
  session.preloadPromise = null;
  await destroyPreloadManager(preloadPromise);
}

export function consumeEarlyShakaPreloadSession(
  session: EarlyShakaPreloadSession,
): void {
  session.consumed = true;
  const store = preloadGlobal();
  if (store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] === session) {
    delete store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY];
  }
}

/** The manifest of the preload a player most recently took over. */
let lastAdoptedManifestUrl: string | null = null;

/**
 * Called by a player that took over a preload session. The page opening
 * that lesson may ask for its preload a moment later; it is already playing,
 * so no second player is started for it.
 */
export function noteEarlyShakaPreloadAdopted(
  session: EarlyShakaPreloadSession,
): void {
  lastAdoptedManifestUrl = session.manifestUrl;
}

/**
 * Called by a player starting to load `manifestUrl` without a preload. The
 * page's own preload of that video can arrive a moment later; it is already
 * loading, so that preload is not started. Left running, it would also hold
 * the single preload slot, and no hovered or next lesson could be prepared.
 */
export function noteShakaSourceLoading(manifestUrl: string): void {
  lastAdoptedManifestUrl = manifestUrl;
}

export async function waitForEarlyShakaPreloadSession(): Promise<EarlyShakaPreloadSession | null> {
  const session = getEarlyShakaPreloadSession();
  if (!session || session.consumed) {
    return null;
  }

  try {
    await session.ready;
  } catch {
    await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    return null;
  }

  const current = getEarlyShakaPreloadSession();
  if (!current || current.consumed || !current.player) {
    return null;
  }
  return current;
}

function startPreload(
  player: ShakaPlayerLike,
  source: VideoSource,
): Promise<ShakaPreloadManagerLike | null> {
  if (typeof player.preload !== "function") {
    return Promise.resolve(null);
  }

  return player.preload(
    source.src,
    source.startTime ?? 0,
    resolveShakaLoadMimeType(source) ?? null,
  );
}

export async function startEarlyShakaPreload(
  source: VideoSource,
  options: {
    runtimeLoader?: () => Promise<unknown>;
    /** A hovered or next lesson, not the page being opened. */
    speculative?: boolean;
  } = {},
): Promise<EarlyShakaPreloadSession | null> {
  if (typeof document === "undefined") {
    return null;
  }

  const store = preloadGlobal();
  let existing = getEarlyShakaPreloadSession();
  if (existing?.consumed) {
    existing = null;
  }
  const existingMatches =
    existing &&
    existing.manifestUrl === source.src &&
    (!existing.mediaKey || !source.id || existing.mediaKey === source.id);
  if (existingMatches && existing?.player) {
    existing!.mediaKey = source.id;
    // The page now opening this lesson owns the preload from here on.
    if (!options.speculative) existing!.speculative = false;
    settleEarlySession();
    return existing;
  }
  if (!existing && source.src === lastAdoptedManifestUrl) {
    // Already being played by the player that adopted its preload.
    return null;
  }
  if (existing && !existingMatches) {
    await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    existing = getEarlyShakaPreloadSession();
  }

  let session = existing;
  if (!session) {
    const ready = new Promise<void>((resolve, reject) => {
      store[EARLY_SHAKA_PRELOAD_SETTLE_KEY] = { resolve, reject };
    });
    session = {
      manifestUrl: source.src,
      mediaKey: source.id,
      player: null,
      preloadPromise: null,
      consumed: false,
      ready,
    };
  }
  session.speculative = Boolean(options.speculative);
  session.manifestUrl = source.src;
  session.mediaKey = source.id;
  store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] = session;

  try {
    const runtime: ShakaRuntimeLike = resolveShakaRuntime(
      await (options.runtimeLoader ?? defaultShakaRuntimeLoader)(),
    );
    runtime.polyfill.installAll();
    if (!runtime.Player.isBrowserSupported()) {
      if (store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] !== session) return null;
      await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      return null;
    }

    const player = new runtime.Player();
    if (!configureShakaPlayer(player, source, runtime)) {
      await player.destroy();
      throw new Error("Shaka rejected the supplied playback configuration.");
    }

    const networkingFilters = createShakaNetworkingFilters(source, runtime);

    // A newer lesson may have replaced this session while the Shaka runtime
    // was loading. Never let the stale player take ownership of the global
    // handoff or keep downloading the previous lesson.
    if (
      store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] !== session ||
      session.consumed ||
      session.manifestUrl !== source.src ||
      (session.mediaKey && source.id && session.mediaKey !== source.id)
    ) {
      await player.destroy();
      return null;
    }

    registerShakaNetworkingFilters(player, networkingFilters);
    session.player = player;
    session.networkingFilters = networkingFilters;
    session.startTime = source.startTime ?? 0;
    // Read just before the preload copies the configuration it will keep.
    session.drmServers = shakaDrmServers(player);
    session.preloadPromise = startPreload(player, source).catch(() => null);
    settleEarlySession();
    if (session.speculative) {
      for (const listener of speculativePreloadListeners) listener(session);
    }
    return session;
  } catch (error) {
    if (store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] !== session) return null;
    settleEarlySession(error);
    await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    return null;
  }
}
