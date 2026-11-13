import {
  CHAT_UPLOAD_MAX_BYTES,
  CHAT_UPLOAD_MIME_TYPES,
  type ChatUploadKind,
} from "@veolms/contracts";

import type { OutgoingFile } from "../services/chat";

/**
 * Files picked for a message, prepared in the browser (CHAT_ROOM_PLAN
 * §14.6): photos are re-drawn on a canvas (max 2048 px, WebP or JPEG),
 * which also drops their EXIF location data; videos and voice messages
 * report their length and size. The API never touches the bytes.
 */

const MAX_IMAGE_EDGE = 2048;

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

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new ChatFileError("This photo could not be read."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
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
  const image = await loadImage(file);
  const scale = Math.min(
    1,
    MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
  // WebP where the browser can make it, else JPEG.
  let blob = await canvasBlob(canvas, "image/webp", 0.82);
  let mimeType = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasBlob(canvas, "image/jpeg", 0.85);
    mimeType = "image/jpeg";
  }
  if (!blob) throw new ChatFileError("This photo could not be prepared.");
  const name =
    file.name.replace(/\.[^.]+$/, "") +
    (mimeType === "image/webp" ? ".webp" : ".jpg");
  return { file: blob, mimeType, width, height, name };
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

/** Turns a picked file into something ready to send (or explains why not). */
export async function prepareFile(
  file: File,
  asDocument = false,
): Promise<OutgoingFile> {
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
  if (blob.size > CHAT_UPLOAD_MAX_BYTES[kind]) {
    throw new ChatFileError(
      `${file.name} is too big (up to ${Math.round(CHAT_UPLOAD_MAX_BYTES[kind] / 1024 / 1024)} MB).`,
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
