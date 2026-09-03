import { describe, expect, it } from "vitest";
import {
  easeLearningPlayerMotionProgress,
  getDefaultLearningMiniPlayerLayout,
  getLearningBackgroundMotionState,
  getLearningMiniPlayerPointerResizeLayout,
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

  it.each([
    [320, 200],
    [640, 200],
    [641, 260],
    [1_023, 260],
    [1_024, 320],
    [1_440, 320],
  ])(
    "uses a %ipx-wide viewport to select a %ipx mini player",
    (viewportWidth, expectedWidth) => {
      expect(
        getDefaultLearningMiniPlayerLayout(Number.POSITIVE_INFINITY, {
          height: 900,
          left: 0,
          top: 0,
          width: viewportWidth,
        }).width,
      ).toBe(expectedWidth);
    },
  );

  it("uses a remembered user width while retaining viewport padding", () => {
    expect(
      getDefaultLearningMiniPlayerLayout(
        Number.POSITIVE_INFINITY,
        { height: 900, left: 0, top: 0, width: 640 },
        248,
      ).width,
    ).toBe(248);
    expect(
      getDefaultLearningMiniPlayerLayout(
        Number.POSITIVE_INFINITY,
        { height: 900, left: 0, top: 0, width: 320 },
        500,
      ),
    ).toMatchObject({ left: 12, width: 296 });
  });

  it.each([
    ["w", -60, 0, { left: 240, top: 283.125, width: 360 }],
    ["e", 60, 0, { left: 300, top: 283.125, width: 360 }],
    ["n", 0, -33.75, { left: 270, top: 266.25, width: 360 }],
    ["s", 0, 33.75, { left: 270, top: 300, width: 360 }],
    ["nw", -60, -33.75, { left: 240, top: 266.25, width: 360 }],
    ["se", 60, 33.75, { left: 300, top: 300, width: 360 }],
  ] as const)(
    "resizes from the %s handle while preserving the opposite anchor",
    (edges, deltaX, deltaY, expectedLayout) => {
      expect(
        getLearningMiniPlayerPointerResizeLayout(
          { left: 300, top: 300, width: 300 },
          edges,
          deltaX,
          deltaY,
          { height: 800, left: 0, top: 0, width: 1_000 },
        ),
      ).toEqual(expectedLayout);
    },
  );

  it("keeps pointer resizing inside the viewport padding", () => {
    expect(
      getLearningMiniPlayerPointerResizeLayout(
        { left: 12, top: 12, width: 300 },
        "nw",
        -1_000,
        -1_000,
        { height: 600, left: 0, top: 0, width: 640 },
      ),
    ).toMatchObject({ left: 12, top: 12, width: 616 });
  });
});
