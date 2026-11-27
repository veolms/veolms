/// <reference types="node" />
/**
 * When a fast video keeps standing still, and whose doing it is. Numbers
 * from Chrome 158 on 2026-11-21: at 16x a lesson stood still about 1.1 s at
 * a time, Chrome holding only the frame on screen (readyState 2), with
 * minutes downloaded; with the page run 6 times slower it stood still most
 * of the time with 0-3 s downloaded.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  PlaybackStrainDetector,
  STRAIN_GRACE_MS,
  STRAIN_WINDOW_MS,
  type PlaybackStrainReport,
  type PlaybackStrainSample,
} from "../playbackStrain";

const TICK_MS = 250;

/**
 * Plays `seconds` at `rate`, standing still (readyState 2) during each of
 * `stills` ([start ms, length ms] from the start), and returns what the
 * detector said at each tick that said something.
 */
function play(
  detector: PlaybackStrainDetector,
  options: {
    seconds: number;
    rate?: number;
    stills?: [number, number][];
    /** Seconds downloaded ahead, or per tick. */
    ahead?: number | ((t: number) => number);
    startAt?: number;
    readyStateWhenStill?: number;
    hidden?: boolean;
  },
): ({ at: number } & PlaybackStrainReport)[] {
  const rate = options.rate ?? 16;
  const start = options.startAt ?? 0;
  const said: ({ at: number } & PlaybackStrainReport)[] = [];
  let currentTime = 0;
  for (let t = 0; t <= options.seconds * 1000; t += TICK_MS) {
    const still = (options.stills ?? []).some(
      ([from, length]) => t > from && t <= from + length,
    );
    if (t > 0 && !still) currentTime += (rate * TICK_MS) / 1000;
    const ahead =
      typeof options.ahead === "function"
        ? options.ahead(t)
        : (options.ahead ?? 300);
    const sample: PlaybackStrainSample = {
      now: start + t,
      currentTime,
      rate,
      playing: true,
      readyState: still ? (options.readyStateWhenStill ?? 2) : 4,
      aheadSeconds: ahead,
      hidden: options.hidden ?? false,
    };
    const report = detector.sample(sample);
    if (report !== null) said.push({ at: t, ...report });
  }
  return said;
}

const twoStops: [number, number][] = [
  [4_000, 1_100],
  [9_000, 1_100],
];

describe("a fast video that keeps standing still", () => {
  it("is reported at the second stop within 30 s", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, { seconds: 20, stills: twoStops });
    assert.equal(said.length, 1);
    assert.equal(said[0]!.stops, 2);
    assert.ok(said[0]!.at > 9_000 && said[0]!.at <= 9_750);
  });

  it("is reported once, not at every stop after", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, {
      seconds: 25,
      stills: [
        [4_000, 1_100],
        [9_000, 1_100],
        [14_000, 1_100],
        [19_000, 1_100],
      ],
    });
    assert.equal(said.length, 1);
  });

  it("is not reported for one stop", () => {
    const detector = new PlaybackStrainDetector();
    assert.deepEqual(
      play(detector, { seconds: 20, stills: [[4_000, 1_100]] }),
      [],
    );
  });

  it("is not reported for stops further apart than 30 s", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, {
      seconds: 50,
      stills: [
        [4_000, 1_100],
        [4_000 + STRAIN_WINDOW_MS + 2_000, 1_100],
      ],
    });
    assert.deepEqual(said, []);
  });

  it("is not reported for short hitches", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, {
      seconds: 20,
      stills: [
        [4_000, 300],
        [6_000, 300],
        [8_000, 300],
      ],
    });
    assert.deepEqual(said, []);
  });
});

describe("whose doing it is", () => {
  it("the device's, with plenty downloaded", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, { seconds: 20, stills: twoStops, ahead: 300 });
    assert.equal(said[0]?.cause, "device");
  });

  it("loading's, with little downloaded", () => {
    const detector = new PlaybackStrainDetector();
    const said = play(detector, { seconds: 20, stills: twoStops, ahead: 2 });
    assert.equal(said.length, 1);
    assert.equal(said[0]!.cause, "loading");
  });

  it("goes by what was downloaded when each stop began", () => {
    // Plenty ahead until the stops begin, then nothing while it waits: a
    // device stop. Nothing before the stop: a loading stop.
    const detector = new PlaybackStrainDetector();
    const said = play(detector, {
      seconds: 20,
      stills: twoStops,
      ahead: (t) => (twoStops.some(([from]) => t > from) ? 0 : 300),
    });
    assert.equal(said[0]?.cause, "device");
  });
});

describe("what is not reported", () => {
  it("standing still with the next frames ready (a pause in the page)", () => {
    const detector = new PlaybackStrainDetector();
    assert.deepEqual(
      play(detector, { seconds: 20, stills: twoStops, readyStateWhenStill: 4 }),
      [],
    );
  });

  it("stops at normal speeds", () => {
    for (const rate of [1, 1.5, 2]) {
      for (const ahead of [300, 1]) {
        const detector = new PlaybackStrainDetector();
        assert.deepEqual(
          play(detector, { seconds: 20, stills: twoStops, rate, ahead }),
          [],
          `at ${rate}x with ${ahead} s ahead`,
        );
      }
    }
  });

  it("a hidden page", () => {
    const detector = new PlaybackStrainDetector();
    assert.deepEqual(
      play(detector, { seconds: 20, stills: twoStops, hidden: true }),
      [],
    );
  });

  it("the first moments after a start, a seek or a speed change", () => {
    const detector = new PlaybackStrainDetector();
    detector.reset(0);
    const said = play(detector, {
      seconds: 20,
      stills: [
        [0, STRAIN_GRACE_MS - 500],
        [9_000, 1_100],
      ],
    });
    assert.deepEqual(said, []);
  });
});

describe("starting over", () => {
  it("forgets earlier stops", () => {
    const detector = new PlaybackStrainDetector();
    play(detector, { seconds: 7, stills: [[4_000, 1_100]] });
    detector.reset(7_000);
    const said = play(detector, {
      seconds: 12,
      startAt: 7_000,
      stills: [[5_000, 1_100]],
    });
    assert.deepEqual(said, []);
  });

  it("can report again after a reset", () => {
    const detector = new PlaybackStrainDetector();
    assert.equal(play(detector, { seconds: 20, stills: twoStops }).length, 1);
    detector.reset(20_000);
    assert.equal(
      play(detector, { seconds: 20, startAt: 20_000, stills: twoStops }).length,
      1,
    );
  });
});
