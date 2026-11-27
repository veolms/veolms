import {
  canKeepChatMedia,
  chatMediaKey,
  dropChatMedia,
  holdChatMedia,
  keepChatMedia,
  onChatMediaCleared,
  readChatMedia,
  type ChatMediaKind,
} from "../lib/chatMediaCache";
import { prefersReducedData } from "../lib/reduced-data";
import { chatService } from "../services/chat";

/**
 * Where a chat photo or video is shown from: this device's copy when there
 * is one (lib/chatMediaCache.ts), otherwise the network.
 *
 * - A photo is downloaded once by the page (instead of by the <img>), shown
 *   from that download and kept.
 * - A video plays from the network as before (the browser reads it in
 *   ranges, so it starts at once). Once it has played a few seconds, one
 *   copy is downloaded behind it and kept, with a still picture for its
 *   bubble; from then on it plays from the device.
 *
 * A kept file is shown from a `blob:` address, shared by every place that
 * shows it (the bubble, the viewer, its thumbnail strip) and let go a
 * minute after the last one closes.
 */

const UPLOAD_ID =
  /\/chat\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?=[/?#]|$)/i;

/** The upload a chat file's address points at, or null (a local copy). */
export function chatUploadIdOf(src: string): string | null {
  if (!src || src.startsWith("blob:") || src.startsWith("data:")) return null;
  if (!canKeepChatMedia()) return null;
  // A CDN link (`?t=`) stands for the API path it came with.
  const path = chatService.apiPathOf(src) ?? src;
  return UPLOAD_ID.exec(path)?.[1] ?? null;
}

const uploadRef = (uploadId: string) => ({
  url: `/v1/chat/uploads/${uploadId}`,
});

// ---------------------------------------------------------------------------
// Shared blob: addresses
// ---------------------------------------------------------------------------

interface Shown {
  key: string;
  url: string;
  refs: number;
  stale: boolean;
  timer: ReturnType<typeof setTimeout> | null;
  releaseHold: () => void;
}

/** A kept file stays open this long after the last place showing it. */
const LINGER_MS = 60_000;
const shown = new Map<string, Shown>();

function revoke(entry: Shown) {
  if (entry.timer) clearTimeout(entry.timer);
  entry.timer = null;
  entry.releaseHold();
  URL.revokeObjectURL(entry.url);
}

export interface MediaHandle {
  url: string;
  release: () => void;
}

function retain(entry: Shown): MediaHandle {
  entry.refs += 1;
  if (entry.timer) {
    clearTimeout(entry.timer);
    entry.timer = null;
  }
  let released = false;
  return {
    url: entry.url,
    release: () => {
      if (released) return;
      released = true;
      entry.refs -= 1;
      if (entry.refs > 0) return;
      if (entry.stale) {
        revoke(entry);
        return;
      }
      entry.timer = setTimeout(() => {
        if (entry.refs > 0 || shown.get(entry.key) !== entry) return;
        shown.delete(entry.key);
        revoke(entry);
      }, LINGER_MS);
    },
  };
}

/** The address of a file already open in this page, without waiting. */
export function peekShown(
  kind: ChatMediaKind,
  uploadId: string,
): string | null {
  return shown.get(chatMediaKey(kind, uploadId))?.url ?? null;
}

function take(key: string): MediaHandle | null {
  const entry = shown.get(key);
  return entry ? retain(entry) : null;
}

function adopt(key: string, blob: Blob): MediaHandle {
  const existing = take(key);
  if (existing) return existing;
  const entry: Shown = {
    key,
    url: URL.createObjectURL(blob),
    refs: 0,
    stale: false,
    timer: null,
    releaseHold: holdChatMedia(key),
  };
  shown.set(key, entry);
  return retain(entry);
}

/** A file that could not be shown: forgotten here and on the device. */
export function discardShown(kind: ChatMediaKind, uploadId: string): void {
  const key = chatMediaKey(kind, uploadId);
  const entry = shown.get(key);
  if (entry) {
    shown.delete(key);
    entry.stale = true;
    if (entry.refs === 0) revoke(entry);
  }
  void dropChatMedia(kind, uploadId);
  if (kind === "video") discardShown("poster", uploadId);
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const lookups = new Map<string, Promise<Blob | null>>();

function once(
  key: string,
  start: () => Promise<Blob | null>,
): Promise<Blob | null> {
  let pending = lookups.get(key);
  if (!pending) {
    pending = start().finally(() => lookups.delete(key));
    lookups.set(key, pending);
  }
  return pending;
}

/** This device's copy of a file, opened for showing; null when not kept. */
export async function openKept(
  kind: ChatMediaKind,
  uploadId: string,
): Promise<MediaHandle | null> {
  const key = chatMediaKey(kind, uploadId);
  const ready = take(key);
  if (ready) return ready;
  const blob = await once(`read:${key}`, () => readChatMedia(kind, uploadId));
  return blob ? adopt(key, blob) : null;
}

async function downloadPhoto(uploadId: string): Promise<Blob | null> {
  try {
    const response = await chatService.openFile(uploadRef(uploadId));
    const blob = await response.blob();
    if (blob.size === 0 || (blob.type && !blob.type.startsWith("image/"))) {
      return null;
    }
    void keepChatMedia("image", uploadId, blob, blob.type || "image/*");
    return blob;
  } catch {
    return null;
  }
}

/**
 * A photo, from this device or downloaded (and kept) now; null when it
 * could not be downloaded here (the <img> then tries the usual way).
 */
export async function openPhoto(uploadId: string): Promise<MediaHandle | null> {
  const kept = await openKept("image", uploadId);
  if (kept) return kept;
  const key = chatMediaKey("image", uploadId);
  const blob = await once(`download:${key}`, () => downloadPhoto(uploadId));
  return blob ? adopt(key, blob) : null;
}

/** A photo's bytes for Copy: the kept copy, or downloaded as before. */
export async function readPhotoBlob(url: string): Promise<Blob> {
  const uploadId = chatUploadIdOf(url);
  const kept = uploadId ? await readChatMedia("image", uploadId) : null;
  return kept ?? chatService.readFileBlob({ url });
}

// ---------------------------------------------------------------------------
// Keeping videos
// ---------------------------------------------------------------------------

/** At most this many videos are downloaded for keeping at once. */
const MAX_VIDEO_KEEPS = 2;
const keeping = new Set<string>();
/** Videos already tried during this page (kept, too large, failed). */
const tried = new Set<string>();

/**
 * Downloads one copy of a video being watched, behind its playback, and
 * keeps it with a still picture. Skipped when the visitor asked to save
 * data, or when the device cannot keep files.
 */
export function keepVideo(uploadId: string, mimeType: string): void {
  if (tried.has(uploadId) || keeping.size >= MAX_VIDEO_KEEPS) return;
  if (!canKeepChatMedia() || prefersReducedData()) return;
  tried.add(uploadId);
  keeping.add(uploadId);
  void (async () => {
    try {
      const response = await chatService.openFile(uploadRef(uploadId), {
        priority: "low",
      });
      const type = response.headers.get("content-type") || mimeType;
      if (!type.startsWith("video/")) {
        void response.body?.cancel().catch(() => {});
        return;
      }
      if (await keepChatMedia("video", uploadId, response, type)) {
        await makePoster(uploadId);
      }
    } catch {
      // Played from the network next time too.
    } finally {
      keeping.delete(uploadId);
    }
  })();
}

/** Width of a video's kept still picture. */
const POSTER_WIDTH = 480;
const POSTER_TIME_SECONDS = 0.1;
const posterRuns = new Map<string, Promise<void>>();

/** A frame drawn from a video file of this page (not from another site). */
function captureStill(url: string): Promise<Blob | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.preload = "auto";
    let done = false;
    const finish = (still: Blob | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(still);
    };
    const timer = setTimeout(() => finish(null), 10_000);
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(
        POSTER_TIME_SECONDS,
        Number.isFinite(video.duration) ? video.duration / 2 : 0,
      );
    };
    video.onseeked = () => {
      const { videoWidth: width, videoHeight: height } = video;
      if (!width || !height) return finish(null);
      const scale = Math.min(1, POSTER_WIDTH / width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const context = canvas.getContext("2d");
      if (!context) return finish(null);
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      // A phone that has not decoded the frame draws plain black: no still
      // then (the bubble shows the video itself, as before).
      const sample = context.getImageData(
        0,
        0,
        canvas.width,
        canvas.height,
      ).data;
      let lit = false;
      for (let index = 0; index < sample.length; index += 4 * 97) {
        if (sample[index]! + sample[index + 1]! + sample[index + 2]! > 24) {
          lit = true;
          break;
        }
      }
      if (!lit) return finish(null);
      canvas.toBlob((still) => finish(still), "image/jpeg", 0.8);
    };
    video.onerror = () => finish(null);
    video.src = url;
  });
}

/** Keeps a still picture of a kept video, for its bubble. */
export function makePoster(uploadId: string): Promise<void> {
  let run = posterRuns.get(uploadId);
  if (run) return run;
  run = (async () => {
    if (await readChatMedia("poster", uploadId)) return;
    const video = await openKept("video", uploadId);
    if (!video) return;
    try {
      const still = await captureStill(video.url);
      if (still) await keepChatMedia("poster", uploadId, still, still.type);
    } finally {
      video.release();
    }
  })().catch(() => undefined);
  posterRuns.set(uploadId, run);
  return run;
}

if (typeof window !== "undefined") {
  // Emptied (Settings, sign-out, another tab): nothing is shown from the
  // old copies again. What is on screen keeps its picture until closed.
  onChatMediaCleared(() => {
    for (const [key, entry] of shown) {
      shown.delete(key);
      entry.stale = true;
      if (entry.refs === 0) revoke(entry);
    }
    tried.clear();
    posterRuns.clear();
  });
}
