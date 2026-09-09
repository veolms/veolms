import { describe, expect, it } from "vitest";

import { getThumbnailAtTime } from "./getThumbnailAtTime.ts";
import { parseStoryboard, parseWebVttTimestamp } from "./parseStoryboard.ts";

const STORYBOARD_VTT = `WEBVTT

intro
00:00:00.000 --> 00:00:10.000
storyboard.jpg#xywh=0,0,160,90

00:00:12.000 --> 00:00:20.000 position:50%
storyboard.jpg#xywh=160,0,160,90
`;

describe("parseWebVttTimestamp", () => {
  it("parses WebVTT minute and hour timestamps", () => {
    expect(parseWebVttTimestamp("00:02.250")).toBe(2.25);
    expect(parseWebVttTimestamp("01:05:22.125")).toBe(3_922.125);
  });

  it("rejects invalid WebVTT timestamps", () => {
    expect(parseWebVttTimestamp("1:02.000")).toBeNull();
    expect(parseWebVttTimestamp("00:60.000")).toBeNull();
    expect(parseWebVttTimestamp("00:00:70.000")).toBeNull();
  });
});

describe("parseStoryboard", () => {
  it("parses cue identifiers, settings, and sprite coordinates", () => {
    const frames = parseStoryboard(STORYBOARD_VTT);

    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({
      startTime: 0,
      endTime: 10,
      imageUrl: "storyboard.jpg",
      x: 0,
      y: 0,
      width: 160,
      height: 90,
    });
    expect(frames[1]).toMatchObject({
      startTime: 12,
      endTime: 20,
      x: 160,
    });
  });

  it("sorts cues and ignores malformed cues without throwing", () => {
    const frames = parseStoryboard(`\uFEFFWEBVTT\r
\r
00:00:20.000 --> 00:00:30.000\r
last.jpg\r
\r
00:00:05.000 --> 00:00:04.000\r
backwards.jpg#xywh=0,0,160,90\r
\r
not a timing line\r
ignored.jpg\r
\r
00:00:00.000 --> 00:00:05.000\r
first.jpg#xywh=0,0,0,90\r
\r
00:00:10.000 --> 00:00:20.000\r
middle.jpg\r
`);

    expect(frames.map((frame) => frame.imageUrl)).toEqual([
      "middle.jpg",
      "last.jpg",
    ]);
  });
});

describe("getThumbnailAtTime", () => {
  const frames = parseStoryboard(STORYBOARD_VTT);

  it("returns the first and last matching frames", () => {
    expect(getThumbnailAtTime(frames, 0)?.x).toBe(0);
    expect(getThumbnailAtTime(frames, 19.999)?.x).toBe(160);
  });

  it("returns null for gaps, cue ends, and invalid time", () => {
    expect(getThumbnailAtTime(frames, 10)).toBeNull();
    expect(getThumbnailAtTime(frames, 11)).toBeNull();
    expect(getThumbnailAtTime(frames, 20)).toBeNull();
    expect(getThumbnailAtTime(frames, Number.NaN)).toBeNull();
  });

  it("accepts a StoryboardTrack object", () => {
    expect(getThumbnailAtTime({ frames }, 13)?.x).toBe(160);
  });

  it("normalizes unsorted manual frames and prefers the latest overlapping cue", () => {
    const manualFrames = [
      { id: "later", startTime: 5, endTime: 9, imageUrl: "later.jpg" },
      { id: "long", startTime: 0, endTime: 10, imageUrl: "long.jpg" },
    ];

    expect(getThumbnailAtTime(manualFrames, 6)?.id).toBe("later");
    expect(getThumbnailAtTime(manualFrames, 9.5)?.id).toBe("long");
  });
});
