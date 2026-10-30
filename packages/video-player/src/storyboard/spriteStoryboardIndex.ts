import type { StoryboardFrame } from "./storyboardTypes.ts";

/**
 * One level of a sprite storyboard: frames taken every `interval` seconds,
 * each `width` x `height`, laid out row by row in sheets of
 * `columns` x `rows` frames. Frame `n` shows the moment `n * interval`.
 */
export interface SpriteStoryboardLevel {
  interval: number;
  width: number;
  height: number;
  columns: number;
  rows: number;
  frameCount: number;
  /** Sheet image URLs, relative to the index document. */
  sheets: readonly string[];
}

/**
 * A seek-preview video: the lesson as small pictures (`width` x `height`,
 * one every `interval` seconds) in a bare H.264 stream (Annex B, an access
 * unit delimiter before every picture, no B-frames). Every `gopFrames`
 * pictures start a chunk with a full picture that decodes on its own;
 * chunk `n` is the bytes from `gopOffsets[n]` to the next one (or `bytes`).
 */
export interface PreviewVideoInfo {
  /** The stream's URL, relative to the index document. */
  file: string;
  /** WebCodecs codec string, e.g. `avc1.4d401e`. */
  codec: string;
  width: number;
  height: number;
  interval: number;
  frameCount: number;
  gopFrames: number;
  gopOffsets: readonly number[];
  bytes: number;
}

/**
 * The `index.json` written next to a video's sprite sheets. `coarse` is
 * small and covers the whole video in a few sheets; `detail` is larger and
 * is fetched one sheet at a time, only where the viewer lingers. `video`,
 * when present, is a preview video that replaces both where the browser
 * can decode it.
 */
export interface SpriteStoryboardIndex {
  version: 1;
  duration: number;
  coarse: SpriteStoryboardLevel;
  detail?: SpriteStoryboardLevel;
  video?: PreviewVideoInfo;
}

function positiveNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function positiveInteger(value: unknown): value is number {
  return positiveNumber(value) && Number.isInteger(value);
}

function parseLevel(value: unknown): SpriteStoryboardLevel | null {
  if (!value || typeof value !== "object") return null;
  const level = value as Record<string, unknown>;
  const sheets = level.sheets;
  if (
    !positiveNumber(level.interval) ||
    !positiveInteger(level.width) ||
    !positiveInteger(level.height) ||
    !positiveInteger(level.columns) ||
    !positiveInteger(level.rows) ||
    !positiveInteger(level.frameCount) ||
    !Array.isArray(sheets) ||
    sheets.length === 0 ||
    !sheets.every((sheet) => typeof sheet === "string" && sheet.length > 0) ||
    sheets.length * level.columns * level.rows < level.frameCount
  ) {
    return null;
  }
  return {
    interval: level.interval,
    width: level.width,
    height: level.height,
    columns: level.columns,
    rows: level.rows,
    frameCount: level.frameCount,
    sheets: sheets as string[],
  };
}

function parseVideo(value: unknown): PreviewVideoInfo | null {
  if (!value || typeof value !== "object") return null;
  const video = value as Record<string, unknown>;
  const offsets = video.gopOffsets;
  if (
    typeof video.file !== "string" ||
    video.file.length === 0 ||
    typeof video.codec !== "string" ||
    !/^avc1\.[0-9a-f]{6}$/iu.test(video.codec) ||
    !positiveInteger(video.width) ||
    !positiveInteger(video.height) ||
    !positiveNumber(video.interval) ||
    !positiveInteger(video.frameCount) ||
    !positiveInteger(video.gopFrames) ||
    !positiveInteger(video.bytes) ||
    !Array.isArray(offsets) ||
    offsets.length !== Math.ceil(video.frameCount / video.gopFrames) ||
    offsets[0] !== 0 ||
    !offsets.every(
      (offset, index) =>
        Number.isInteger(offset) &&
        (index === 0 || offset > (offsets[index - 1] as number)) &&
        offset < (video.bytes as number),
    )
  ) {
    return null;
  }
  return {
    file: video.file,
    codec: video.codec,
    width: video.width,
    height: video.height,
    interval: video.interval,
    frameCount: video.frameCount,
    gopFrames: video.gopFrames,
    gopOffsets: offsets as number[],
    bytes: video.bytes,
  };
}

/** Validates a storyboard index document; null when it is not one. */
export function parseSpriteStoryboardIndex(
  value: unknown,
): SpriteStoryboardIndex | null {
  if (!value || typeof value !== "object") return null;
  const document = value as Record<string, unknown>;
  if (document.version !== 1 || !positiveNumber(document.duration)) {
    return null;
  }
  const coarse = parseLevel(document.coarse);
  if (!coarse) return null;
  const detail =
    document.detail === undefined ? undefined : parseLevel(document.detail);
  if (detail === null) return null;
  // A preview video that does not read right is left out; the sheets
  // still work.
  const video =
    document.video === undefined ? null : parseVideo(document.video);
  return {
    version: 1,
    duration: document.duration,
    coarse,
    ...(detail ? { detail } : {}),
    ...(video ? { video } : {}),
  };
}

export function framesPerSheet(level: SpriteStoryboardLevel): number {
  return level.columns * level.rows;
}

/** The sheet holding the frame shown at `time`. */
export function sheetIndexAtTime(
  level: SpriteStoryboardLevel,
  time: number,
): number {
  const frame = Math.min(
    level.frameCount - 1,
    Math.max(0, Math.floor(time / level.interval)),
  );
  return Math.floor(frame / framesPerSheet(level));
}

/**
 * The frames of one sheet, cropped from `imageUrl` (the sheet as the page
 * loaded it, token and all). The last frame of the video runs to `duration`.
 */
export function spriteSheetFrames(
  level: SpriteStoryboardLevel,
  sheetIndex: number,
  imageUrl: string,
  duration: number,
  idPrefix: string,
): StoryboardFrame[] {
  const perSheet = framesPerSheet(level);
  const first = sheetIndex * perSheet;
  const last = Math.min(level.frameCount, first + perSheet);
  const frames: StoryboardFrame[] = [];
  for (let frame = first; frame < last; frame += 1) {
    const cell = frame - first;
    const startTime = frame * level.interval;
    const endTime =
      frame === level.frameCount - 1
        ? Math.max(duration, startTime + level.interval)
        : startTime + level.interval;
    frames.push({
      id: `${idPrefix}-${frame}`,
      startTime,
      endTime,
      imageUrl,
      x: (cell % level.columns) * level.width,
      y: Math.floor(cell / level.columns) * level.height,
      width: level.width,
      height: level.height,
      sheetWidth: level.columns * level.width,
      sheetHeight: level.rows * level.height,
    });
  }
  return frames;
}
