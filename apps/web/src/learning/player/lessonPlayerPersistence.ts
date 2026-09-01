const PLAYER_MUTED_STORAGE_KEY = "veolms-player-muted";
const PLAYER_AMBIENT_STORAGE_KEY = "veolms-player-ambient";
const PLAYER_AUTOPLAY_STORAGE_KEY = "veolms-player-autoplay";
const PLAYER_PLAYBACK_RATE_STORAGE_KEY = "veolms-player-playback-rate";
const PLAYER_MINI_RESTORE_STORAGE_KEY = "veolms-player-mini-restore";

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

interface StorageMutator extends StorageReader, StorageWriter {
  removeItem(key: string): void;
}

const getBrowserStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getSessionStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

export const lessonPlayerStorageKeys = {
  ambient: PLAYER_AMBIENT_STORAGE_KEY,
  autoplay: PLAYER_AUTOPLAY_STORAGE_KEY,
  muted: PLAYER_MUTED_STORAGE_KEY,
  playbackRate: PLAYER_PLAYBACK_RATE_STORAGE_KEY,
  resume: (mediaKey: string) => `veolms-watch-${mediaKey}`,
} as const;

export function readAutoplayPreference(
  storage: StorageReader | null = getBrowserStorage(),
): boolean {
  if (!storage) return true;
  try {
    const value = storage.getItem(PLAYER_AUTOPLAY_STORAGE_KEY);
    return value === null ? true : value === "on" || value === "true";
  } catch {
    return true;
  }
}

export function readMutedPreference(
  storage: StorageReader | null = getBrowserStorage(),
): boolean {
  if (!storage) return false;
  try {
    const value = storage.getItem(PLAYER_MUTED_STORAGE_KEY);
    return value === "true" || value === "on";
  } catch {
    return false;
  }
}

export function readPlaybackRatePreference(
  storage: StorageReader | null = getBrowserStorage(),
): number {
  if (!storage) return 1;
  try {
    const value = Number(storage.getItem(PLAYER_PLAYBACK_RATE_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

export function readAmbientPreference(
  storage: StorageReader | null = getBrowserStorage(),
  constrainedDevice = typeof window !== "undefined" &&
    Boolean(
      window.matchMedia?.("(prefers-reduced-motion: reduce), (pointer: coarse)")
        .matches,
    ),
): boolean {
  try {
    const value = storage?.getItem(PLAYER_AMBIENT_STORAGE_KEY);
    if (value === "on") return true;
    if (value === "off") return false;
  } catch {
    // A device-sensitive default still works when storage is unavailable.
  }
  return !constrainedDevice;
}

export function readResumePosition(
  mediaKey: string,
  duration?: number,
  storage: StorageReader | null = getBrowserStorage(),
): number {
  if (!storage) return 0;
  try {
    const savedPosition = Number(
      storage.getItem(lessonPlayerStorageKeys.resume(mediaKey)),
    );
    if (!Number.isFinite(savedPosition) || savedPosition <= 0) return 0;
    if (duration === undefined || !Number.isFinite(duration) || duration <= 0) {
      return savedPosition;
    }
    return Math.min(savedPosition, Math.max(0, duration - 1));
  } catch {
    return 0;
  }
}

export function writeMutedPreference(
  muted: boolean,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(PLAYER_MUTED_STORAGE_KEY, String(muted));
  } catch {
    // Playback remains available when browser storage is unavailable.
  }
}

export function writePlaybackRatePreference(
  playbackRate: number,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  if (!Number.isFinite(playbackRate) || playbackRate <= 0) return;
  try {
    storage?.setItem(PLAYER_PLAYBACK_RATE_STORAGE_KEY, String(playbackRate));
  } catch {
    // Playback remains usable when browser storage is unavailable.
  }
}

export function writeAmbientPreference(
  enabled: boolean,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(PLAYER_AMBIENT_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Ambient mode remains usable for the current session.
  }
}

export function writeAutoplayPreference(
  enabled: boolean,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  try {
    storage?.setItem(PLAYER_AUTOPLAY_STORAGE_KEY, enabled ? "on" : "off");
  } catch {
    // Autoplay remains usable for the current session.
  }
}

export function writeMiniPlayerRestore(
  mediaKey: string,
  autoplay: boolean,
  storage: StorageWriter | null = getSessionStorage(),
): void {
  try {
    storage?.setItem(
      PLAYER_MINI_RESTORE_STORAGE_KEY,
      JSON.stringify({ autoplay, mediaKey }),
    );
  } catch {
    // Restoring the lesson still works even if playback cannot resume itself.
  }
}

export function consumeMiniPlayerRestore(
  mediaKey: string,
  storage: StorageMutator | null = getSessionStorage(),
): boolean | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(PLAYER_MINI_RESTORE_STORAGE_KEY);
    if (!value) return null;
    const restore = JSON.parse(value) as {
      autoplay?: unknown;
      mediaKey?: unknown;
    };
    if (restore.mediaKey !== mediaKey) return null;
    storage.removeItem(PLAYER_MINI_RESTORE_STORAGE_KEY);
    return restore.autoplay === true;
  } catch {
    storage.removeItem(PLAYER_MINI_RESTORE_STORAGE_KEY);
    return null;
  }
}

export function writeResumePosition(
  mediaKey: string,
  position: number,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  if (!Number.isFinite(position) || position <= 0) return;
  try {
    storage?.setItem(
      lessonPlayerStorageKeys.resume(mediaKey),
      String(position),
    );
  } catch {
    // Resume persistence is optional and must never interrupt playback.
  }
}
