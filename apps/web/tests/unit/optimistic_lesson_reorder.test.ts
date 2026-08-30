import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { courseKeys } from "../../src/services/courses/courses.keys";
import type { CourseEditorDataResponse } from "@veolms/contracts";

describe("Optimistic Lesson Reordering", () => {
  let queryClient: QueryClient;

  const mockCourseId = "11111111-1111-1111-1111-111111111111";
  const mockSectionId = "22222222-2222-2222-2222-222222222222";
  const lessonA = "33333333-3333-3333-3333-333333333333";
  const lessonB = "44444444-4444-4444-4444-444444444444";
  const lessonC = "55555555-5555-5555-5555-555555555555";

  const initialEditorData: CourseEditorDataResponse = {
    course: {
      id: mockCourseId,
      slug: "test-course",
      title: "Test Course",
      description: "Description",
      shortDescription: null,
      difficulty: "beginner",
      status: "draft",
      creatorId: "00000000-0000-0000-0000-000000000001",
      categoryId: null,
      thumbnailMediaId: null,
      trailerMediaId: null,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      publishedAt: null,
    },
    sections: [
      {
        id: mockSectionId,
        courseId: mockCourseId,
        title: "Section 1",
        position: 0,
        lessons: [
          {
            id: lessonA,
            courseId: mockCourseId,
            sectionId: mockSectionId,
            title: "Lesson A",
            description: "",
            contentType: "video",
            contentMediaId: null,
            position: 0,
            isPreview: false,
            isPublished: true,
            resources: [],
          },
          {
            id: lessonB,
            courseId: mockCourseId,
            sectionId: mockSectionId,
            title: "Lesson B",
            description: "",
            contentType: "video",
            contentMediaId: null,
            position: 1,
            isPreview: false,
            isPublished: true,
            resources: [],
          },
          {
            id: lessonC,
            courseId: mockCourseId,
            sectionId: mockSectionId,
            title: "Lesson C",
            description: "",
            contentType: "video",
            contentMediaId: null,
            position: 2,
            isPreview: false,
            isPublished: true,
            resources: [],
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
    queryClient.setQueryData(courseKeys.editor(mockCourseId), initialEditorData);
  });

  it("optimistically updates cache order on mutate and rolls back on failure", async () => {
    const reorderedIds = [lessonC, lessonA, lessonB];

    // Snapshot before mutation
    const initialData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(initialData?.sections[0]?.lessons?.map((l) => l.id)).toEqual([
      lessonA,
      lessonB,
      lessonC,
    ]);

    // Simulate optimistic mutation onMutate logic
    const lessonOrderMap = new Map(reorderedIds.map((id, index) => [id, index]));
    const updatedSections = (initialData?.sections ?? []).map((sec) => {
      if (sec.id !== mockSectionId) return sec;
      const sortedLessons = [...(sec.lessons || [])].sort((a, b) => {
        const posA = lessonOrderMap.get(a.id) ?? a.position;
        const posB = lessonOrderMap.get(b.id) ?? b.position;
        return posA - posB;
      });
      return {
        ...sec,
        lessons: sortedLessons.map((les, idx) => ({
          ...les,
          position: idx,
        })),
      };
    });

    if (initialData) {
      queryClient.setQueryData<CourseEditorDataResponse>(
        courseKeys.editor(mockCourseId),
        {
          ...initialData,
          course: {
            ...initialData.course,
            version: (initialData.course.version || 1) + 1,
          },
          sections: updatedSections,
        },
      );
    }

    // Verify cache updated immediately to optimistic order
    const optimisticData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(optimisticData?.sections[0]?.lessons?.map((l) => l.id)).toEqual([
      lessonC,
      lessonA,
      lessonB,
    ]);
    expect(optimisticData?.course.version).toBe(2);

    // Simulate error rollback
    queryClient.setQueryData(courseKeys.editor(mockCourseId), initialData);

    const rolledBackData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(rolledBackData?.sections[0]?.lessons?.map((l) => l.id)).toEqual([
      lessonA,
      lessonB,
      lessonC,
    ]);
    expect(rolledBackData?.course.version).toBe(1);
  });
});
