/// <reference types="node" />
/**
 * A lesson's opening is several times heavier than its average, which is
 * all a manifest's `bandwidth` says. The publish step states what each size
 * needs for the opening, and automatic quality goes no higher than the
 * tallest size the connection is known to carry until the opening is over.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  DASH_START_NEED_SCHEME,
  readDashStartNeeds,
  startNeedEnd,
  startNeedMaxHeight,
} from "../start-need";

const representation = (
  height: number,
  bandwidth: number,
  need?: string,
): string =>
  `<Representation id="h264-${height}" mimeType="video/mp4" bandwidth="${bandwidth}" width="${Math.round((height * 16) / 9)}" height="${height}">` +
  (need === undefined
    ? ""
    : `<SupplementalProperty schemeIdUri="${DASH_START_NEED_SCHEME}" value="${need}" />`) +
  `<BaseURL>h264/e01/${height}/</BaseURL></Representation>`;
const mpd = (...representations: string[]): string =>
  `<MPD><Period><AdaptationSet contentType="video">${representations.join("")}</AdaptationSet>` +
  `<AdaptationSet contentType="audio"><Representation id="aac-96" mimeType="audio/mp4" bandwidth="125837" /></AdaptationSet></Period></MPD>`;

/** Data Types (JavaScript lesson 6), as published on 24 Nov 2026. */
const dataTypes = mpd(
  representation(1080, 439606, "2134672,42"),
  representation(720, 217018, "958359,42"),
  representation(480, 119519, "440194,42"),
  representation(360, 85334, "268786,42"),
);
const AUDIO = 125_837;

describe("reading what a lesson's opening needs", () => {
  it("reads each size's need, shortest picture first", () => {
    assert.deepEqual(readDashStartNeeds(dataTypes), [
      { height: 360, bandwidth: 268786, seconds: 42 },
      { height: 480, bandwidth: 440194, seconds: 42 },
      { height: 720, bandwidth: 958359, seconds: 42 },
      { height: 1080, bandwidth: 2134672, seconds: 42 },
    ]);
    assert.equal(startNeedEnd(readDashStartNeeds(dataTypes)), 42);
  });

  it("finds nothing in a manifest that states none (every older lesson)", () => {
    assert.deepEqual(readDashStartNeeds(mpd(representation(1080, 439606))), []);
    assert.deepEqual(readDashStartNeeds(undefined), []);
    assert.deepEqual(readDashStartNeeds("#EXTM3U\n"), []);
    assert.equal(startNeedEnd([]), 0);
  });

  it("skips a size without the property and one whose value is not two numbers", () => {
    const needs = readDashStartNeeds(
      mpd(
        representation(1080, 439606, "2134672,42"),
        representation(720, 217018),
        representation(480, 119519, "abc"),
        representation(360, 85334, "0,42"),
      ),
    );
    assert.deepEqual(needs, [
      { height: 1080, bandwidth: 2134672, seconds: 42 },
    ]);
  });

  it("does not read another Representation's property as its own", () => {
    const needs = readDashStartNeeds(
      mpd(
        representation(720, 217018),
        representation(1080, 439606, "2134672,42"),
      ),
    );
    assert.deepEqual(needs, [
      { height: 1080, bandwidth: 2134672, seconds: 42 },
    ]);
  });
});

describe("the tallest picture for the opening", () => {
  const needs = readDashStartNeeds(dataTypes);

  it("holds nothing back on a connection never measured", () => {
    assert.equal(startNeedMaxHeight(needs, null, AUDIO), null);
    assert.equal(startNeedMaxHeight(needs, 0, AUDIO), null);
  });

  it("holds nothing back when the tallest size fits", () => {
    // 1080p needs 2.13 Mbps + 0.13 Mbps of sound within 85% of the line.
    assert.equal(startNeedMaxHeight(needs, 5_000_000, AUDIO), null);
    assert.equal(startNeedMaxHeight(needs, 2_700_000, AUDIO), null);
  });

  it("gives 720p on a 2 Mbps line, where 1080p would stall", () => {
    assert.equal(startNeedMaxHeight(needs, 2_000_000, AUDIO), 720);
    assert.equal(startNeedMaxHeight(needs, 1_600_000, AUDIO), 720);
    assert.equal(startNeedMaxHeight(needs, 2_600_000, AUDIO), 720);
  });

  it("goes down with the connection, never below the shortest size", () => {
    assert.equal(startNeedMaxHeight(needs, 1_000_000, AUDIO), 480);
    assert.equal(startNeedMaxHeight(needs, 600_000, AUDIO), 360);
    assert.equal(startNeedMaxHeight(needs, 200_000, AUDIO), 360);
  });

  it("has nothing to say for a lesson that states no need", () => {
    assert.equal(startNeedMaxHeight([], 500_000, AUDIO), null);
  });
});
