import { describe, expect, it } from "vitest";
import {
  getPhoneLessonDrawerCollapsedSnapPoint,
  getSideLessonDrawerBounds,
  LESSON_DRAWER_MAX_FLOATING_WIDTH,
  LESSON_DRAWER_MAX_TABLET_WIDTH,
  LESSON_DRAWER_MIN_FLOATING_WIDTH,
  LESSON_DRAWER_TABLET_GUTTER,
  PHONE_LESSON_DRAWER_TIMELINE_COVER_OFFSET,
} from "../../src/learning/useLessonDrawerHeroControl.ts";

describe("getSideLessonDrawerBounds", () => {
  it("aligns the floating curriculum drawer to the learning surface right edge", () => {
    const playerBounds = { left: 88, width: 932 };
    const bounds = getSideLessonDrawerBounds(playerBounds, 1047);

    expect(bounds).toEqual({
      left: 1020 - LESSON_DRAWER_MAX_TABLET_WIDTH,
      width: LESSON_DRAWER_MAX_TABLET_WIDTH,
    });
    expect(bounds!.left + bounds!.width).toBe(1020);
  });

  it("keeps one safety gutter when the learning surface is narrow", () => {
    const playerBounds = { left: 40, width: 420 };
    const bounds = getSideLessonDrawerBounds(playerBounds, 500);

    expect(bounds).toEqual({
      left: 40 + LESSON_DRAWER_TABLET_GUTTER,
      width: 420 - LESSON_DRAWER_TABLET_GUTTER,
    });
    expect(bounds!.left + bounds!.width).toBe(460);
  });

  it("resizes from the left while preserving the learning surface right edge", () => {
    const playerBounds = { left: 88, width: 932 };
    const widerBounds = getSideLessonDrawerBounds(
      playerBounds,
      1047,
      LESSON_DRAWER_MAX_FLOATING_WIDTH,
    );
    const narrowerBounds = getSideLessonDrawerBounds(
      playerBounds,
      1047,
      LESSON_DRAWER_MIN_FLOATING_WIDTH,
    );

    expect(widerBounds).toEqual({
      left: 1020 - LESSON_DRAWER_MAX_FLOATING_WIDTH,
      width: LESSON_DRAWER_MAX_FLOATING_WIDTH,
    });
    expect(narrowerBounds).toEqual({
      left: 1020 - LESSON_DRAWER_MIN_FLOATING_WIDTH,
      width: LESSON_DRAWER_MIN_FLOATING_WIDTH,
    });
    expect(widerBounds!.left + widerBounds!.width).toBe(1020);
    expect(narrowerBounds!.left + narrowerBounds!.width).toBe(1020);
  });
});

describe("getPhoneLessonDrawerCollapsedSnapPoint", () => {
  it("covers the player timeline by sitting 12px above the player bottom", () => {
    expect(getPhoneLessonDrawerCollapsedSnapPoint(800, 300)).toBe(
      800 - 300 + PHONE_LESSON_DRAWER_TIMELINE_COVER_OFFSET,
    );
  });

  it("falls back when the player bottom is unavailable", () => {
    expect(getPhoneLessonDrawerCollapsedSnapPoint(800, undefined, 0.72)).toBe(
      0.72,
    );
  });
});
