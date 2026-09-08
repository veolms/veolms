import { describe, expect, it } from "vitest";
import type { CourseLesson, CourseOverviewResponse } from "@veolms/contracts";
import { adaptCourseOverviewToCurriculum } from "../../src/learning/courseCurriculumAdapter";

function createMockLesson(overrides: Partial<CourseLesson> = {}): CourseLesson {
  return {
    id: "les-uuid-1",
    courseId: "course-uuid-1",
    sectionId: "sec-uuid-1",
    title: "Lesson Title",
    description: "## Default Description",
    contentType: "video",
    contentMediaId: null,
    position: 0,
    isPreview: false,
    isPublished: true,
    resources: [],
    ...overrides,
  };
}

function createMockOverview(
  sections: CourseOverviewResponse["sections"] = [],
): CourseOverviewResponse {
  return {
    course: {
      id: "course-uuid-1",
      slug: "fullstack-react",
      title: "Fullstack React",
      shortDescription: "Short desc",
      description: "Full course description",
      status: "published",
      creatorId: "creator-uuid-1",
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    sections,
    stats: {
      totalSections: sections.length,
      totalLessons: sections.reduce(
        (acc, s) => acc + (s.lessons?.length ?? 0),
        0,
      ),
      totalDurationSeconds: 3600,
    },
  };
}

describe("adaptCourseOverviewToCurriculum", () => {
  it("sorts sections by numeric position", () => {
    const overview = createMockOverview([
      {
        id: "sec-3",
        courseId: "course-uuid-1",
        title: "Section 3 (Pos 20)",
        position: 20,
        lessons: [],
      },
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1 (Pos 0)",
        position: 0,
        lessons: [],
      },
      {
        id: "sec-2",
        courseId: "course-uuid-1",
        title: "Section 2 (Pos 10)",
        position: 10,
        lessons: [],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    expect(result.sections.map((s) => s.title)).toEqual([
      "Section 1 (Pos 0)",
      "Section 2 (Pos 10)",
      "Section 3 (Pos 20)",
    ]);
    expect(result.sections.map((s) => s.id)).toEqual([1, 2, 3]);
    expect(result.sections.map((s) => s.sectionId)).toEqual([
      "sec-1",
      "sec-2",
      "sec-3",
    ]);
  });

  it("sorts lessons within each section by numeric position", () => {
    const overview = createMockOverview([
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 0,
        lessons: [
          createMockLesson({ id: "les-c", title: "Lesson C", position: 3 }),
          createMockLesson({ id: "les-a", title: "Lesson A", position: 1 }),
          createMockLesson({ id: "les-b", title: "Lesson B", position: 2 }),
        ],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    expect(result.sections[0]?.lessons.map((l) => l[1])).toEqual([
      "Lesson A",
      "Lesson B",
      "Lesson C",
    ]);
  });

  it("assigns sequential 1-based indices across the flattened lesson sequence", () => {
    const overview = createMockOverview([
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 0,
        lessons: [
          createMockLesson({ id: "les-1", title: "Sec 1 - Les 1", position: 0 }),
          createMockLesson({ id: "les-2", title: "Sec 1 - Les 2", position: 1 }),
        ],
      },
      {
        id: "sec-2",
        courseId: "course-uuid-1",
        title: "Section 2",
        position: 1,
        lessons: [
          createMockLesson({ id: "les-3", title: "Sec 2 - Les 1", position: 0 }),
          createMockLesson({ id: "les-4", title: "Sec 2 - Les 2", position: 1 }),
          createMockLesson({ id: "les-5", title: "Sec 2 - Les 3", position: 2 }),
        ],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    // Section 1 lessons: 1, 2
    expect(result.sections[0]?.lessons.map((l) => l[0])).toEqual([1, 2]);
    // Section 2 lessons: 3, 4, 5
    expect(result.sections[1]?.lessons.map((l) => l[0])).toEqual([3, 4, 5]);

    expect(result.sections[0]?.progress).toBe("0/2");
    expect(result.sections[1]?.progress).toBe("0/3");
  });

  it("lookup Map resolves each sequential index to the correct original CourseLesson", () => {
    const lesson1 = createMockLesson({
      id: "uuid-lesson-1",
      title: "First Lesson",
      description: "First description markdown",
      contentType: "video",
      isPreview: true,
      position: 0,
    });
    const lesson2 = createMockLesson({
      id: "uuid-lesson-2",
      title: "Second Lesson",
      description: "Second description markdown",
      contentType: "document",
      isPreview: false,
      position: 1,
    });

    const overview = createMockOverview([
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 0,
        lessons: [lesson1, lesson2],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    expect(result.lessonsByNumber.get(1)).toBe(lesson1);
    expect(result.lessonsByNumber.get(1)?.id).toBe("uuid-lesson-1");
    expect(result.lessonsByNumber.get(1)?.description).toBe(
      "First description markdown",
    );
    expect(result.lessonsByNumber.get(1)?.isPreview).toBe(true);
    expect(result.lessonsByNumber.get(1)?.contentType).toBe("video");

    expect(result.lessonsByNumber.get(2)).toBe(lesson2);
    expect(result.lessonsByNumber.get(2)?.id).toBe("uuid-lesson-2");
    expect(result.lessonsByNumber.get(2)?.description).toBe(
      "Second description markdown",
    );
    expect(result.lessonsByNumber.get(2)?.isPreview).toBe(false);
    expect(result.lessonsByNumber.get(2)?.contentType).toBe("document");
  });

  it("totalLessons returns the accurate count of all lessons", () => {
    const overview = createMockOverview([
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 0,
        lessons: [
          createMockLesson({ id: "les-1", position: 0 }),
          createMockLesson({ id: "les-2", position: 1 }),
        ],
      },
      {
        id: "sec-2",
        courseId: "course-uuid-1",
        title: "Section 2",
        position: 1,
        lessons: [createMockLesson({ id: "les-3", position: 0 })],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);
    expect(result.totalLessons).toBe(3);
  });

  it("handles empty curriculum safely", () => {
    const emptyOverview = createMockOverview([]);
    const result = adaptCourseOverviewToCurriculum(emptyOverview);

    expect(result.sections).toEqual([]);
    expect(result.lessonsByNumber.size).toBe(0);
    expect(result.totalLessons).toBe(0);
  });

  it("handles empty sections safely and maintains sequential numbering for subsequent sections", () => {
    const overview = createMockOverview([
      {
        id: "sec-empty-1",
        courseId: "course-uuid-1",
        title: "Empty Section 1",
        position: 0,
        lessons: [],
      },
      {
        id: "sec-with-lessons",
        courseId: "course-uuid-1",
        title: "Active Section 2",
        position: 1,
        lessons: [createMockLesson({ id: "les-1", position: 0 })],
      },
      {
        id: "sec-empty-3",
        courseId: "course-uuid-1",
        title: "Empty Section 3",
        position: 2,
        lessons: [],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    expect(result.sections.length).toBe(3);
    expect(result.sections[0]?.lessons).toEqual([]);
    expect(result.sections[0]?.progress).toBe("0/0");

    // The single lesson receives index 1
    expect(result.sections[1]?.lessons[0]?.[0]).toBe(1);
    expect(result.sections[1]?.progress).toBe("0/1");

    expect(result.sections[2]?.lessons).toEqual([]);
    expect(result.sections[2]?.progress).toBe("0/0");

    expect(result.totalLessons).toBe(1);
  });

  it("preserves Markdown descriptions exactly, including null and empty string", () => {
    const richMarkdown = `## Getting Started
Here is a list:
- Point 1
- Point 2

\`\`\`javascript
const answer = 42;
\`\`\`
`;
    const overview = createMockOverview([
      {
        id: "sec-1",
        courseId: "course-uuid-1",
        title: "Section 1",
        position: 0,
        lessons: [
          createMockLesson({ id: "les-rich", description: richMarkdown, position: 0 }),
          createMockLesson({ id: "les-null", description: null, position: 1 }),
          createMockLesson({ id: "les-empty", description: "", position: 2 }),
        ],
      },
    ]);

    const result = adaptCourseOverviewToCurriculum(overview);

    expect(result.lessonsByNumber.get(1)?.description).toBe(richMarkdown);
    expect(result.lessonsByNumber.get(2)?.description).toBeNull();
    expect(result.lessonsByNumber.get(3)?.description).toBe("");
  });

  it("does not mutate the input CourseOverviewResponse", () => {
    const rawLessonB = createMockLesson({ id: "les-b", position: 10 });
    const rawLessonA = createMockLesson({ id: "les-a", position: 5 });
    const rawSection2 = {
      id: "sec-2",
      courseId: "course-uuid-1",
      title: "Section 2",
      position: 10,
      lessons: [rawLessonB, rawLessonA],
    };
    const rawSection1 = {
      id: "sec-1",
      courseId: "course-uuid-1",
      title: "Section 1",
      position: 5,
      lessons: [],
    };

    const overview = createMockOverview([rawSection2, rawSection1]);

    // Freeze arrays to assert that any in-place mutation attempts would throw
    Object.freeze(overview.sections);
    Object.freeze(rawSection2.lessons);
    Object.freeze(rawSection1.lessons);

    const result = adaptCourseOverviewToCurriculum(overview);

    // Original sections order in input must remain untouched (sec-2 then sec-1)
    expect(overview.sections[0]?.id).toBe("sec-2");
    expect(overview.sections[1]?.id).toBe("sec-1");

    // Original lessons order in rawSection2 must remain untouched (les-b then les-a)
    expect(rawSection2.lessons[0]?.id).toBe("les-b");
    expect(rawSection2.lessons[1]?.id).toBe("les-a");

    // Result must be sorted correctly
    expect(result.sections[0]?.sectionId).toBe("sec-1");
    expect(result.sections[1]?.sectionId).toBe("sec-2");
    expect(result.sections[1]?.lessons[0]?.[1]).toBe(rawLessonA.title);
    expect(result.sections[1]?.lessons[1]?.[1]).toBe(rawLessonB.title);
  });
});
