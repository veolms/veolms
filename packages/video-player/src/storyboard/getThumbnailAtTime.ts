import type { StoryboardFrame, StoryboardTrack } from "./storyboardTypes.ts";

function framesFrom(
  storyboard: readonly StoryboardFrame[] | StoryboardTrack,
): readonly StoryboardFrame[] {
  return Array.isArray(storyboard)
    ? storyboard
    : (storyboard as StoryboardTrack).frames;
}

const normalizedFrames = new WeakMap<object, readonly StoryboardFrame[]>();

function searchableFrames(
  storyboard: readonly StoryboardFrame[] | StoryboardTrack,
): readonly StoryboardFrame[] {
  const source = framesFrom(storyboard);
  const key = source as object;
  const cached = normalizedFrames.get(key);
  if (cached) return cached;

  const result = source
    .filter(
      (frame) =>
        Number.isFinite(frame.startTime) &&
        Number.isFinite(frame.endTime) &&
        frame.startTime >= 0 &&
        frame.endTime > frame.startTime,
    )
    .map((frame, inputIndex) => ({ frame, inputIndex }))
    .sort(
      (left, right) =>
        left.frame.startTime - right.frame.startTime ||
        left.inputIndex - right.inputIndex,
    )
    .map(({ frame }) => frame);
  normalizedFrames.set(key, result);
  return result;
}

/**
 * Returns the latest WebVTT cue containing `time`. Gaps deliberately return
 * null so consumers do not display a stale thumbnail.
 */
export function getThumbnailAtTime(
  storyboard: readonly StoryboardFrame[] | StoryboardTrack,
  time: number,
): StoryboardFrame | null {
  if (!Number.isFinite(time) || time < 0) {
    return null;
  }

  const frames = searchableFrames(storyboard);
  let low = 0;
  let high = frames.length - 1;
  let candidateIndex = -1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const frame = frames[middle];
    if (!frame) break;
    if (frame.startTime <= time) {
      candidateIndex = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  // Cues may overlap. Walk backwards from the latest possible cue so the
  // latest matching start time wins while the common path remains O(log n).
  for (let index = candidateIndex; index >= 0; index -= 1) {
    const frame = frames[index];
    if (frame && time < frame.endTime) return frame;
  }

  return null;
}
