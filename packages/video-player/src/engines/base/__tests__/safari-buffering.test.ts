/// <reference types="node" />
/**
 * Safari reports `stalled` (and at times `waiting`) for a streamed video
 * that plays on from its buffer, and then sends nothing that takes it back.
 * The engine kept saying "buffering" while the video played: on production
 * 83% of Safari's long-buffering reports (100% on iPhone) came with 10 s or
 * more buffered ahead and the time running on (18 Nov 2026). These tests
 * play that sequence on a stand-in `<video>`.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, it } from "node:test";

import { MediaElementEngineBase } from "../MediaElementEngineBase";

const HAVE_FUTURE_DATA = 3;

/** The bits of a `<video>` the engine reads, settable by the test. */
class StandInVideo extends EventTarget {
  paused = false;
  readyState = 4;
  currentTime = 10;
  duration = 600;
  volume = 1;
  muted = false;
  playbackRate = 1;
  defaultPlaybackRate = 1;
  error = null;
  ended = false;
  seeking = false;
  currentSrc = "";
  buffered = { length: 1, start: () => 0, end: () => 120 };
  textTracks = Object.assign(new EventTarget(), { length: 0 });
  videoWidth = 1920;
  videoHeight = 1080;
  fire(type: string) {
    this.dispatchEvent(new Event(type));
  }
}

class TestEngine extends MediaElementEngineBase {
  readonly name = "native" as const;
  async load() {}
  async unload() {}
}

let engine: TestEngine;
let video: StandInVideo;

beforeEach(async () => {
  (globalThis as { HTMLMediaElement?: unknown }).HTMLMediaElement ??= {
    HAVE_FUTURE_DATA,
  };
  engine = new TestEngine();
  video = new StandInVideo();
  await engine.attach(video as unknown as HTMLMediaElement);
  video.fire("playing");
});

afterEach(async () => {
  await engine.destroy().catch(() => undefined);
});

const buffering = () => engine.getSnapshot().buffering;

it("a `stalled` while the video still has data to play is not buffering", () => {
  video.readyState = 4; // HAVE_ENOUGH_DATA
  video.fire("stalled");
  assert.equal(buffering(), false);
});

it("a `stalled` with nothing left to play is buffering", () => {
  video.readyState = 2; // HAVE_CURRENT_DATA
  video.fire("stalled");
  assert.equal(buffering(), true);
});

it("a playhead moving on takes a buffering report back", () => {
  video.fire("waiting");
  assert.equal(buffering(), true);
  // Safari sends nothing more, but the video plays on.
  video.currentTime = 10.2;
  video.fire("timeupdate");
  assert.equal(buffering(), true, "a small step is not proof yet");
  video.currentTime = 11;
  video.fire("timeupdate");
  assert.equal(buffering(), false);
});

it("a playhead standing still keeps a real buffering report", () => {
  video.fire("waiting");
  video.fire("timeupdate");
  video.fire("timeupdate");
  assert.equal(buffering(), true);
});
