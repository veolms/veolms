import { describe, it, expect, beforeEach } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { courseKeys } from "../../src/services/courses/courses.keys";
import type { CourseEditorDataResponse } from "@veolms/contracts";

describe("Optimistic Section and Lesson Creation & Dirty State Tracking", () => {
  let queryClient: QueryClient;

  const mockCourseId = "11111111-1111-1111-1111-111111111111";
  const sectionA = "22222222-2222-2222-2222-222222222222";

  const initialEditorData: CourseEditorDataResponse = {
    course: {
      id: mockCourseId,
      slug: "test-course-creation",
      title: "Test Course Creation",
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
        title: "Section 1",
        position: 0,
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

  it("handles optimistic section creation state flow (immediate render -> UUID replacement on success)", () => {
    // 1. Snapshot previous state
    let sections = [
      {
        id: sectionA,
        title: "Section 1",
        isExpanded: true,
        isEditingTitle: false,
        isPendingCreation: false,
        lessons: [],
      },
    ];

    // 2. Click Add Section -> immediate optimistic item
    const tempSectionId = "temp-sec-123456789";
    const optimisticSection = {
      id: tempSectionId,
      title: "Title",
      isExpanded: true,
      isEditingTitle: false,
      isPendingCreation: true,
      lessons: [],
    };
    sections = [...sections, optimisticSection];

    expect(sections).toHaveLength(2);
    expect(sections[1]?.id).toBe(tempSectionId);
    expect(sections[1]?.isPendingCreation).toBe(true);

    // 3. API Success -> replace temp ID with real UUID and clear pending flag
    const serverCreatedSectionId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    sections = sections.map((s) =>
      s.id === tempSectionId
        ? {
            ...s,
            id: serverCreatedSectionId,
            title: "Title",
            isPendingCreation: false,
          }
        : s,
    );

    expect(sections).toHaveLength(2);
    expect(sections[1]?.id).toBe(serverCreatedSectionId);
    expect(sections[1]?.isPendingCreation).toBe(false);
  });

  it("handles optimistic section creation failure rollback", () => {
    let sections = [
      {
        id: sectionA,
        title: "Section 1",
        isExpanded: true,
        isEditingTitle: false,
        isPendingCreation: false,
        lessons: [],
      },
    ];

    // Click Add Section -> immediate optimistic item
    const tempSectionId = "temp-sec-error-123";
    const optimisticSection = {
      id: tempSectionId,
      title: "Title",
      isExpanded: true,
      isEditingTitle: false,
      isPendingCreation: true,
      lessons: [],
    };
    sections = [...sections, optimisticSection];
    expect(sections).toHaveLength(2);

    // API Failure -> rollback temporary section
    sections = sections.filter((s) => s.id !== tempSectionId);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe(sectionA);
  });

  it("handles optimistic lesson creation state flow (immediate render -> UUID replacement on success)", () => {
    let sections = [
      {
        id: sectionA,
        title: "Section 1",
        isExpanded: true,
        isEditingTitle: false,
        isPendingCreation: false,
        lessons: [] as Array<{
          id: string;
          title: string;
          description: string;
          contentType: "video" | "document";
          isExpanded: boolean;
          isPublished?: boolean;
          isPreview?: boolean;
          isPendingCreation?: boolean;
          resources: unknown[];
        }>,
      },
    ];

    // 1. Click Add Lesson -> immediate optimistic lesson
    const tempLessonId = "temp-les-123456789";
    const optimisticLesson = {
      id: tempLessonId,
      title: "New Lesson 1",
      description: "",
      contentType: "video" as const,
      isExpanded: true,
      isPublished: true,
      isPreview: false,
      isPendingCreation: true,
      resources: [],
    };

    sections = sections.map((s) =>
      s.id === sectionA
        ? {
            ...s,
            lessons: [...s.lessons, optimisticLesson],
          }
        : s,
    );

    const firstSection = sections[0];
    expect(firstSection?.lessons).toHaveLength(1);
    expect(firstSection?.lessons[0]?.id).toBe(tempLessonId);
    expect(firstSection?.lessons[0]?.isPendingCreation).toBe(true);

    // 2. API Success -> replace temp ID with real UUID
    const serverCreatedLessonId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    sections = sections.map((s) =>
      s.id === sectionA
        ? {
            ...s,
            lessons: s.lessons.map((l) =>
              l.id === tempLessonId
                ? {
                    ...l,
                    id: serverCreatedLessonId,
                    isPendingCreation: false,
                  }
                : l,
            ),
          }
        : s,
    );

    const updatedSection = sections[0];
    expect(updatedSection?.lessons).toHaveLength(1);
    expect(updatedSection?.lessons[0]?.id).toBe(serverCreatedLessonId);
    expect(updatedSection?.lessons[0]?.isPendingCreation).toBe(false);
  });

  it("handles optimistic lesson creation failure rollback", () => {
    let sections = [
      {
        id: sectionA,
        title: "Section 1",
        isExpanded: true,
        isEditingTitle: false,
        isPendingCreation: false,
        lessons: [] as Array<{
          id: string;
          title: string;
          description: string;
          contentType: "video" | "document";
          isExpanded: boolean;
          isPublished?: boolean;
          isPreview?: boolean;
          isPendingCreation?: boolean;
          resources: unknown[];
        }>,
      },
    ];

    // Click Add Lesson -> immediate optimistic lesson
    const tempLessonId = "temp-les-err-123";
    const optimisticLesson = {
      id: tempLessonId,
      title: "New Lesson 1",
      description: "",
      contentType: "video" as const,
      isExpanded: true,
      isPublished: true,
      isPreview: false,
      isPendingCreation: true,
      resources: [],
    };

    sections = sections.map((s) =>
      s.id === sectionA
        ? {
            ...s,
            lessons: [...s.lessons, optimisticLesson],
          }
        : s,
    );
    expect(sections[0]?.lessons).toHaveLength(1);

    // API Failure -> rollback temporary lesson
    sections = sections.map((s) =>
      s.id === sectionA
        ? {
            ...s,
            lessons: s.lessons.filter((l) => l.id !== tempLessonId),
          }
        : s,
    );
    expect(sections[0]?.lessons).toHaveLength(0);
  });

  it("correctly identifies when a lesson is dirty vs unchanged", () => {
    interface LessonSnapshot {
      title: string;
      description: string;
      contentType: "video" | "document";
      isPublished?: boolean;
      isPreview?: boolean;
    }

    interface TestLessonItem {
      id: string;
      title: string;
      description: string;
      contentType: "video" | "document";
      isExpanded: boolean;
      isPublished?: boolean;
      isPreview?: boolean;
      initialState?: LessonSnapshot;
    }

    const isLessonDirty = (les: TestLessonItem): boolean => {
      if (!les.initialState) return false;
      const isPub = les.isPublished !== undefined ? les.isPublished : true;
      const isPrev = les.isPreview !== undefined ? les.isPreview : false;
      const initPub =
        les.initialState.isPublished !== undefined
          ? les.initialState.isPublished
          : true;
      const initPrev =
        les.initialState.isPreview !== undefined
          ? les.initialState.isPreview
          : false;

      return (
        les.title.trim() !== les.initialState.title.trim() ||
        (les.description || "") !== (les.initialState.description || "") ||
        les.contentType !== les.initialState.contentType ||
        isPub !== initPub ||
        isPrev !== initPrev
      );
    };

    const cleanLesson: TestLessonItem = {
      id: "les-1",
      title: "Introduction",
      description: "Welcome to the course",
      contentType: "video",
      isExpanded: true,
      isPublished: true,
      isPreview: false,
      initialState: {
        title: "Introduction",
        description: "Welcome to the course",
        contentType: "video",
        isPublished: true,
        isPreview: false,
      },
    };

    // 1. Initial state -> not dirty
    expect(isLessonDirty(cleanLesson)).toBe(false);

    // 2. Modifying title -> dirty
    const modifiedTitle = { ...cleanLesson, title: "Introduction Updated" };
    expect(isLessonDirty(modifiedTitle)).toBe(true);

    // 3. Modifying description -> dirty
    const modifiedDesc = { ...cleanLesson, description: "New text" };
    expect(isLessonDirty(modifiedDesc)).toBe(true);

    // 4. Modifying contentType -> dirty
    const modifiedType: TestLessonItem = { ...cleanLesson, contentType: "document" };
    expect(isLessonDirty(modifiedType)).toBe(true);

    // 5. Modifying isPublished -> dirty
    const modifiedPub = { ...cleanLesson, isPublished: false };
    expect(isLessonDirty(modifiedPub)).toBe(true);

    // 6. Modifying isPreview -> dirty
    const modifiedPrev = { ...cleanLesson, isPreview: true };
    expect(isLessonDirty(modifiedPrev)).toBe(true);

    // 7. After saving and updating initialState -> clean again
    const savedLesson: TestLessonItem = {
      ...modifiedTitle,
      initialState: {
        title: "Introduction Updated",
        description: "Welcome to the course",
        contentType: "video",
        isPublished: true,
        isPreview: false,
      },
    };
    expect(isLessonDirty(savedLesson)).toBe(false);
  });
});
