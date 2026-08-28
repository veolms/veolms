export interface TimelineBounds {
  left: number;
  width: number;
}

export interface TimelineRange {
  start: number;
  end: number;
}

export interface TimelineMarker<TMetadata = unknown> {
  id: string;
  time: number;
  type: string;
  label?: string;
  metadata?: TMetadata;
}

export type PositionedTimelineMarker<TMetadata = unknown> =
  TimelineMarker<TMetadata> & {
    position: number;
    positionPercent: number;
  };

export function clamp(value: number, minimum: number, maximum: number): number {
  const lowerBound = Math.min(minimum, maximum);
  const upperBound = Math.max(minimum, maximum);

  if (!Number.isFinite(value)) {
    return lowerBound;
  }

  return Math.min(upperBound, Math.max(lowerBound, value));
}

/** Converts a pointer's client X coordinate into a normalized track position. */
export function pointerPositionToRatio(
  clientX: number,
  bounds: TimelineBounds,
): number {
  if (
    !Number.isFinite(clientX) ||
    !Number.isFinite(bounds.left) ||
    !Number.isFinite(bounds.width) ||
    bounds.width <= 0
  ) {
    return 0;
  }

  return clamp((clientX - bounds.left) / bounds.width, 0, 1);
}

/** Converts a pointer's client X coordinate into a bounded media time. */
export function pointerPositionToTime(
  clientX: number,
  bounds: TimelineBounds,
  duration: number,
): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return pointerPositionToRatio(clientX, bounds) * duration;
}

export const getTimeFromPointer = pointerPositionToTime;

/** Converts media time into a normalized track position. */
export function timeToPosition(time: number, duration: number): number {
  if (!Number.isFinite(duration) || duration <= 0) {
    return 0;
  }

  return clamp(time, 0, duration) / duration;
}

export function timeToPositionPercent(time: number, duration: number): number {
  return timeToPosition(time, duration) * 100;
}

/**
 * Filters, bounds, sorts, and merges buffered ranges. Returned ranges are
 * always non-overlapping and contained by the media duration.
 */
export function normalizeBufferedRanges(
  ranges: readonly TimelineRange[],
  duration: number,
): TimelineRange[] {
  if (!Number.isFinite(duration) || duration <= 0) {
    return [];
  }

  const bounded = ranges
    .filter(
      (range) =>
        Number.isFinite(range.start) &&
        Number.isFinite(range.end) &&
        range.end > range.start,
    )
    .map((range) => ({
      start: clamp(range.start, 0, duration),
      end: clamp(range.end, 0, duration),
    }))
    .filter((range) => range.end > range.start)
    .sort((left, right) => left.start - right.start || left.end - right.end);

  const merged: TimelineRange[] = [];

  for (const range of bounded) {
    const previous = merged.at(-1);
    if (!previous || range.start > previous.end) {
      merged.push({ ...range });
      continue;
    }

    previous.end = Math.max(previous.end, range.end);
  }

  return merged;
}

/** Returns finite markers with bounded ratio and percentage positions. */
export function positionTimelineMarkers<TMetadata = unknown>(
  markers: readonly TimelineMarker<TMetadata>[],
  duration: number,
): PositionedTimelineMarker<TMetadata>[] {
  return markers
    .filter((marker) => Number.isFinite(marker.time))
    .map((marker) => {
      const position = timeToPosition(marker.time, duration);
      return {
        ...marker,
        position,
        positionPercent: position * 100,
      };
    });
}
