/// <reference types="node" />
/**
 * A lesson whose 6 s segments hold 2 s chunks, and whose manifest is marked
 * for chunk streaming on every track, is opened without a preload: a preload
 * waits for the whole first segment, a plain load starts on the first chunk.
 * Every other lesson (HLS, encrypted DASH, the 2 s-segment library, a new
 * lesson without the mark) is preloaded exactly as before. These tests hold
 * both halves.
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import type { VideoSource } from "../../../core/types";
import { isChunkStreamedDashManifest } from "../hls-inline-manifest";
import {
  getEarlyShakaPreloadSession,
  setEarlyShakaPreloadSessionForTests,
  startEarlyShakaPreload,
} from "../shaka-early-preload";
import {
  isChunkStreamedSource,
  isShakaStreamingChunks,
  type ShakaPlayerLike,
} from "../shaka-internal";

const template = (mark: string) =>
  `<SegmentTemplate timescale="15360" initialization="init.m4s" media="seg-$Number%05d$.m4s" startNumber="1"${mark}><SegmentTimeline><S t="0" d="92160" r="9" /></SegmentTimeline></SegmentTemplate>`;
const mpd = (videoMark: string, audioMark: string) =>
  `<?xml version="1.0"?><MPD xmlns="urn:mpeg:dash:schema:mpd:2011" type="static"><Period>` +
  `<AdaptationSet contentType="video">${template(videoMark)}<Representation id="h264-1080" bandwidth="500000" /></AdaptationSet>` +
  `<AdaptationSet contentType="audio">${template(audioMark)}<Representation id="aac" bandwidth="96000" /></AdaptationSet>` +
  `</Period></MPD>`;
const MARK = ' availabilityTimeOffset="4.000"';
const marked = mpd(MARK, MARK);
const unmarked = mpd("", "");
const hls = "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=500000\nv/1080.m3u8\n";

describe("telling a chunk-streamed manifest from its text", () => {
  it("is one when every track carries the mark", () => {
    assert.equal(isChunkStreamedDashManifest(marked), true);
    assert.equal(
      isChunkStreamedDashManifest(mpd(' availabilityTimeOffset="5"', MARK)),
      true,
    );
  });

  it("is not one without the mark, or with it on some tracks only", () => {
    assert.equal(isChunkStreamedDashManifest(unmarked), false);
    assert.equal(isChunkStreamedDashManifest(mpd(MARK, "")), false);
    assert.equal(isChunkStreamedDashManifest(mpd("", MARK)), false);
  });

  it("is not one when the mark is zero, negative or not a number", () => {
    for (const value of ["0", "0.000", "-1", "", "INF", "abc"]) {
      const mark = ` availabilityTimeOffset="${value}"`;
      assert.equal(isChunkStreamedDashManifest(mpd(mark, mark)), false, value);
    }
  });

  it("is not one for HLS, for no text, or for a manifest with no template", () => {
    assert.equal(isChunkStreamedDashManifest(hls), false);
    assert.equal(isChunkStreamedDashManifest(undefined), false);
    assert.equal(isChunkStreamedDashManifest(""), false);
    assert.equal(
      isChunkStreamedDashManifest(
        `<MPD><Period><AdaptationSet><Representation id="a"><BaseURL availabilityTimeOffset="4">a.mp4</BaseURL></Representation></AdaptationSet></Period></MPD>`,
      ),
      false,
    );
  });

  it("can be switched off for one source", () => {
    assert.equal(isChunkStreamedSource({ inlinedManifest: marked }), true);
    assert.equal(
      isChunkStreamedSource({
        inlinedManifest: marked,
        streaming: { lowLatencyMode: false },
      }),
      false,
    );
    assert.equal(isChunkStreamedSource({}), false);
  });

  it("goes by the file name when the manifest text did not come along", () => {
    const at = (src: string, inlinedManifest?: string) =>
      isChunkStreamedSource({ src, inlinedManifest });
    assert.equal(at("https://cdn.test/v/manifest-ll.mpd"), true);
    assert.equal(at("https://cdn.test/v/manifest-ll.mpd?v=3"), true);
    assert.equal(at("https://cdn.test/v/manifest.mpd"), false);
    assert.equal(at("https://cdn.test/v/manifest.mpd?v=ll.mpd"), false);
    assert.equal(at("https://cdn.test/v/small.mpd"), false);
    assert.equal(at("https://cdn.test/v/master-ll.m3u8"), false);
    // The text, when it is there, is what counts.
    assert.equal(at("https://cdn.test/v/manifest-ll.mpd", unmarked), false);
    assert.equal(at("https://cdn.test/v/manifest.mpd", marked), true);
    assert.equal(
      isChunkStreamedSource({
        src: "https://cdn.test/v/manifest-ll.mpd",
        streaming: { lowLatencyMode: false },
      }),
      false,
    );
  });
});

describe("asking the player whether it streams chunks", () => {
  const player = (isLowLatency: unknown, lowLatencyMode?: boolean) =>
    ({
      getManifest: () => ({ isLowLatency, variants: [] }),
      getConfiguration: () => ({ streaming: { lowLatencyMode } }),
    }) as unknown as ShakaPlayerLike;

  it("takes Shaka's word, and only a plain yes", () => {
    assert.equal(isShakaStreamingChunks(player(true, true)), true);
    assert.equal(isShakaStreamingChunks(player(false, true)), false);
    assert.equal(isShakaStreamingChunks(player(undefined, true)), false);
    assert.equal(isShakaStreamingChunks(player(true, false)), false);
  });

  it("says no for a player that cannot tell, or has nothing loaded", () => {
    assert.equal(isShakaStreamingChunks({} as ShakaPlayerLike), false);
    assert.equal(
      isShakaStreamingChunks({
        getManifest: () => null,
      } as unknown as ShakaPlayerLike),
      false,
    );
    assert.equal(
      isShakaStreamingChunks({
        getManifest: () => {
          throw new Error("between loads");
        },
      } as unknown as ShakaPlayerLike),
      false,
    );
  });
});

class StandInPlayer {
  static isBrowserSupported() {
    return true;
  }
  static made = 0;
  loading: string | null = null;
  constructor() {
    StandInPlayer.made += 1;
  }
  async preload(src: string) {
    this.loading = src;
    return { destroy: async () => undefined };
  }
  async destroy() {}
  /** A source that brings its manifest text registers a request filter. */
  getNetworkingEngine() {
    return {
      registerRequestFilter: () => undefined,
      unregisterRequestFilter: () => undefined,
      registerResponseFilter: () => undefined,
      unregisterResponseFilter: () => undefined,
    };
  }
}

