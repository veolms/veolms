/// <reference types="node" />
/**
 * A lesson cut into CMAF chunks marks its manifest as low-latency so that
 * Shaka streams the chunks. Shaka then applies its own live-stream settings
 * on every load unless it was given others; this engine gives it none to
 * apply, so the settings a source asked for stay in force.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { VideoSource } from "../../../core/types";
import {
  configureShakaPlayer,
  type ShakaPlayerLike,
  type ShakaRuntimeLike,
} from "../shaka-internal";

const source = {
  url: "https://cdn.example.test/lesson/manifest.mpd",
  streaming: { segmentPrefetchLimit: 0, rebufferingGoal: 1.5 },
} as unknown as VideoSource;
const runtime = {} as unknown as ShakaRuntimeLike;

function fakePlayer(withLowLatencyHook: boolean) {
  const calls: Array<[string, unknown]> = [];
  const player = {
    resetConfiguration: () => calls.push(["reset", undefined]),
    configure: (configuration: unknown) => {
      calls.push(["configure", configuration]);
      return true;
    },
    ...(withLowLatencyHook
      ? {
          configurationForLowLatency: (configuration: unknown) =>
            calls.push(["lowLatency", configuration]),
        }
      : {}),
  } as unknown as ShakaPlayerLike;
  return { player, calls };
}

describe("settings on a low-latency (chunked) manifest", () => {
  it("gives Shaka nothing of its own to apply, before configuring", () => {
    const { player, calls } = fakePlayer(true);
    assert.equal(configureShakaPlayer(player, source, runtime), true);
    const names = calls.map(([name]) => name);
    assert.deepEqual(names, ["reset", "lowLatency", "configure"]);
    assert.deepEqual(calls[1]?.[1], {});
  });

  it("keeps the source's own prefetch limit in what it configures", () => {
    const { player, calls } = fakePlayer(true);
    configureShakaPlayer(player, source, runtime);
    const configured = calls.find(([name]) => name === "configure")?.[1] as {
      streaming: { segmentPrefetchLimit: number; rebufferingGoal: number };
    };
    assert.equal(configured.streaming.segmentPrefetchLimit, 0);
    assert.equal(configured.streaming.rebufferingGoal, 1.5);
  });

  it("does it again when the configuration is not reset", () => {
    const { player, calls } = fakePlayer(true);
    configureShakaPlayer(player, source, runtime, { reset: false });
    assert.deepEqual(
      calls.map(([name]) => name),
      ["lowLatency", "configure"],
    );
  });

  it("works with a player that has no such setting", () => {
    const { player, calls } = fakePlayer(false);
    assert.equal(configureShakaPlayer(player, source, runtime), true);
    assert.deepEqual(
      calls.map(([name]) => name),
      ["reset", "configure"],
    );
  });
});
