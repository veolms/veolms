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
import {
  appendLearningHlsCacheVersion,
  toAbsoluteLearningMediaUrl,
} from "../../src/learning/player/learningHlsConstants";
import { resolveVideoPlaybackApiUrl } from "../../src/learning/videoPlaybackBootstrap";

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

  it("bypasses stale browser caches for HLS manifests and segments", () => {
    const request = {
      type: "segment" as const,
      uris: [
        "https://cdn.example.com/course-hls/lesson/segment_00000.ts",
        "https://cdn.example.com/course-hls/lesson/index.m3u8?token=test",
      ],
    } as Parameters<typeof appendLearningHlsCacheVersion>[0];

    appendLearningHlsCacheVersion(request);

    expect(request.uris).toEqual([
      "https://cdn.example.com/course-hls/lesson/segment_00000.ts?veo_hls_cache=cors-v2",
      "https://cdn.example.com/course-hls/lesson/index.m3u8?token=test&veo_hls_cache=cors-v2",
    ]);
  });

  it("absolutizes same-origin HLS paths so Shaka does not mangle /api URLs", () => {
    const mediaId = "11111111-1111-1111-1111-111111111111";
    const relative = `/api/v1/media/${mediaId}/hls/master.m3u8`;
    expect(toAbsoluteLearningMediaUrl(relative)).toBe(
      `${window.location.origin}${relative}`,
    );
    expect(
      toAbsoluteLearningMediaUrl(
        "https://cdn.example.com/course-hls/lesson/master.m3u8",
      ),
    ).toBe("https://cdn.example.com/course-hls/lesson/master.m3u8");
  });

  it("repairs Shaka's https:/api scheme concatenation back onto the page origin", () => {
    const mediaId = "4a7042d9-e511-4ad1-9ff8-5cd452257e0a";
    const request = {
      type: "manifest" as const,
      uris: [
        `/api/v1/media/${mediaId}/hls/master.m3u8`,
        `https:/api/v1/media/${mediaId}/hls/master.m3u8`,
        "1080p/1080p.m3u8",
      ],
    } as Parameters<typeof appendLearningHlsCacheVersion>[0];

    appendLearningHlsCacheVersion(request);

    expect(request.uris).toEqual([
      `${window.location.origin}/api/v1/media/${mediaId}/hls/master.m3u8?veo_hls_cache=cors-v2`,
      `${window.location.origin}/api/v1/media/${mediaId}/hls/master.m3u8?veo_hls_cache=cors-v2`,
      "1080p/1080p.m3u8?veo_hls_cache=cors-v2",
    ]);
  });

  it("resolves playback API URLs without duplicating prefixes", () => {
    expect(
      resolveVideoPlaybackApiUrl(
        "/media/11111111-1111-1111-1111-111111111111/hls/master.m3u8",
      ),
    ).toBe("/api/v1/media/11111111-1111-1111-1111-111111111111/hls/master.m3u8");

    expect(
      resolveVideoPlaybackApiUrl(
        "/api/v1/media/11111111-1111-1111-1111-111111111111/hls/master.m3u8",
      ),
    ).toBe("/api/v1/media/11111111-1111-1111-1111-111111111111/hls/master.m3u8");

    expect(
      resolveVideoPlaybackApiUrl(
        "https://cdn.example.com/transcoded/11111111-1111-1111-1111-111111111111/master.m3u8",
      ),
    ).toBe(
      "https://cdn.example.com/transcoded/11111111-1111-1111-1111-111111111111/master.m3u8",
    );
  });
});
