import {
  noteLessonPosition,
  parseLessonMediaKey,
} from "../lessonPositionOutbox";

const PLAYER_MUTED_STORAGE_KEY = "veolms-player-muted";
const PLAYER_AMBIENT_STORAGE_KEY = "veolms-player-ambient";
const PLAYER_AUTOPLAY_STORAGE_KEY = "veolms-player-autoplay";
const PLAYER_PLAYBACK_RATE_STORAGE_KEY = "veolms-player-playback-rate";
const PLAYER_VOLUME_STORAGE_KEY = "veolms-player-volume";
/**
 * Where a tab announces a volume change made in it, for the other tabs to
 * follow. Kept apart from the saved volume above: pages from before this
 * key wrote that one back and forth between themselves without end (see
 * `remoteVolumesRef` in LessonVideoPlayer), and a tab that followed it was
 * moved by them; this one only a change made by a viewer writes.
 */
const PLAYER_VOLUME_CHANGE_STORAGE_KEY = "veolms-player-volume-change";
const PLAYER_MINI_RESTORE_STORAGE_KEY = "veolms-player-mini-restore";
const PLAYER_MINI_WIDTH_STORAGE_KEY = "veolms-player-mini-width";
const PLAYER_MINI_SIDE_STORAGE_KEY = "veolms-player-mini-side";

/** Which side of the screen the mini player last came to rest on. */
export type MiniPlayerSide = "left" | "right";

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
  miniPlayerWidth: PLAYER_MINI_WIDTH_STORAGE_KEY,
  muted: PLAYER_MUTED_STORAGE_KEY,
  playbackRate: PLAYER_PLAYBACK_RATE_STORAGE_KEY,
  volume: PLAYER_VOLUME_STORAGE_KEY,
  volumeChange: PLAYER_VOLUME_CHANGE_STORAGE_KEY,
  resume: (mediaKey: string) => `veolms-watch-${mediaKey}`,
  /** When the position (or its clearing) was kept, in ms since 1970. */
  resumeAt: (mediaKey: string) => `veolms-watch-at-${mediaKey}`,
} as const;

/**
 * A lesson opened where it was left starts this far before that point, so
 * the learner hears the last moments again and knows where they are.
 */
export const RESUME_REWIND_SECONDS = 5;

