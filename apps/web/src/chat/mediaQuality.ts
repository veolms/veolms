/**
 * How photos, videos and audio files are sent: "Standard" (smaller, the
 * default, like WhatsApp's standard quality) or "HD".
 *
 * - Photos are always re-drawn (which also drops their EXIF location):
 *   Standard at most 1600 px as WebP 0.75 (a 12 MP phone photo comes out
 *   around 100–250 KB, as on WhatsApp), HD at most 4096 px as WebP 0.9.
 * - Videos in Standard become 720p H.264 (about 1.8 Mbit/s) with AAC sound;
 *   in HD they go as they are.
 * - Audio files in Standard become 96 kbit/s AAC; voice messages and files
 *   already that small go as they are, and HD sends them unchanged.
 *
 * All of it happens in the sender's browser (WebCodecs, through Mediabunny,
 * loaded only when needed). A browser that cannot encode, or a result that
 * is not clearly smaller, sends the original.
 */
import type { OutgoingFile } from "../services/chat/chat.outbox";

export type SendQuality = "standard" | "hd";

const PHOTO = {
  standard: { edge: 1600, webp: 0.75, jpeg: 0.78 },
  hd: { edge: 4096, webp: 0.9, jpeg: 0.92 },
} as const;

/** Standard video: the short side, and the bitrates (bit/s). */
const VIDEO_SHORT_EDGE = 720;
const VIDEO_BITRATE = 1_800_000;
const VIDEO_AUDIO_BITRATE = 96_000;
/** Audio files above this (bit/s) are made smaller in Standard. */
const AUDIO_BITRATE = 96_000;
/** A result must save at least this share of the original to be used. */
const WORTH_IT = 0.85;

const QUALITY_KEY = "veolms.chat.sendQuality";

/** The quality last chosen on this device (Standard until changed). */
export function savedSendQuality(): SendQuality {
  try {
    return localStorage.getItem(QUALITY_KEY) === "hd" ? "hd" : "standard";
  } catch {
    return "standard";
  }
}

export function saveSendQuality(quality: SendQuality) {
  try {
    localStorage.setItem(QUALITY_KEY, quality);
  } catch {
    // Private mode: the choice lasts for this message only.
  }
}

/** Whether a picked file has a Standard/HD choice at all. */
export function hasQualityChoice(
  file: Pick<OutgoingFile, "kind" | "mimeType">,
) {
  if (file.kind === "image") return file.mimeType !== "image/gif";
  return file.kind === "video" || file.kind === "audio";
}

type Prepared = Pick<
  OutgoingFile,
  "file" | "mimeType" | "name" | "width" | "height" | "durationMs"
>;

function renamed(name: string, extension: string) {
  return name.replace(/\.[^.]+$/, "") + extension;
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
      reject(new Error("This photo could not be read."));
    };
    image.src = url;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, quality),
  );
}

/** A photo re-drawn at the chosen size (WebP where possible, else JPEG). */
export async function encodePhoto(
  file: Blob,
  name: string,
  quality: SendQuality,
): Promise<Prepared> {
  const settings = PHOTO[quality];
  const image = await loadImage(file);
  const scale = Math.min(
    1,
    settings.edge / Math.max(image.naturalWidth, image.naturalHeight),
  );
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(image, 0, 0, width, height);
  let blob = await canvasBlob(canvas, "image/webp", settings.webp);
  let mimeType = "image/webp";
  if (!blob || blob.type !== "image/webp") {
    blob = await canvasBlob(canvas, "image/jpeg", settings.jpeg);
    mimeType = "image/jpeg";
  }
  if (!blob) throw new Error("This photo could not be prepared.");
  return {
    file: blob,
    mimeType,
    width,
    height,
    name: renamed(name, mimeType === "image/webp" ? ".webp" : ".jpg"),
  };
}