function withNoOps<T extends object>(target: T): T {
  return new Proxy(target, {
    get: (object, key) =>
      key in object
        ? (object as Record<string | symbol, unknown>)[key]
        : key === "then" || key === "default"
          ? undefined
          : () => ({}),
  });
}

const runtime = withNoOps({
  Player: new Proxy(StandInPlayer, {
    construct: (Type) => withNoOps(new Type()),
  }),
  polyfill: { installAll: () => undefined },
  net: { NetworkingEngine: { RequestType: {} } },
});
const runtimeLoader = async () => runtime;

const lesson = (
  n: number,
  inlinedManifest?: string,
  kind = "dash",
): VideoSource =>
  ({
    src: `https://cdn.test/lesson-${n}/manifest.${kind === "hls" ? "m3u8" : "mpd"}`,
    id: `course-lesson-${n}`,
    type: kind,
    streaming: { segmentPrefetchLimit: 1 },
    inlinedManifest,
  }) as VideoSource;

describe("preloading the lesson being opened", () => {
  beforeEach(() => {
    (globalThis as { document?: unknown }).document = {};
    StandInPlayer.made = 0;
    setEarlyShakaPreloadSessionForTests(null);
  });
  afterEach(() => {
    setEarlyShakaPreloadSessionForTests(null);
    delete (globalThis as { document?: unknown }).document;
  });

  it("is not done for a chunk-streamed lesson: no player, nothing in the slot", async () => {
    const session = await startEarlyShakaPreload(lesson(1, marked), {
      runtimeLoader,
    });
    assert.equal(session, null);
    assert.equal(StandInPlayer.made, 0);
    assert.equal(getEarlyShakaPreloadSession(), null);
  });

  for (const [name, source] of [
    ["an unmarked DASH lesson", lesson(2, unmarked)],
    ["a half-marked DASH lesson", lesson(3, mpd(MARK, ""))],
    ["a DASH lesson whose manifest text did not come along", lesson(4)],
    ["an HLS lesson", lesson(5, hls, "hls")],
    [
      "a marked lesson with chunk streaming switched off",
      {
        ...lesson(6, marked),
        streaming: { segmentPrefetchLimit: 1, lowLatencyMode: false },
      } as VideoSource,
    ],
  ] as const) {
    it(`is done as before for ${name}`, async () => {
      const session = await startEarlyShakaPreload(source, { runtimeLoader });
      assert.ok(session?.player);
      assert.equal(StandInPlayer.made, 1);
      assert.equal(
        (session.player as unknown as StandInPlayer).loading,
        source.src,
      );
      assert.equal(getEarlyShakaPreloadSession(), session);
    });
  }

  it("still prepares a hovered or next chunk-streamed lesson ahead", async () => {
    const session = await startEarlyShakaPreload(lesson(7, marked), {
      runtimeLoader,
      speculative: true,
    });
    assert.ok(session?.player);
    assert.equal(session.speculative, true);
  });

  it("takes over a hovered chunk-streamed lesson's preload when it is opened", async () => {
    const hovered = await startEarlyShakaPreload(lesson(8, marked), {
      runtimeLoader,
      speculative: true,
    });
    const opened = await startEarlyShakaPreload(lesson(8, marked), {
      runtimeLoader,
    });
    assert.equal(opened, hovered);
    assert.equal(opened?.speculative, false);
    assert.equal(StandInPlayer.made, 1);
  });

  it("ends another lesson's preload before opening a chunk-streamed one", async () => {
    const other = await startEarlyShakaPreload(lesson(9, unmarked), {
      runtimeLoader,
    });
    assert.ok(other?.player);
    const opened = await startEarlyShakaPreload(lesson(10, marked), {
      runtimeLoader,
    });
    assert.equal(opened, null);
    assert.equal(other.consumed, true);
    assert.equal(getEarlyShakaPreloadSession(), null);
  });
});
