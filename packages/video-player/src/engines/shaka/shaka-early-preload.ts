import type { VideoSource } from "../../core/types";
import {
  configureShakaPlayer,
  createShakaNetworkingFilters,
  defaultShakaRuntimeLoader,
  registerShakaNetworkingFilters,
  resolveShakaLoadMimeType,
  resolveShakaRuntime,
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
  player: ShakaPlayerLike | null;
  preloadPromise: Promise<ShakaPreloadManagerLike | null> | null;
  consumed: boolean;
  ready: Promise<void>;
  networkingFilters?: ShakaNetworkingFilters;
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
  options: { runtimeLoader?: () => Promise<unknown> } = {},
): Promise<EarlyShakaPreloadSession | null> {
  if (typeof document === "undefined") {
    return null;
  }

  const store = preloadGlobal();
  let existing = getEarlyShakaPreloadSession();
  if (existing?.consumed) {
    existing = null;
  }
  if (existing?.player && existing.manifestUrl === source.src) {
    settleEarlySession();
    return existing;
  }
  if (existing?.player && existing.manifestUrl !== source.src) {
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
      player: null,
      preloadPromise: null,
      consumed: false,
      ready,
    };
  }
  session.manifestUrl = source.src;
  store[EARLY_SHAKA_PRELOAD_GLOBAL_KEY] = session;

  try {
    const runtime: ShakaRuntimeLike = resolveShakaRuntime(
      await (options.runtimeLoader ?? defaultShakaRuntimeLoader)(),
    );
    runtime.polyfill.installAll();
    if (!runtime.Player.isBrowserSupported()) {
      await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
      return null;
    }

    const player = new runtime.Player();
    if (!configureShakaPlayer(player, source, runtime)) {
      await player.destroy();
      throw new Error("Shaka rejected the supplied playback configuration.");
    }

    const networkingFilters = createShakaNetworkingFilters(source, runtime);
    registerShakaNetworkingFilters(player, networkingFilters);

    session.player = player;
    session.networkingFilters = networkingFilters;
    session.preloadPromise = startPreload(player, source).catch(() => null);
    settleEarlySession();
    return session;
  } catch (error) {
    settleEarlySession(error);
    await abandonEarlyShakaPreloadSession({ destroyPlayer: true });
    return null;
  }
}
