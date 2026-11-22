import {
  CHAT_UPLOAD_LEARNER_MAX_BYTES,
  CHAT_UPLOAD_MIME_TYPES,
  type ChatUploadKind,
} from "@veolms/contracts";

import type { OutgoingFile } from "../services/chat";

/**
 * Files picked for a message, prepared in the browser (CHAT_ROOM_PLAN
 * §14.6): photos, videos and voice messages report their size and length
 * here. The copy that is sent (Standard or HD; a photo re-drawn, which
 * drops its EXIF location) is made when the message is sent
 * (mediaQuality.ts). The API never touches the bytes.
 */

export class ChatFileError extends Error {}

export function kindFor(mimeType: string): ChatUploadKind | null {
  const type = mimeType.split(";")[0]!.toLowerCase();
  for (const kind of ["image", "video", "audio", "file"] as const) {
    if ((CHAT_UPLOAD_MIME_TYPES[kind] as readonly string[]).includes(type)) {
      return kind;
    }
  }
  return null;
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.src = url;
  try {
    await image.decode();
    return image;
  } catch {
    throw new ChatFileError("This photo could not be read.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Files up to this size are copied into the page as soon as they are
 * picked. A phone (Android Chrome) lets the page read a file from the
 * gallery only for a while: read later, when the message was sent or
 * retried, it failed, and the same photo failed on every Retry (26 photos
 * left half-sent in a week, 21 Nov 2026). Bigger files are read from the
 * device as before.
 */
const COPY_ON_PICK_MAX_BYTES = 512 * 1024 * 1024;

/** The picked file, read now while the device still allows it. */
async function readNow(file: File): Promise<File> {
  if (file.size > COPY_ON_PICK_MAX_BYTES) return file;
  try {
    const bytes = await file.arrayBuffer();
    return new File([bytes], file.name, {
      type: file.type,
      lastModified: file.lastModified,
    });
  } catch {
    throw new ChatFileError(
      `${file.name} couldn’t be read from your device. Pick it again.`,
    );
  }
}

async function preparePhoto(file: File): Promise<Partial<OutgoingFile>> {
  // GIFs keep their animation: sent as they are.
  if (file.type === "image/gif") {
    const image = await loadImage(file);
    return {
      file,
      mimeType: "image/gif",
      width: image.naturalWidth,
      height: image.naturalHeight,
    };
  }
  // Re-drawn at the size the sender picks (Standard or HD) when the message
  // is sent (mediaQuality.ts); here only checked and measured for preview.
  const image = await loadImage(file);
  return { width: image.naturalWidth, height: image.naturalHeight };
}

function videoMeta(
  file: Blob,
): Promise<{ width: number; height: number; durationMs: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve({
        width: video.videoWidth || 640,
        height: video.videoHeight || 360,
        durationMs: Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : 0,
      });
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({ width: 640, height: 360, durationMs: 0 });
    };
    video.src = url;
  });
}

/**
 * How long a media element plays, in seconds. WebM files (most recordings)
 * often say "Infinity" until played through: jumping far past the end
 * makes the browser find the real end, then the play position goes back.
 */
export function resolveMediaLength(media: HTMLMediaElement): Promise<number> {
  if (Number.isFinite(media.duration) && media.duration > 0) {
    return Promise.resolve(media.duration);
  }
  return new Promise((resolve) => {
    const done = () => {
      media.removeEventListener("durationchange", check);
      media.removeEventListener("timeupdate", check);
      clearTimeout(timer);
      const length = Number.isFinite(media.duration) ? media.duration : 0;
      try {
        media.currentTime = 0;
      } catch {
        // Not seekable: nothing to put back.
      }
      resolve(length);
    };
    const check = () => {
      if (Number.isFinite(media.duration) && media.duration > 0) done();
    };
    const timer = setTimeout(done, 4_000);
    media.addEventListener("durationchange", check);
    media.addEventListener("timeupdate", check);
    try {
      media.currentTime = 1e7;
    } catch {
      done();
    }
  });
}

/** An audio file's length, for the time shown before it is played. */
function audioLengthMs(file: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const finish = (ms: number) => {
      URL.revokeObjectURL(url);
      resolve(ms);
    };
    audio.onloadedmetadata = () =>
      void resolveMediaLength(audio).then((seconds) =>
        finish(Math.round(seconds * 1000)),
      );
    audio.onerror = () => finish(0);
    audio.src = url;
  });
}

/** "200 MB", "5 GB". */
function sizeLimitLabel(bytes: number): string {
  return bytes >= 1e12
    ? `${Math.round(bytes / 1e12)} TB`
    : bytes >= 1e9
      ? `${Math.round(bytes / 1e9)} GB`
      : `${Math.round(bytes / 1024 / 1024)} MB`;
}

/** Turns a picked file into something ready to send (or explains why not). */
export async function prepareFile(
  file: File,
  asDocument = false,
  /** Yours in this chat (`room.me.uploadMaxBytes`): learners 200 MB. */
  maxBytes: number = CHAT_UPLOAD_LEARNER_MAX_BYTES,
): Promise<OutgoingFile> {
  file = await readNow(file);
  const detected = kindFor(file.type);
  const kind: ChatUploadKind | null = asDocument
    ? (CHAT_UPLOAD_MIME_TYPES.file as readonly string[]).includes(file.type)
      ? "file"
      : detected
    : detected;
  if (!kind) {
    throw new ChatFileError(`${file.name}: this kind of file can't be sent.`);
  }
  let prepared: Partial<OutgoingFile> = {
    file,
    mimeType: file.type,
    name: file.name,
  };
  if (kind === "image")
    prepared = { ...prepared, ...(await preparePhoto(file)) };
  if (kind === "video") prepared = { ...prepared, ...(await videoMeta(file)) };
  if (kind === "audio" && prepared.durationMs === undefined) {
    const durationMs = await audioLengthMs(file);
    if (durationMs > 0) prepared = { ...prepared, durationMs };
  }
  const blob = prepared.file ?? file;
  if (blob.size > maxBytes) {
    throw new ChatFileError(
      `${file.name} is too big (up to ${sizeLimitLabel(maxBytes)}).`,
    );
  }
  return {
    localId: crypto.randomUUID(),
    file: blob,
    kind,
    name: prepared.name ?? file.name,
    mimeType: (prepared.mimeType ?? file.type).split(";")[0]!,
    ...(prepared.width ? { width: prepared.width } : {}),
    ...(prepared.height ? { height: prepared.height } : {}),
    ...(prepared.durationMs !== undefined
      ? { durationMs: prepared.durationMs }
      : {}),
    previewUrl:
      kind === "image" || kind === "video" ? URL.createObjectURL(blob) : null,
    progress: 0,
    attachment: null,
  };
}
