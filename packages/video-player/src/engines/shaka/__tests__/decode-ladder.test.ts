/// <reference types="node" />
/**
 * What the decode-error ladder takes for a decode failure, and what it
 * reports of one (lecture 36, 23 Nov 2026: desktop Chrome failed with
 * PIPELINE_ERROR_DECODE at 25:55 and the player reloaded the same spot in
 * the same quality, in a loop).
 */
import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { decodeRecoveryOf, VideoEngineError } from "../../../core/errors";
import {
  browserDecodeText,
  isAppendFailure,
  isDecodeError,
  rememberedLowerHeight,
  rememberLowerHeight,
} from "../decodeLadder";

const mediaError = (message: string) =>
  new VideoEngineError({
    category: "MEDIA",
    code: "MEDIA_ERR_DECODE",
    message,
  });

describe("isDecodeError", () => {
  it("takes the video element's decode error", () => {
    assert.equal(
      isDecodeError(mediaError("PIPELINE_ERROR_DECODE: video decode error")),
      true,
    );
  });

  it("takes Shaka's report of the same failure (3016, words in its data)", () => {
    const shaka = new VideoEngineError({
      category: "MEDIA",
      code: "SHAKA_3016",
      message: "Shaka Error 3016",
      details: [3, "PIPELINE_ERROR_DECODE: video decode error"],
    });
    assert.equal(isDecodeError(shaka), true);
  });

  it("leaves network and licence failures alone", () => {
    const network = new VideoEngineError({
      category: "NETWORK",
      code: "SHAKA_1001",
      message: "Shaka Error 1001",
      details: ["https://cdn/segment_260.m4s", 404],
    });
    assert.equal(isDecodeError(network), false);
  });
});

describe("browserDecodeText and isAppendFailure", () => {
  it("keeps the browser's own words", () => {
    const error = mediaError(
      "PipelineStatus::CHUNK_DEMUXER_ERROR_APPEND_FAILED: Failed to prepare video sample for decode",
    );
    assert.match(
      browserDecodeText(error),
      /CHUNK_DEMUXER_ERROR_APPEND_FAILED/u,
    );
    // Refused as it was added, ahead of the video: placed where the buffer ends.
    assert.equal(isAppendFailure(error), true);
  });

  it("a decode failure where the video plays is not an append failure", () => {
    const error = mediaError("PIPELINE_ERROR_DECODE: video decode error");
    assert.equal(
      browserDecodeText(error),
      "PIPELINE_ERROR_DECODE: video decode error",
    );
    assert.equal(isAppendFailure(error), false);
  });
});

describe("decodeRecoveryOf", () => {
  it("finds the ladder's report among an error's data", () => {
    const report = {
      step: "step-down",
      segmentStart: 1552,
      segmentEnd: 1557.33,
      height: 1080,
      toHeight: 720,
      codec: "avc1.640028",
      browserError: "PIPELINE_ERROR_DECODE: video decode error",
      manualQuality: false,
      recentErrors: 1,
    };
    const error = new VideoEngineError({
      category: "MEDIA",
      code: "MEDIA_ERR_DECODE",
      message: "decode",
      fatal: false,
      details: [{ decodeRecovery: report }, 3],
    });
    assert.deepEqual(decodeRecoveryOf(error), report);
    assert.equal(decodeRecoveryOf(mediaError("other")), null);
  });
});

describe("staying lower for a lesson (step 3)", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
    };
  });
  afterEach(() => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  });

  it("is remembered on the device for a week, per lesson", () => {
    assert.equal(rememberedLowerHeight("lesson-36"), null);
    rememberLowerHeight("lesson-36", 720);
    assert.equal(rememberedLowerHeight("lesson-36"), 720);
    assert.equal(rememberedLowerHeight("lesson-37"), null);
    const saved = JSON.parse(
      store.get("veolms.lowerQualityLessons")!,
    ) as Record<string, { height: number; at: number }>;
    saved["lesson-36"]!.at -= 8 * 24 * 60 * 60_000;
    store.set("veolms.lowerQualityLessons", JSON.stringify(saved));
    assert.equal(rememberedLowerHeight("lesson-36"), null);
  });

  it("does nothing when storage refuses", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
    };
    assert.doesNotThrow(() => rememberLowerHeight("lesson-36", 720));
    assert.equal(rememberedLowerHeight("lesson-36"), null);
  });
});
