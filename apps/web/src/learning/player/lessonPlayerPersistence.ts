const PLAYER_MUTED_STORAGE_KEY = "veolms-player-muted";
const PLAYER_AMBIENT_STORAGE_KEY = "veolms-player-ambient";

interface StorageReader {
  getItem(key: string): string | null;
}

interface StorageWriter {
  setItem(key: string, value: string): void;
}

const getBrowserStorage = (): Storage | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

export const lessonPlayerStorageKeys = {
  ambient: PLAYER_AMBIENT_STORAGE_KEY,
  muted: PLAYER_MUTED_STORAGE_KEY,
  resume: (mediaKey: string) => `veolms-watch-${mediaKey}`,
} as const;

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