export function clampPlayerVolume(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export function readMiniPlayerWidthPreference(
  storage: StorageReader | null = getBrowserStorage(),
): number | null {
  if (!storage) return null;
  try {
    const width = Number(storage.getItem(PLAYER_MINI_WIDTH_STORAGE_KEY));
    return Number.isFinite(width) && width > 0 ? width : null;
  } catch {
    return null;
  }
}

/**
 * The side the mini player last came to rest on in this browser tab, which a
 * flick that minimizes the video goes back to. Kept for the tab only: a new
 * tab starts on the right again.
 */
export function readMiniPlayerSidePreference(
  storage: StorageReader | null = getSessionStorage(),
): MiniPlayerSide | null {
  if (!storage) return null;
  try {
    const side = storage.getItem(PLAYER_MINI_SIDE_STORAGE_KEY);
    return side === "left" || side === "right" ? side : null;
  } catch {
    return null;
  }
}

export function writeMiniPlayerSidePreference(
  side: MiniPlayerSide,
  storage: StorageWriter | null = getSessionStorage(),
): void {
  try {
    storage?.setItem(PLAYER_MINI_SIDE_STORAGE_KEY, side);
  } catch {
    // A flick then minimizes to the right, as in a new tab.
  }
}

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

export function readVolumePreference(
  storage: StorageReader | null = getBrowserStorage(),
): number {
  if (!storage) return 1;
  try {
    const raw = storage.getItem(PLAYER_VOLUME_STORAGE_KEY);
    if (raw === null || raw.trim() === "") return 1;
    return clampPlayerVolume(Number(raw));
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

/**
 * Saves a volume the viewer set in this tab, and announces it to the other
 * tabs (`lessonPlayerStorageKeys.volumeChange`).
 */
export function writeVolumePreference(
  volume: number,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  if (!Number.isFinite(volume)) return;
  const clamped = clampPlayerVolume(volume);
  try {
    storage?.setItem(PLAYER_VOLUME_STORAGE_KEY, String(clamped));
    storage?.setItem(
      PLAYER_VOLUME_CHANGE_STORAGE_KEY,
      JSON.stringify({ volume: clamped, at: Date.now() }),
    );
  } catch {
    // Playback remains usable when browser storage is unavailable.
  }
}

/** The volume in a `volumeChange` announcement, or null. */
export function readVolumeChange(value: string | null): number | null {
  if (!value) return null;
  try {
    const change = JSON.parse(value) as { volume?: unknown };
    return typeof change.volume === "number" && Number.isFinite(change.volume)
      ? clampPlayerVolume(change.volume)
      : null;
  } catch {
    return null;
  }
}

export function writeMiniPlayerWidthPreference(
  width: number,
  storage: StorageWriter | null = getBrowserStorage(),
): void {
  if (!Number.isFinite(width) || width <= 0) return;
  try {
    storage?.setItem(PLAYER_MINI_WIDTH_STORAGE_KEY, String(Math.round(width)));
  } catch {
    // The current mini-player size remains usable when storage is unavailable.
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
  /** When it was the position: now, unless it comes from elsewhere. */
  savedAt = Date.now(),
): void {
  if (!Number.isFinite(position) || position <= 0) return;
  try {
    storage?.setItem(
      lessonPlayerStorageKeys.resume(mediaKey),
      String(position),
    );
    storage?.setItem(
      lessonPlayerStorageKeys.resumeAt(mediaKey),
      String(savedAt),
    );
  } catch {
    // Resume persistence is optional and must never interrupt playback.
  }
  // Played here: kept for the account too, for every device.
  const lesson = parseLessonMediaKey(mediaKey);
  if (lesson && savedAt >= Date.now() - 1000) {
    noteLessonPosition(lesson.courseKey, lesson.lessonNumber, position);
  }
}

/**
 * A position kept this recently is picked up exactly where it was: the
 * page was reloaded, or the lesson reopened a moment later. Older than
 * this, it is a return, and the few seconds before help pick the thread
 * up again.
 */
export const RESUME_EXACT_WINDOW_MS = 5 * 60_000;

/**
 * Where to start a lesson that is opened (not one handed over between
 * players, which carries on where it was): exactly where it was left when
 * that was moments ago (`RESUME_EXACT_WINDOW_MS`), otherwise a few seconds
 * before (`RESUME_REWIND_SECONDS`).
 */
export function readStartPosition(
  mediaKey: string,
  duration?: number,
  storage: StorageReader | null = getBrowserStorage(),
  now = Date.now(),
): number {
  const position = readResumePosition(mediaKey, duration, storage);
  if (position <= 0) return 0;
  let savedAt = 0;
  try {
    savedAt = Number(
      storage?.getItem(lessonPlayerStorageKeys.resumeAt(mediaKey)),
    );
  } catch {
    savedAt = 0;
  }
  if (
    Number.isFinite(savedAt) &&
    savedAt > 0 &&
    now - savedAt <= RESUME_EXACT_WINDOW_MS
  ) {
    return position;
  }
  return position > RESUME_REWIND_SECONDS
    ? position - RESUME_REWIND_SECONDS
    : 0;
}

/**
 * Takes the position the account last had in a lesson, saved from any
 * device, when it is newer than the one this browser has (or this browser
 * has none). `savedAt` is the server's time for it.
 */
export function adoptAccountResumePosition(
  mediaKey: string,
  seconds: number,
  savedAt: string,
  storage: StorageMutator | null = getBrowserStorage(),
): void {
  const accountAt = Date.parse(savedAt);
  if (!storage || !Number.isFinite(seconds) || !Number.isFinite(accountAt)) {
    return;
  }
  try {
    const localAt = Number(
      storage.getItem(lessonPlayerStorageKeys.resumeAt(mediaKey)) ?? 0,
    );
    if (Number.isFinite(localAt) && localAt >= accountAt) return;
    // Watched to the end (or started again) there: from the beginning.
    if (seconds <= 0) {
      storage.removeItem(lessonPlayerStorageKeys.resume(mediaKey));
    } else {
      storage.setItem(
        lessonPlayerStorageKeys.resume(mediaKey),
        String(seconds),
      );
    }
    storage.setItem(
      lessonPlayerStorageKeys.resumeAt(mediaKey),
      String(accountAt),
    );
  } catch {
    // Resume persistence is optional and must never interrupt playback.
  }
}

/**
 * Where a lesson was left is kept per browser, but the progress shown in the
 * list ("34% complete") is the account's, from the server. A lesson watched
 * in another browser would otherwise open at 0 here. With nothing stored in
 * this browser, the account's progress becomes the position to resume from;
 * a position this browser already has is never replaced.
 */
export function seedResumePositionFromProgress(
  mediaKey: string,
  progressPercent: number,
  durationSeconds: number,
  storage: (StorageReader & StorageWriter) | null = getBrowserStorage(),
): void {
  if (
    !storage ||
    !Number.isFinite(progressPercent) ||
    !Number.isFinite(durationSeconds) ||
    progressPercent <= 0 ||
    progressPercent >= 99 ||
    durationSeconds <= 0
  ) {
    return;
  }
  try {
    if (storage.getItem(lessonPlayerStorageKeys.resume(mediaKey)) !== null) {
      return;
    }
  } catch {
    return;
  }
  writeResumePosition(
    mediaKey,
    Math.floor((progressPercent / 100) * durationSeconds),
    storage,
    // A guess, not a place the learner was seen at: any position saved
    // for the account is taken over it, and it is not sent as one.
    0,
  );
}

/**
 * Forgets where a lesson was left, so it opens from the beginning next time.
 * Writing a position of 0 does not do this: writeResumePosition ignores it.
 */
export function clearResumePosition(
  mediaKey: string,
  storage: Pick<
    StorageMutator,
    "removeItem" | "setItem"
  > | null = getBrowserStorage(),
): void {
  try {
    storage?.removeItem(lessonPlayerStorageKeys.resume(mediaKey));
    // When it was cleared: an older position from another device is not
    // taken in its place.
    storage?.setItem(
      lessonPlayerStorageKeys.resumeAt(mediaKey),
      String(Date.now()),
    );
  } catch {
    // Resume persistence is optional and must never interrupt playback.
  }
  // The account's devices start it from the beginning too.
  const lesson = parseLessonMediaKey(mediaKey);
  if (lesson) noteLessonPosition(lesson.courseKey, lesson.lessonNumber, 0);
}