/** A smaller 720p MP4, or null when it can't be made or saves too little. */
export async function shrinkVideo(
  file: Blob,
  name: string,
  onProgress: (fraction: number) => void,
): Promise<Prepared | null> {
  const mb = await import("mediabunny");
  if (
    typeof VideoEncoder === "undefined" ||
    !(await mb.canEncodeVideo("avc", { width: 1280, height: 720 }))
  ) {
    return null;
  }
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.BlobSource(file),
  });
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return null;
    const width = track.displayWidth;
    const height = track.displayHeight;
    const seconds = await input.computeDuration();
    const shortEdge = Math.min(width, height);
    // Already small: nothing to gain.
    if (
      shortEdge <= VIDEO_SHORT_EDGE &&
      seconds > 0 &&
      (file.size * 8) / seconds <= VIDEO_BITRATE * 1.3
    ) {
      return null;
    }
    const resize =
      shortEdge > VIDEO_SHORT_EDGE
        ? width >= height
          ? { height: VIDEO_SHORT_EDGE }
          : { width: VIDEO_SHORT_EDGE }
        : {};
    const audioCodec = (await mb.canEncodeAudio("aac")) ? "aac" : undefined;
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: {
        ...resize,
        codec: "avc",
        quality: new mb.Quality({ bitrate: VIDEO_BITRATE }),
      },
      audio: audioCodec
        ? {
            codec: audioCodec,
            quality: new mb.Quality({ bitrate: VIDEO_AUDIO_BITRATE }),
          }
        : {},
    });
    if (!conversion.isValid) return null;
    conversion.onProgress = (fraction) => onProgress(fraction);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength > file.size * WORTH_IT) return null;
    const scale =
      shortEdge > VIDEO_SHORT_EDGE ? VIDEO_SHORT_EDGE / shortEdge : 1;
    return {
      file: new Blob([buffer], { type: "video/mp4" }),
      mimeType: "video/mp4",
      name: renamed(name, ".mp4"),
      width: Math.round(width * scale),
      height: Math.round(height * scale),
      durationMs: Math.round(seconds * 1000),
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** A smaller AAC (.m4a) file, or null when it can't be made or isn't needed. */
export async function shrinkAudio(
  file: Blob,
  name: string,
  durationMs: number | undefined,
  onProgress: (fraction: number) => void,
): Promise<Prepared | null> {
  // Voice messages and other light files go as they are.
  if (
    durationMs &&
    (file.size * 8) / (durationMs / 1000) <= AUDIO_BITRATE * 1.2
  ) {
    return null;
  }
  const mb = await import("mediabunny");
  if (
    typeof AudioEncoder === "undefined" ||
    !(await mb.canEncodeAudio("aac"))
  ) {
    return null;
  }
  const input = new mb.Input({
    formats: mb.ALL_FORMATS,
    source: new mb.BlobSource(file),
  });
  try {
    const output = new mb.Output({
      format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }),
      target: new mb.BufferTarget(),
    });
    const conversion = await mb.Conversion.init({
      input,
      output,
      video: { discard: true },
      audio: {
        codec: "aac",
        quality: new mb.Quality({ bitrate: AUDIO_BITRATE }),
      },
    });
    if (!conversion.isValid) return null;
    conversion.onProgress = (fraction) => onProgress(fraction);
    await conversion.execute();
    const buffer = output.target.buffer;
    if (!buffer || buffer.byteLength > file.size * WORTH_IT) return null;
    return {
      file: new Blob([buffer], { type: "audio/mp4" }),
      mimeType: "audio/mp4",
      name: renamed(name, ".m4a"),
      ...(durationMs !== undefined ? { durationMs } : {}),
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/**
 * The file as it will be sent at `quality`. Photos are always re-drawn;
 * videos and audio change only in Standard, and only when it helps.
 */
export async function prepareForSending(
  file: OutgoingFile,
  quality: SendQuality,
  onProgress: (fraction: number) => void,
): Promise<Prepared | null> {
  if (!hasQualityChoice(file)) return null;
  const source = file.original ?? file.file;
  if (file.kind === "image") return encodePhoto(source, file.name, quality);
  if (quality === "hd") return null;
  if (file.kind === "video") return shrinkVideo(source, file.name, onProgress);
  return shrinkAudio(source, file.name, file.durationMs, onProgress);
}
