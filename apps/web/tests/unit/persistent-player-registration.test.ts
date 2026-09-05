import { describe, expect, it } from "vitest";
import {
  shouldDemoteDetachedPersistentPlayer,
  shouldRestoreMiniPlayerForMatchingCourse,
} from "../../src/learning/player/persistentPlayerRegistration";

describe("persistent player registration cleanup", () => {
  it("does not demote an immediately restored player when stale cleanup runs", () => {
    let restoreVersion = 0;
    const restoreVersionAtRegistration = restoreVersion;

    // The first mini-player touch restores before the outgoing route's queued
    // registration cleanup gets its microtask.
    restoreVersion += 1;

    expect(
      shouldDemoteDetachedPersistentPlayer({
        presentation: "full",
        restoreVersionAtRegistration,
        currentRestoreVersion: restoreVersion,
      }),
    ).toBe(false);
  });

  it("still demotes an untouched full registration after its route unmounts", () => {
    expect(
      shouldDemoteDetachedPersistentPlayer({
        presentation: "full",
        restoreVersionAtRegistration: 3,
        currentRestoreVersion: 3,
      }),
    ).toBe(true);
  });

  it("restores the mini player when the same course is opened again", () => {
    expect(
      shouldRestoreMiniPlayerForMatchingCourse({
        presentation: "mini",
        activeCourseRouteKey: "backend-nodejs",
        requestedCourseRouteKey: "backend-nodejs",
      }),
    ).toBe(true);
  });

  it("does not restore when a different course is opened from the mini player", () => {
    expect(
      shouldRestoreMiniPlayerForMatchingCourse({
        presentation: "mini",
        activeCourseRouteKey: "backend-nodejs",
        requestedCourseRouteKey: "typescript",
      }),
    ).toBe(false);
  });
});
