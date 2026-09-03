import type { StoryboardFrame } from "./storyboardTypes.ts";

const TIMING_LINE_PATTERN = /^(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/;
const SPRITE_FRAGMENT_PATTERN =
  /#xywh=(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)$/i;

/** Parses a WebVTT timestamp in MM:SS.mmm or HH:MM:SS.mmm form. */
export function parseWebVttTimestamp(timestamp: string): number | null {
  const parts = timestamp.split(":");
  if (parts.length !== 2 && parts.length !== 3) {
    return null;
  }

  const secondsPart = parts.at(-1);
  if (!secondsPart) {
    return null;
  }

  const secondsMatch = /^(\d{2})(?:\.(\d{1,3}))?$/.exec(secondsPart);
  if (!secondsMatch) {
    return null;
  }

  const secondsText = secondsMatch[1];
  const millisecondsText = secondsMatch[2] ?? "";
  if (secondsText === undefined) {
    return null;
  }

  const seconds = Number(secondsText);
  const milliseconds = Number(millisecondsText.padEnd(3, "0") || "0");
  if (seconds >= 60) {
    return null;
  }

  if (parts.length === 2) {
    const minutesText = parts[0];
    if (minutesText === undefined || !/^\d{2}$/.test(minutesText)) {
      return null;
    }

    const minutes = Number(minutesText);
    if (minutes >= 60) {
      return null;
    }

    return minutes * 60 + seconds + milliseconds / 1_000;
  }

  const hoursText = parts[0];
  const minutesText = parts[1];
  if (
    hoursText === undefined ||
    minutesText === undefined ||
    !/^\d{2,}$/.test(hoursText) ||
    !/^\d{2}$/.test(minutesText)
  ) {
    return null;
  }

  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  if (!Number.isSafeInteger(hours) || minutes >= 60) {
    return null;
  }

  return hours * 3_600 + minutes * 60 + seconds + milliseconds / 1_000;
}

interface ParsedImageReference {
  imageUrl: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

function parseImageReference(reference: string): ParsedImageReference | null {
  const trimmed = reference.trim();
  if (!trimmed) {
    return null;
  }

  const fragmentIndex = trimmed
    .toLocaleLowerCase("en-US")
    .lastIndexOf("#xywh=");
  if (fragmentIndex === -1) {
    return { imageUrl: trimmed };
  }

  const fragment = trimmed.slice(fragmentIndex);
  const match = SPRITE_FRAGMENT_PATTERN.exec(fragment);
  if (!match) {
    return null;
  }

  const imageUrl = trimmed.slice(0, fragmentIndex).trim();
  const xText = match[1];
  const yText = match[2];
  const widthText = match[3];
  const heightText = match[4];
  if (
    !imageUrl ||
    xText === undefined ||
    yText === undefined ||
    widthText === undefined ||
    heightText === undefined
  ) {
    return null;
  }

  const x = Number(xText);
  const y = Number(yText);
  const width = Number(widthText);
  const height = Number(heightText);
  if (
    !Number.isFinite(x) ||
    !Number.isFinite(y) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return { imageUrl, x, y, width, height };
}

function parseCueBlock(
  block: string,
  inputIndex: number,
): StoryboardFrame | null {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return null;
  }

  const firstLine = lines[0]?.toLocaleUpperCase("en-US") ?? "";
  if (
    firstLine.startsWith("WEBVTT") ||
    firstLine.startsWith("NOTE") ||
    firstLine === "STYLE" ||
    firstLine === "REGION"
  ) {
    return null;
  }

  const timingIndex = lines.findIndex((line) => TIMING_LINE_PATTERN.test(line));
  if (timingIndex === -1) {
    return null;
  }

  const timingLine = lines[timingIndex];
  const referenceLine = lines[timingIndex + 1];
  if (timingLine === undefined || referenceLine === undefined) {
    return null;
  }

  const timingMatch = TIMING_LINE_PATTERN.exec(timingLine);
  const startText = timingMatch?.[1];
  const endText = timingMatch?.[2];
  if (startText === undefined || endText === undefined) {
    return null;
  }

  const startTime = parseWebVttTimestamp(startText);
  const endTime = parseWebVttTimestamp(endText);
  if (startTime === null || endTime === null || endTime <= startTime) {
    return null;
  }

  const image = parseImageReference(referenceLine);
  if (!image) {
    return null;
  }

  return {
    id: `storyboard-${inputIndex}-${Math.round(startTime * 1_000)}`,
    startTime,
    endTime,
    ...image,
  };
}

/** Parses valid image cues from a WebVTT storyboard document. */
export function parseStoryboard(vtt: string): StoryboardFrame[] {
  const normalizedDocument = vtt.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const blocks = normalizedDocument.split(/\n[\t ]*\n/);
  const frames: Array<{ frame: StoryboardFrame; inputIndex: number }> = [];

  blocks.forEach((block, inputIndex) => {
    const frame = parseCueBlock(block, inputIndex);
    if (frame) {
      frames.push({ frame, inputIndex });
    }
  });

  frames.sort((left, right) => {
    const byStartTime = left.frame.startTime - right.frame.startTime;
    return byStartTime === 0 ? left.inputIndex - right.inputIndex : byStartTime;
  });

  return frames.map(({ frame }, index) => ({
    ...frame,
    id: `storyboard-${index}-${Math.round(frame.startTime * 1_000)}`,
  }));
}
