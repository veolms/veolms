import { describe, expect, it } from "vitest";
import {
  courseVideos,
  formatMediaTime,
  lessonSequence,
  getLessonSlug,
  lessonIdBySlug,
  lessonSlugById,
  lessonsById,
  lessonVideoMap,
  resolveLessonIdentifier,
  resolveCourseMediaBaseUrl,
  resolveCourseVideoSrc,
  sections,
} from "../../src/learning/courseContent.js";
import {
  getCourseBrandColor,
  getCourseThumbnail,
  getCourseTitle,
} from "../../src/learning/courseMetadata.js";

describe("learning course content", () => {
  it("formats invalid, minute, and hour media durations exactly", () => {
    expect(formatMediaTime(Number.NaN)).toBe("00:00");
    expect(formatMediaTime(Number.POSITIVE_INFINITY)).toBe("00:00");
    expect(formatMediaTime(-1)).toBe("00:00");
    expect(formatMediaTime(0)).toBe("00:00");
    expect(formatMediaTime(65.9)).toBe("01:05");
    expect(formatMediaTime(4040.78)).toBe("1:07:20");
  });

  it("preserves deterministic lesson order and duration tuple strings", () => {
    expect(lessonSequence).toEqual(
      Array.from({ length: 41 }, (_, index) => index + 1),
    );
    expect([...lessonsById.keys()]).toEqual(lessonSequence);
    const lessonDurations = sections.flatMap(({ lessons }) =>
      lessons.map(([number, , duration]) => [number, duration]),
    );
    const sourceDurations = [
      [1, "09:13"],
      [2, "01:43"],
      [3, "3:04:47"],
      [4, "34:50"],
      [5, "2:25:43"],
      [6, "11:39"],
      [7, "05:12"],
      [8, "1:07:20"],
      [9, "34:50"],
      [10, "11:39"],
    ];
    expect(lessonDurations.slice(0, 10)).toEqual(sourceDurations);

    for (const [startNumber, count] of [
      [11, 6],
      [17, 7],
      [24, 8],
      [32, 5],
      [37, 5],
    ] as const) {
      expect(
        lessonDurations
          .slice(startNumber - 1, startNumber - 1 + count)
          .map(([, duration]) => duration),
      ).toEqual(
        sourceDurations.slice(0, count).map(([, duration]) => duration),
      );
    }
  });

  it("assigns stable unique lecture slugs and resolves legacy lecture IDs", () => {
    expect(getLessonSlug(3)).toBe("the-design-mindset");
    expect(getLessonSlug(13)).toBe("the-design-mindset-13");
    expect(new Set(lessonSlugById.values()).size).toBe(lessonSequence.length);
    expect(lessonIdBySlug.get("the-design-mindset")).toBe(3);
    expect(resolveLessonIdentifier("the-design-mindset")).toBe(3);
    expect(resolveLessonIdentifier("3")).toBe(3);
    expect(resolveLessonIdentifier("lecture-3")).toBe(3);
    expect(resolveLessonIdentifier("lesson-3")).toBe(3);
    expect(resolveLessonIdentifier("unknown-lecture")).toBeNull();
  });

  it("keeps encoded media paths and shared lesson media references", () => {
    expect(courseVideos).toHaveLength(8);
    expect(lessonVideoMap[1]).toMatchObject({
      fileName: "01 introduction to veolms.mp4",
      duration: 553.74,
      src: "/course-videos/01%20introduction%20to%20veolms.mp4",
    });
    expect(lessonVideoMap[4]).toBe(lessonVideoMap[9]);
    expect(lessonVideoMap[6]).toBe(lessonVideoMap[10]);
    expect(lessonVideoMap[11]).toBe(lessonVideoMap[1]);
    expect(lessonVideoMap[17]).toBe(lessonVideoMap[1]);
    expect(lessonVideoMap[24]).toBe(lessonVideoMap[1]);
    expect(lessonVideoMap[32]).toBe(lessonVideoMap[1]);
    expect(lessonVideoMap[37]).toBe(lessonVideoMap[1]);
  });

  it("builds the course-video prefix from the configured media origin", () => {
    expect(resolveCourseMediaBaseUrl()).toBe("/course-videos");
    expect(resolveCourseMediaBaseUrl("  ")).toBe("/course-videos");
    expect(
      resolveCourseMediaBaseUrl("https://media.example.cloudfront.net///"),
    ).toBe("https://media.example.cloudfront.net/course-videos");
  });

  it("joins relative and configured media prefixes without double slashes", () => {
    expect(resolveCourseVideoSrc("lesson #1.mp4", "/course-videos/")).toBe(
      "/course-videos/lesson%20%231.mp4",
    );
    expect(
      resolveCourseVideoSrc(
        "lesson #1.mp4",
        resolveCourseMediaBaseUrl("https://media.example.cloudfront.net/"),
      ),
    ).toBe(
      "https://media.example.cloudfront.net/course-videos/lesson%20%231.mp4",
    );
    expect(
      resolveCourseVideoSrc(
        "03 creating velms respository.mp4",
        resolveCourseMediaBaseUrl("https://media.example.cloudfront.net"),
      ),
    ).toBe(
      "https://media.example.cloudfront.net/course-videos/03%20creating%20velms%20respository.mp4",
    );
  });
});

describe("learning course metadata", () => {
  it("prefers known slug titles over stored fallback titles", () => {
    localStorage.setItem(
      "veolms-current-course-title",
      "Stored Academy Course",
    );

    expect(getCourseTitle("typescript-course")).toBe(
      "The Ultimate TypeScript Course",
    );
    expect(getCourseTitle("javascript-course")).toBe(
      "The Complete JavaScript Course",
    );
    expect(getCourseTitle("unknown-course")).toBe("Stored Academy Course");
  });

  it("uses the existing title and thumbnail defaults", () => {
    expect(getCourseTitle("unknown-course")).toBe("UI/UX Design Mastery");
    expect(getCourseThumbnail("unknown-course")).toBe(
      getCourseThumbnail("typescript-course"),
    );
    expect(getCourseThumbnail("ui-ux-design-mastery")).toBe(
      getCourseThumbnail("typescript-course"),
    );
    expect(getCourseThumbnail("javascript-course")).not.toBe(
      getCourseThumbnail("typescript-course"),
    );
    expect(getCourseBrandColor("javascript-course")).toBe("#F7DF1E");
    expect(getCourseBrandColor("typescript-course")).toBeUndefined();
  });
});
