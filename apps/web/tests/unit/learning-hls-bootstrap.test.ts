import { describe, expect, it } from "vitest";
import {
  EARLY_HLS_PRELOAD_URL_PLACEHOLDER,
  getEarlyHlsPreloadInlineScript,
  getLearningHlsBootstrap,
  getLearningHlsPreconnectHref,
  LEARNING_HLS_MANIFEST_META_NAME,
  LEARNING_HLS_MEDIA_KEY_META_NAME,
} from "../../src/learning/learningHlsBootstrap";
import {
  getCourseVideoForLesson,
  getLessonSlug,
  resolveLessonIdentifier,
} from "../../src/learning/courseContent";

describe("learning HLS bootstrap", () => {
  it("uses the prerendered lecture's HLS URL", () => {
    const lectureSlug = getLessonSlug(5);
    const bootstrap = getLearningHlsBootstrap({
      courseSlug: "backend-nodejs",
      lectureSlug,
    });

    expect(resolveLessonIdentifier(lectureSlug)).toBe(5);
    expect(bootstrap).toEqual({
      manifestUrl: getCourseVideoForLesson(5).src,
      mediaKey: "backend-nodejs-lesson-5",
    });
    expect(bootstrap?.manifestUrl).toMatch(/\/course-hls\/.+\/master\.m3u8$/);
  });

  it("defaults a course index page to lesson 1", () => {
    expect(
      getLearningHlsBootstrap({ courseSlug: "backend-nodejs" }),
    ).toEqual({
      manifestUrl: getCourseVideoForLesson(1).src,
      mediaKey: "backend-nodejs-lesson-1",
    });
  });

  it("does not add a same-origin preconnect", () => {
    expect(getLearningHlsPreconnectHref("/course-hls/lesson/master.m3u8")).toBeNull();
    expect(
      getLearningHlsPreconnectHref(
        "https://cdn.example.com/course-hls/lesson/master.m3u8",
      ),
    ).toBe("https://cdn.example.com");
  });

  it("starts the early module only when a manifest meta tag exists", () => {
    const script = getEarlyHlsPreloadInlineScript(
      EARLY_HLS_PRELOAD_URL_PLACEHOLDER,
    );
    expect(script).toContain(LEARNING_HLS_MANIFEST_META_NAME);
    expect(script).toContain("import(");
    expect(script).toContain(EARLY_HLS_PRELOAD_URL_PLACEHOLDER);
    expect(script).not.toContain(LEARNING_HLS_MEDIA_KEY_META_NAME);
  });
});
