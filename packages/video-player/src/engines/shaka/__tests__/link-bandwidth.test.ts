/// <reference types="node" />
/**
 * How fast the link is, for the quality limit of a lesson's opening
 * (`start-need.ts`): from the large video segments the browser has just
 * fetched, never from small ones.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { measureLinkBandwidth } from "../start-need";

/** A segment of `kb` kilobytes whose body took `bodyMs`, ending at `end`. */
const fetched = (
  kb: number,
  bodyMs: number,
  end: number,
  over: Partial<{
    name: string;
    transferSize: number;
    requestStart: number;
  }> = {},
) => ({
  name: over.name ?? "https://cdn.test/v/h264/e01/1080/seg-00001.m4s?t=abc",
  requestStart: over.requestStart ?? end - bodyMs - 100,
  responseStart: end - bodyMs,
  responseEnd: end,
  encodedBodySize: kb * 1000,
  transferSize: over.transferSize ?? kb * 1000 + 300,
});

describe("measuring the link from the segments just fetched", () => {
  it("is null until a large segment has come from the network", () => {
    assert.equal(measureLinkBandwidth([], 10_000), null);
    // Sound and small pieces say nothing.
    assert.equal(
      measureLinkBandwidth(
        [fetched(76, 300, 2_000), fetched(120, 20, 3_000)],
        10_000,
      ),
      null,
    );
  });

  it("times a large segment from its first byte to its last", () => {
    // 1,500 kB in 6 s: 2 Mbps.
    assert.equal(
      measureLinkBandwidth([fetched(1_500, 6_000, 8_000)], 10_000),
      2_000_000,
    );
  });

  it("takes the fastest of the newest: one that shared the line was timed slow", () => {
    const entries = [
      fetched(700, 5_600, 6_000), // 1 Mbps: sound was fetched alongside
      fetched(700, 2_800, 12_000), // 2 Mbps: alone on the line
      fetched(700, 3_500, 18_000), // 1.6 Mbps
    ];
    assert.equal(measureLinkBandwidth(entries, 20_000), 2_000_000);
  });

  it("is not fooled by a small body that arrived in one burst", () => {
    const entries = [fetched(700, 2_800, 12_000), fetched(76, 2, 13_000)];
    assert.equal(measureLinkBandwidth(entries, 20_000), 2_000_000);
  });

  it("forgets what is older than a minute, and all but the last six", () => {
    assert.equal(
      measureLinkBandwidth([fetched(700, 700, 1_000)], 62_000),
      null,
    );
    const entries = [
      fetched(700, 700, 1_000), // 8 Mbps, seven segments ago
      ...Array.from({ length: 6 }, (_, k) =>
        fetched(700, 2_800, 5_000 + k * 3_000),
      ),
    ];
    assert.equal(measureLinkBandwidth(entries, 25_000), 2_000_000);
  });

  it("leaves out what the network did not carry, or the browser may not time", () => {
    const entries = [
      // From the browser's own cache.
      fetched(700, 5, 3_000, { transferSize: 0 }),
      // Another origin without timing allowed: no request start.
      fetched(700, 5, 4_000, { requestStart: 0 }),
      // Not a media segment.
      fetched(700, 5, 5_000, { name: "https://cdn.test/app/chunk-abc.js" }),
      fetched(700, 2_800, 9_000),
    ];
    assert.equal(measureLinkBandwidth(entries, 10_000), 2_000_000);
  });
});
