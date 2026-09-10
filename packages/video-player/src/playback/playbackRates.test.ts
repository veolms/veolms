import { describe, expect, it } from "vitest";
import {
  MAX_CUSTOM_PLAYBACK_RATE,
  MIN_CUSTOM_PLAYBACK_RATE,
  getKeyboardPlaybackRate,
} from "./playbackRates";

describe("keyboard playback-rate steps", () => {
  it("moves by exactly 0.25× from preset and custom rates", () => {
    expect(getKeyboardPlaybackRate(1, -1)).toBe(0.75);
    expect(getKeyboardPlaybackRate(1, 1)).toBe(1.25);
    expect(getKeyboardPlaybackRate(1.1, -1)).toBe(0.85);
    expect(getKeyboardPlaybackRate(1.1, 1)).toBe(1.35);
  });

  it("stays inside the player's supported playback-rate range", () => {
    expect(getKeyboardPlaybackRate(MIN_CUSTOM_PLAYBACK_RATE, -1)).toBe(
      MIN_CUSTOM_PLAYBACK_RATE,
    );
    expect(getKeyboardPlaybackRate(MAX_CUSTOM_PLAYBACK_RATE, 1)).toBe(
      MAX_CUSTOM_PLAYBACK_RATE,
    );
  });
});
