import { describe, expect, it } from "vitest";
import {
  courseRouteKeyFromLessonPath,
  resolveMiniPlayerCourseId,
} from "../../src/learning/player/persistentMiniPlayerLesson";

describe("courseRouteKeyFromLessonPath", () => {
  it("reads the course key from a learning lesson path", () => {
    expect(
      courseRouteKeyFromLessonPath(
        "/learn/backend-nodejs/what-is-ui-ux-design?from=courses",
      ),
    ).toBe("backend-nodejs");
  });

  it("reads the course key from a course overview path", () => {
    expect(
      courseRouteKeyFromLessonPath("/courses/typescript-course/overview"),
    ).toBe("typescript-course");
  });
});

describe("resolveMiniPlayerCourseId", () => {
  it("uses the persistent player course while the player is minimized", () => {
    expect(
      resolveMiniPlayerCourseId({
        presentation: "mini",
        persistentCourseRouteKey: "backend-nodejs",
        persistentLessonPath: "/learn/backend-nodejs/the-design-mindset",
        miniPlayerCourseSlug: "typescript-course",
      }),
    ).toBe("backend-nodejs");
  });

  it("falls back to the standalone mini-player session", () => {
    expect(
      resolveMiniPlayerCourseId({
        presentation: "mini",
        miniPlayerCourseSlug: "figma-ui-essentials",
        miniPlayerLessonPath: "/learn/figma-ui-essentials/tools-overview",
      }),
    ).toBe("figma-ui-essentials");
  });

  it("reads the course from the mini-player lesson path when the slug is missing", () => {
    expect(
      resolveMiniPlayerCourseId({
        presentation: "full",
        miniPlayerLessonPath:
          "/learn/javascript-course/what-is-ui-ux-design?from=home",
      }),
    ).toBe("javascript-course");
  });

  it("does not treat a detached full player as the currently playing course", () => {
    expect(
      resolveMiniPlayerCourseId({
        presentation: "full",
        persistentCourseRouteKey: "backend-nodejs",
        persistentLessonPath: "/learn/backend-nodejs/the-design-mindset",
      }),
    ).toBeUndefined();
  });
});
