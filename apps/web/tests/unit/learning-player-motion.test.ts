import { describe, expect, it } from "vitest";
import {
  easeLearningPlayerMotionProgress,
  getLearningBackgroundMotionState,
  getLearningMiniPlayerWidthBounds,
} from "../../src/learning/player/learningPlayerMotion.js";

describe("learning player surface motion", () => {
  it.each([
    [300, false, 1, 0],
    [350, false, 0.5, 0],
    [379, false, 0.21, 0],
    [380, true, 0.2, 0],
    [400, true, 0, 0],
    [450, true, 0, 0.25],
    [500, true, 0, 0.5],
    [550, true, 0, 0.75],
    [600, true, 0, 1],
    [800, true, 0, 1],
  ])(
    "maps a video bottom at %ipx to mount=%s, content=%s, and background=%s",
    (videoBottom, shouldMount, contentOpacity, revealProgress) => {
      const state = getLearningBackgroundMotionState(videoBottom, 1_000, {
        contentFadeStartViewportProgress: 0.3,
      });
      expect(state.shouldMount).toBe(shouldMount);
      expect(state.viewportProgress).toBeCloseTo(videoBottom / 1_000);
      expect(state.contentOpacity).toBeCloseTo(contentOpacity);
      expect(state.revealProgress).toBeCloseTo(revealProgress);
    },
  );

  it("hands off immediately without overlapping lesson and return content", () => {
    for (let videoBottom = 300; videoBottom <= 1_000; videoBottom += 5) {
      const state = getLearningBackgroundMotionState(videoBottom, 1_000, {
        contentFadeStartViewportProgress: 0.3,
      });
      expect(state.contentOpacity * state.revealProgress).toBe(0);
    }

    expect(
      getLearningBackgroundMotionState(401, 1_000, {
        contentFadeStartViewportProgress: 0.3,
      }).revealProgress,
    ).toBeGreaterThan(0);
  });

  it("measures thresholds from the visual viewport top", () => {
    expect(
      getLearningBackgroundMotionState(700, 1_000, {
        contentFadeStartViewportProgress: 0.3,
        viewportTop: 200,
      }),
    ).toMatchObject({
      contentOpacity: 0,
      revealProgress: 0.5,
      shouldMount: true,
      viewportProgress: 0.5,
    });
  });

  it("matches the player easing while preserving exact endpoints", () => {
    expect(easeLearningPlayerMotionProgress(0)).toBe(0);
    expect(easeLearningPlayerMotionProgress(0.5)).toBeGreaterThan(0.8);
    expect(easeLearningPlayerMotionProgress(1)).toBe(1);
  });

  it("keeps the mini-player minimum at 200px without changing its maximum", () => {
    expect(
      getLearningMiniPlayerWidthBounds({
        height: 779,
        left: 0,
        top: 0,
        width: 619,
      }),
    ).toEqual({ maximumWidth: 595, minimumWidth: 200 });
    expect(
      getLearningMiniPlayerWidthBounds({
        height: 800,
        left: 0,
        top: 0,
        width: 1_280,
      }),
    ).toEqual({ maximumWidth: 1_256, minimumWidth: 200 });
  });
});
