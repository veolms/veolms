import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { courseKeys } from "../../src/services/courses/courses.keys";
import type { CourseEditorDataResponse } from "@veolms/contracts";

describe("Optimistic Section Reordering", () => {
  let queryClient: QueryClient;

  const mockCourseId = "11111111-1111-1111-1111-111111111111";
  const sectionA = "22222222-2222-2222-2222-222222222222";
  const sectionB = "33333333-3333-3333-3333-333333333333";
  const sectionC = "44444444-4444-4444-4444-444444444444";

  const initialEditorData: CourseEditorDataResponse = {
    course: {
      id: mockCourseId,
      slug: "test-course-sections",
      title: "Test Course Sections",
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
        id: sectionA,
        courseId: mockCourseId,
        title: "Section A",
        position: 0,
        lessons: [],
      },
      {
        id: sectionB,
        courseId: mockCourseId,
        title: "Section B",
        position: 1,
        lessons: [],
      },
      {
        id: sectionC,
        courseId: mockCourseId,
        title: "Section C",
        position: 2,
        lessons: [],
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

  it("optimistically updates cache section order on mutate and rolls back on failure", async () => {
    const reorderedSectionIds = [sectionC, sectionA, sectionB];

    // Snapshot before mutation
    const initialData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(initialData?.sections?.map((s) => s.id)).toEqual([
      sectionA,
      sectionB,
      sectionC,
    ]);

    // Simulate optimistic onMutate logic for section reorder
    const sectionOrderMap = new Map(
      reorderedSectionIds.map((id, index) => [id, index]),
    );
    const sortedSections = [...(initialData?.sections ?? [])]
      .sort((a, b) => {
        const posA = sectionOrderMap.get(a.id) ?? a.position;
        const posB = sectionOrderMap.get(b.id) ?? b.position;
        return posA - posB;
      })
      .map((sec, idx) => ({
        ...sec,
        position: idx,
      }));

    if (initialData) {
      queryClient.setQueryData<CourseEditorDataResponse>(
        courseKeys.editor(mockCourseId),
        {
          ...initialData,
          course: {
            ...initialData.course,
            version: (initialData.course.version || 1) + 1,
          },
          sections: sortedSections,
        },
      );
    }

    // Verify cache updated immediately to optimistic order
    const optimisticData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(optimisticData?.sections?.map((s) => s.id)).toEqual([
      sectionC,
      sectionA,
      sectionB,
    ]);
    expect(optimisticData?.course.version).toBe(2);

    // Simulate error rollback
    queryClient.setQueryData(courseKeys.editor(mockCourseId), initialData);

    const rolledBackData = queryClient.getQueryData<CourseEditorDataResponse>(
      courseKeys.editor(mockCourseId),
    );
    expect(rolledBackData?.sections?.map((s) => s.id)).toEqual([
      sectionA,
      sectionB,
      sectionC,
    ]);
    expect(rolledBackData?.course.version).toBe(1);
  });
});
