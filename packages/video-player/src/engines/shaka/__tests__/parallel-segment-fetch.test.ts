/// <reference types="node" />
/**
 * How many segments are fetched at once. The numbers are production's of
 * 20 Nov 2026: a lesson cut into 2 s segments stopped every second or two
 * at 16× on a 200 Mbps link, because a segment the CDN did not hold took
 * 0.2-0.8 s to start arriving and they were fetched one at a time, while
 * one cut into 6 s segments nearly kept up.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  measureSegmentFetches,
  PARALLEL_SEGMENT_FETCH_MAX,
  parallelSegmentFetchCount,
  segmentPrefetchLimitFor,
  type SegmentFetchTiming,
} from "../parallel-segment-fetch";

const count = (
  rate: number,
  segmentSeconds: number,
  fetchSeconds: number | null,
  link?: { bandwidth: number; bitrate: number },
) => parallelSegmentFetchCount({ rate, segmentSeconds, fetchSeconds, ...link });

describe("how many segments to fetch at once", () => {
  it("is one at normal speeds, whatever the segment length", () => {
    for (const rate of [0.5, 1, 1.25, 1.5, 2]) {
      assert.equal(count(rate, 2, 0.5), 1, `2 s segments at ${rate}x`);
      assert.equal(count(rate, 6, 0.5), 1, `6 s segments at ${rate}x`);
    }
  });

  it("is one at any speed when segments arrive at once", () => {
    for (const rate of [1, 4, 8, 16]) {
      assert.equal(count(rate, 2, 0.03), 1);
      assert.equal(count(rate, 6, 0.03), 1);
    }
  });

  it("grows with the speed for 2 s segments that take half a second", () => {
    assert.equal(count(3, 2, 0.5), 1);
    assert.equal(count(4, 2, 0.5), 2);
    assert.equal(count(8, 2, 0.5), 3);
    assert.equal(count(16, 2, 0.5), 6);
  });

  it("needs fewer for 6 s segments", () => {
    assert.equal(count(4, 6, 0.5), 1);
    assert.equal(count(8, 6, 0.5), 1);
    assert.equal(count(16, 6, 0.5), 2);
  });

  it("stays at one while one after another still keeps up", () => {
    // 2× with 0.7 s fetches of 2 s segments: 1.4 a second come, 1 is used.
    assert.equal(count(2, 2, 0.7), 1);
    // 16× with 6 s segments uses 2.7 a second.
    assert.equal(count(16, 6, 0.25), 1);
    assert.equal(count(16, 6, 0.35), 2);
  });

  it("assumes a 0.4 s fetch until some have been timed", () => {
    assert.equal(count(1, 2, null), 1);
    assert.equal(count(2, 2, null), 1);
    assert.equal(count(16, 2, null), count(16, 2, 0.4));
    assert.equal(count(16, 2, null), 5);
  });

  it("never asks for more than the most allowed", () => {
    assert.equal(count(16, 2, 3), PARALLEL_SEGMENT_FETCH_MAX);
  });

  it("is one without a speed or a segment length", () => {
    assert.equal(count(0, 2, 0.5), 1);
    assert.equal(count(Number.NaN, 2, 0.5), 1);
    assert.equal(
      parallelSegmentFetchCount({
        rate: 16,
        segmentSeconds: null,
        fetchSeconds: 0.5,
      }),
      1,
    );
  });

  it("is not changed by a link with room to spare", () => {
    // 16× a 0.7 Mbps video is 11.2 Mbps: 28% of a 40 Mbps link.
    const link = { bandwidth: 40_000_000, bitrate: 700_000 };
    assert.equal(count(16, 2, 0.3), 4);
    assert.equal(count(16, 2, 0.3, link), 4);
  });

  it("stays at one when the link itself is what holds the video back", () => {
    // 16× a 0.7 Mbps video on a 15 Mbps link: fetching together shares
    // the same link and brings nothing sooner.
    assert.equal(
      count(16, 2, 0.5, { bandwidth: 15_000_000, bitrate: 700_000 }),
      1,
    );
    // A phone on 2 Mbps playing a 1.2 Mbps video at normal speed.
    assert.equal(
      count(1, 2, 1.5, { bandwidth: 2_000_000, bitrate: 1_200_000 }),
      1,
    );
  });
});

describe("Shaka's prefetch limit for a count", () => {
  it("is Shaka's plain one at a time for one", () => {
    assert.equal(segmentPrefetchLimitFor(1, 16), 0);
    assert.equal(segmentPrefetchLimitFor(0, 16), 0);
    assert.equal(segmentPrefetchLimitFor(4, 0), 0);
  });

  it("makes Shaka fetch exactly the count at every speed", () => {
    // Shaka 5.2.7 fetches ceil(limit × rate) segments together.
    for (const rate of [0.5, 1, 1.75, 2, 3, 4.5, 8, 11, 16]) {
      for (const wanted of [2, 3, 4, 5, 6, 7, 8]) {
        const limit = segmentPrefetchLimitFor(wanted, rate);
        assert.equal(Math.ceil(limit * rate), wanted, `${wanted} at ${rate}x`);
      }
    }
  });
});

const segment = (
  responseEnd: number,
  waitMs: number,
  bodyMs: number,
  more: Partial<SegmentFetchTiming> = {},
): SegmentFetchTiming => ({
  name: "https://cdn.example/transcoded/v/1080p/segment_0001.m4s?t=token",
  requestStart: responseEnd - bodyMs - waitMs,
  responseStart: responseEnd - bodyMs,
  responseEnd,
  encodedBodySize: 200_000,
  transferSize: 200_300,
  ...more,
});

describe("what recent segment fetches showed", () => {
  it("says nothing with fewer than three", () => {
    const measured = measureSegmentFetches(
      [segment(1_000, 300, 20), segment(2_000, 300, 20)],
      2_500,
    );
    assert.deepEqual(measured, {
      fetchSeconds: null,
      bandwidth: null,
      meanBytes: null,
    });
  });

  it("takes the slow fetches of a video the CDN holds only in part", () => {
    // Five answered from the CDN's own copy, three from storage behind it.
    const entries = [20, 20, 300, 20, 450, 20, 280, 20].map((wait, index) =>
      segment(1_000 + index * 500, wait, 20),
    );
    const measured = measureSegmentFetches(entries, 5_000);
    assert.equal(measured.fetchSeconds, 0.32);
    assert.equal(measured.meanBytes, 200_000);
  });

  it("takes the fastest download as what the link carries", () => {
    const measured = measureSegmentFetches(
      [
        segment(1_000, 300, 400),
        segment(2_000, 300, 20),
        segment(3_000, 300, 90),
      ],
      3_500,
    );
    // 200 kB in 20 ms.
    assert.equal(measured.bandwidth, 80_000_000);
  });

  it("looks at the newest eight only", () => {
    const entries = [
      ...Array.from({ length: 4 }, (_, index) =>
        segment(1_000 + index, 900, 20),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        segment(2_000 + index, 30, 20),
      ),
    ];
    assert.equal(measureSegmentFetches(entries, 3_000).fetchSeconds, 0.05);
  });

  it("leaves out what is not a media segment from the network", () => {
    const real = [
      segment(1_000, 300, 20),
      segment(2_000, 300, 20),
      segment(3_000, 300, 20),
    ];
    const others = [
      // An init segment.
      segment(3_100, 900, 5, { encodedBodySize: 1_200 }),
      // A page asset.
      segment(3_200, 900, 5, { name: "https://cdn.example/avatar.webp" }),
      // Answered from the browser's own cache.
      segment(3_300, 0, 1, { transferSize: 0 }),
      // Another origin that does not allow timing: no times given.
      segment(3_400, 900, 5, { requestStart: 0, responseStart: 0 }),
    ];
    assert.equal(
      measureSegmentFetches([...real, ...others], 4_000).fetchSeconds,
      0.32,
    );
  });

  it("leaves out fetches from more than two minutes ago", () => {
    const entries = [
      segment(1_000, 300, 20),
      segment(2_000, 300, 20),
      segment(3_000, 300, 20),
    ];
    assert.equal(measureSegmentFetches(entries, 200_000).fetchSeconds, null);
  });
});
