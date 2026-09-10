import { describe, expect, it } from "vitest";
import type { CourseOverviewResponse } from "@veolms/contracts";
import { getCourseRouteKey } from "../../src/courses/catalogue";
import {
  canPlayCourseLesson,
  getPublicPreviewLessonNumbers,
  PUBLIC_PREVIEW_LESSON_LIMIT,
} from "../../src/learning/coursePlayerAccess";
import {
  getCourseThumbnail,
  getCourseTitle,
} from "../../src/learning/courseMetadata";

const overviewWithLessons = (sections: CourseOverviewResponse["sections"]) =>
  ({
    sections,
  }) as CourseOverviewResponse;

describe("public course access", () => {
  it("allows every lesson while guest learning is enabled", () => {
    const publicPreviewLessonNumbers = new Set([1, 2]);

    expect(
      canPlayCourseLesson({
        allowGuestLearning: true,
        isAuthenticated: false,
        lessonNumber: 87,
        publicPreviewLessonNumbers,
      }),
    ).toBe(true);
  });

  it("retains preview-only access when guest learning is disabled", () => {
    const publicPreviewLessonNumbers = new Set([1, 2]);

    expect(
      canPlayCourseLesson({
        allowGuestLearning: false,
        isAuthenticated: false,
        lessonNumber: 2,
        publicPreviewLessonNumbers,
      }),
    ).toBe(true);
    expect(
      canPlayCourseLesson({
        allowGuestLearning: false,
        isAuthenticated: false,
        lessonNumber: 3,
        publicPreviewLessonNumbers,
      }),
    ).toBe(false);
  });

  it("uses the course slug for public links and falls back to the ID", () => {
    expect(
      getCourseRouteKey({
        id: "11111111-1111-4111-a111-111111111111",
        slug: "modern-javascript",
      }),
    ).toBe("modern-javascript");
    expect(getCourseRouteKey({ id: "local-course" })).toBe("local-course");
  });

  it("keeps the API backend slug mapped to the backend course identity", () => {
    expect(getCourseTitle("complete-backend-development-with-nodejs")).toBe(
      "Complete Backend Development with Node.js",
    );
    expect(
      getCourseThumbnail("complete-backend-development-with-nodejs"),
    ).toContain("nodejs");
    expect(getCourseTitle("ui-ux-design-mastery")).toBe("UI/UX Design Mastery");
  });

  it("prefers configured preview lessons and caps anonymous playback at two", () => {
    const previewLessons = getPublicPreviewLessonNumbers(
      overviewWithLessons([
        {
          id: "section-2",
          courseId: "course-1",
          title: "Second",
          position: 2,
          lessons: [
            {
              id: "lesson-4",
              courseId: "course-1",
              sectionId: "section-2",
              title: "Preview four",
              contentType: "video",
              position: 1,
              isPreview: true,
              isPublished: true,
            },
          ],
        },
        {
          id: "section-1",
          courseId: "course-1",
          title: "First",
          position: 1,
          lessons: [
            {
              id: "lesson-1",
              courseId: "course-1",
              sectionId: "section-1",
              title: "Locked one",
              contentType: "video",
              position: 1,
              isPreview: false,
              isPublished: true,
            },
            {
              id: "lesson-2",
              courseId: "course-1",
              sectionId: "section-1",
              title: "Preview two",
              contentType: "video",
              position: 2,
              isPreview: true,
              isPublished: true,
            },
            {
              id: "lesson-3",
              courseId: "course-1",
              sectionId: "section-1",
              title: "Preview three",
              contentType: "video",
              position: 3,
              isPreview: false,
              isPublished: true,
            },
          ],
        },
      ]),
    );

    expect(previewLessons).toEqual([2, 4]);
    expect(previewLessons).toHaveLength(PUBLIC_PREVIEW_LESSON_LIMIT);
  });

  it("falls back to the first two published lessons for older courses", () => {
    expect(
      getPublicPreviewLessonNumbers(
        overviewWithLessons([
          {
            id: "section-1",
            courseId: "course-1",
            title: "First",
            position: 1,
            lessons: [
              {
                id: "lesson-1",
                courseId: "course-1",
                sectionId: "section-1",
                title: "First",
                contentType: "video",
                position: 1,
                isPreview: false,
                isPublished: true,
              },
              {
                id: "lesson-2",
                courseId: "course-1",
                sectionId: "section-1",
                title: "Second",
                contentType: "video",
                position: 2,
                isPreview: false,
                isPublished: true,
              },
              {
                id: "lesson-3",
                courseId: "course-1",
                sectionId: "section-1",
                title: "Third",
                contentType: "video",
                position: 3,
                isPreview: false,
                isPublished: true,
              },
            ],
          },
        ]),
      ),
    ).toEqual([1, 2]);
    expect(getPublicPreviewLessonNumbers()).toEqual([1, 2]);
  });
});
