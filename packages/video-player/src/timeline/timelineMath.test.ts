import { describe, expect, it } from "vitest";

import {
  clamp,
  normalizeBufferedRanges,
  pointerPositionToRatio,
  pointerPositionToTime,
  positionTimelineMarkers,
  timeToPosition,
  timeToPositionPercent,
} from "./timelineMath.ts";

describe("clamp", () => {
  it("bounds values and tolerates reversed limits", () => {
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(4, 0, 10)).toBe(4);
    expect(clamp(20, 0, 10)).toBe(10);
    expect(clamp(4, 10, 0)).toBe(4);
    expect(clamp(Number.NaN, 2, 8)).toBe(2);
  });
});

describe("pointer timeline conversion", () => {
  const bounds = { left: 100, width: 200 };

  it("converts pointer position to a bounded ratio", () => {
    expect(pointerPositionToRatio(100, bounds)).toBe(0);
    expect(pointerPositionToRatio(150, bounds)).toBe(0.25);
    expect(pointerPositionToRatio(350, bounds)).toBe(1);
    expect(pointerPositionToRatio(50, bounds)).toBe(0);
  });

  it("converts pointer position to time and handles unusable geometry", () => {
    expect(pointerPositionToTime(150, bounds, 120)).toBe(30);
    expect(pointerPositionToTime(150, bounds, 0)).toBe(0);
    expect(pointerPositionToTime(150, { left: 100, width: 0 }, 120)).toBe(0);
  });
});

describe("time timeline conversion", () => {
  it("bounds ratio and percentage positions", () => {
    expect(timeToPosition(30, 120)).toBe(0.25);
    expect(timeToPosition(-5, 120)).toBe(0);
    expect(timeToPosition(125, 120)).toBe(1);
    expect(timeToPosition(5, 0)).toBe(0);
    expect(timeToPositionPercent(30, 120)).toBe(25);
  });
});

describe("normalizeBufferedRanges", () => {
  it("filters, clamps, sorts, and merges overlapping or touching ranges", () => {
    expect(
      normalizeBufferedRanges(
        [
          { start: 8, end: 15 },
          { start: -4, end: 2 },
          { start: 2, end: 5 },
          { start: 4, end: 10 },
          { start: 40, end: 50 },
          { start: 25, end: 24 },
          { start: Number.NaN, end: 30 },
        ],
        20,
      ),
    ).toEqual([{ start: 0, end: 15 }]);
  });

  it("returns no ranges for a zero or invalid duration", () => {
    expect(normalizeBufferedRanges([{ start: 0, end: 1 }], 0)).toEqual([]);
    expect(normalizeBufferedRanges([{ start: 0, end: 1 }], Number.NaN)).toEqual(
      [],
    );
  });
});

describe("positionTimelineMarkers", () => {
  it("positions generic markers and filters invalid times", () => {
    const markers = positionTimelineMarkers(
      [
        { id: "before", time: -5, type: "note" },
        { id: "middle", time: 5, type: "quiz", metadata: { required: true } },
        { id: "after", time: 15, type: "chapter" },
        { id: "invalid", time: Number.NaN, type: "bookmark" },
      ],
      10,
    );

    expect(
      markers.map(({ id, position, positionPercent }) => ({
        id,
        position,
        positionPercent,
      })),
    ).toEqual([
      { id: "before", position: 0, positionPercent: 0 },
      { id: "middle", position: 0.5, positionPercent: 50 },
      { id: "after", position: 1, positionPercent: 100 },
    ]);
    expect(markers[1]?.metadata).toEqual({ required: true });
  });
});
