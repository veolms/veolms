import assert from "node:assert/strict";
import { test } from "node:test";
import { pickPosterSegment, posterKeyFor } from "./poster.ts";
import type { LocalLadder } from "./source/hls.ts";

function variant(quality: string, bandwidth: number, segmentCount: number) {
  return {
    quality,
    height: Number(quality),
    bandwidth,
    resolution: "",
    codecs: null,
    playlistPath: `${quality}.m3u8`,
    segments: Array.from({ length: segmentCount }, (_, index) => ({
      file: `${quality}/segment_${index}.ts`,
      duration: 4,
    })),
  };
}

await test("the poster is taken a tenth of the way in, from the best quality", () => {
  const ladder: LocalLadder = {
    variants: [variant("360", 800_000, 50), variant("1080", 5_000_000, 50)],
    audio: null,
  };
  assert.equal(pickPosterSegment(ladder), "1080/segment_5.ts");
});

await test("a short video's poster comes from its first segment", () => {
  const ladder: LocalLadder = {
    variants: [variant("720", 2_500_000, 3)],
    audio: null,
  };
  assert.equal(pickPosterSegment(ladder), "720/segment_0.ts");
});

await test("a ladder with no segments has no poster", () => {
  assert.equal(
    pickPosterSegment({ variants: [variant("720", 1, 0)], audio: null }),
    null,
  );
  assert.equal(pickPosterSegment({ variants: [], audio: null }), null);
});

await test("an imported video's poster sits where an upload's thumbnail does", () => {
  assert.equal(
    posterKeyFor("11111111-1111-4111-8111-111111111111"),
    "public/thumbnails/11111111-1111-4111-8111-111111111111/original.webp",
  );
});
