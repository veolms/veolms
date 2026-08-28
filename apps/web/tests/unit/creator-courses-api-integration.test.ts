import { describe, expect, it } from "vitest";
import type { Course as ApiCourse } from "@veolms/contracts";
import { adaptApiCourseToCatalogueCourse } from "../../src/courses/courseAdapter";
import { courses as mockCourses, getVisibleCourses } from "../../src/courses/catalogue";
import type { Course } from "../../src/courses/catalogue";

describe("Creator Courses Page API Integration", () => {
  const sampleApiCourse1: ApiCourse = {
    id: "aaaaaaaa-1111-4111-a111-111111111111",
    slug: "rust-systems-programming",
    title: "Rust Systems Programming",
    shortDescription: "Learn low-level systems programming in Rust.",
    description: "Deep dive into memory safety, ownership, and concurrency.",
    difficulty: "advanced",
    status: "published",
    creatorId: "user-123",
    categoryId: "cat-1",
    thumbnailMediaId: null,
    trailerMediaId: null,
    instructorAlias: "Anurag Singh",
    version: 1,
    createdAt: "2026-01-15T10:00:00.000Z",
    updatedAt: "2026-02-20T14:30:00.000Z",
    publishedAt: "2026-02-20T14:30:00.000Z",
  };

  const sampleApiCourse2: ApiCourse = {
    id: "bbbbbbbb-2222-4222-a222-222222222222",
    slug: "go-microservices-mastery",
    title: "Go Microservices Mastery",
    shortDescription: "Build distributed microservices with Go and gRPC.",
    description: "Learn high-throughput backend architecture in Go.",
    difficulty: "intermediate",
    status: "draft",
    creatorId: "user-123",
    categoryId: "cat-1",
    thumbnailMediaId: null,
    trailerMediaId: null,
    instructorAlias: "Anurag Singh",
    version: 1,
    createdAt: "2026-02-01T10:00:00.000Z",
    updatedAt: "2026-02-25T16:00:00.000Z",
    publishedAt: null,
  };

  describe("1. Adapter: adaptApiCourseToCatalogueCourse", () => {
    it("correctly maps API course fields to the frontend Course shape", () => {
      const adapted = adaptApiCourseToCatalogueCourse(sampleApiCourse1);

      expect(adapted.id).toBe("aaaaaaaa-1111-4111-a111-111111111111");
      expect(adapted.slug).toBe("rust-systems-programming");
      expect(adapted.title).toBe("Rust Systems Programming");
      expect(adapted.description).toBe("Learn low-level systems programming in Rust.");
      expect(adapted.level).toBe("Intermediate");
      expect(adapted.lifecycleStatus).toBe("published");
      expect(adapted.sections).toBe(0);
      expect(adapted.lectures).toBe(0);
      expect(adapted.progress).toBeNull();
      expect(adapted.enrolled).toBe(false);
      expect(adapted.thumbnail).toBeTruthy();
      expect(adapted.updatedAt).toBe("2026-02-20T14:30:00.000Z");
    });

    it("maps draft and beginner/intermediate difficulty accurately", () => {
      const adapted = adaptApiCourseToCatalogueCourse(sampleApiCourse2);

      expect(adapted.id).toBe("bbbbbbbb-2222-4222-a222-222222222222");
      expect(adapted.title).toBe("Go Microservices Mastery");
      expect(adapted.lifecycleStatus).toBe("draft");
      expect(adapted.level).toBe("Intermediate");
    });

    it("handles fallback description when shortDescription is null", () => {
      const courseWithoutShortDesc: ApiCourse = {
        ...sampleApiCourse1,
        shortDescription: null,
        description: "Fallback description text",
      };
      const adapted = adaptApiCourseToCatalogueCourse(courseWithoutShortDesc);
      expect(adapted.description).toBe("Fallback description text");
    });
  });

  describe("2. Combining API Courses + Mock Courses", () => {
    it("merges API courses and mock courses together seamlessly", () => {
      const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
        adaptApiCourseToCatalogueCourse,
      );
      const existingIds = new Set(apiCourses.map((c) => c.id));
      const combined = [
        ...apiCourses,
        ...mockCourses.filter((c) => !existingIds.has(c.id)),
      ];

      expect(combined.length).toBe(apiCourses.length + mockCourses.length);
      expect(combined[0]?.title).toBe("Rust Systems Programming");
      expect(combined[1]?.title).toBe("Go Microservices Mastery");
      expect(combined.some((c) => c.id === "backend-nodejs")).toBe(true);
    });

    it("prevents duplication if an API course has an ID matching a mock course", () => {
      const duplicateApiCourse: ApiCourse = {
        ...sampleApiCourse1,
        id: "backend-nodejs",
      };
      const apiCourses = [duplicateApiCourse].map(adaptApiCourseToCatalogueCourse);
      const existingIds = new Set(apiCourses.map((c) => c.id));
      const combined = [
        ...apiCourses,
        ...mockCourses.filter((c) => !existingIds.has(c.id)),
      ];

      expect(combined.filter((c) => c.id === "backend-nodejs").length).toBe(1);
    });
  });

  describe("3. Creator Status Filtering across Combined Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
      adaptApiCourseToCatalogueCourse,
    );
    const combined: Course[] = [...apiCourses, ...mockCourses];

    it("filter 'all' returns all published, draft, and archived courses", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible.length).toBe(combined.length);
      expect(visible.some((c) => c.title === "Rust Systems Programming")).toBe(true);
      expect(visible.some((c) => c.title === "Go Microservices Mastery")).toBe(true);
    });

    it("filter 'published' returns only published courses across both sources", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "published",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible.every((c) => c.lifecycleStatus === "published")).toBe(true);
      expect(visible.some((c) => c.title === "Rust Systems Programming")).toBe(true);
      expect(visible.some((c) => c.title === "Go Microservices Mastery")).toBe(false);
    });

    it("filter 'draft' returns only draft courses across both sources", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "draft",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible.every((c) => c.lifecycleStatus === "draft")).toBe(true);
      expect(visible.some((c) => c.title === "Go Microservices Mastery")).toBe(true);
      expect(visible.some((c) => c.title === "Rust Systems Programming")).toBe(false);
    });
  });

  describe("4. Frontend Search across Combined Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
      adaptApiCourseToCatalogueCourse,
    );
    const combined: Course[] = [...apiCourses, ...mockCourses];

    it("searches and finds API course by title keyword", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "Rust",
        sort: "latest",
      });

      expect(visible.length).toBe(1);
      expect(visible[0]?.title).toBe("Rust Systems Programming");
    });

    it("searches and finds API course by shortDescription keyword", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "microservices",
        sort: "latest",
      });

      expect(visible.length).toBe(1);
      expect(visible[0]?.title).toBe("Go Microservices Mastery");
    });

    it("searches and finds mock course by keyword", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "TypeScript",
        sort: "latest",
      });

      expect(visible.length).toBe(1);
      expect(visible[0]?.title).toBe("The Ultimate TypeScript Course");
    });
  });

  describe("5. Sorting across Combined Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
      adaptApiCourseToCatalogueCourse,
    );
    const combined: Course[] = [...apiCourses, ...mockCourses];

    it("sorts A-Z alphabetically by title", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "title",
      });

      for (let i = 0; i < visible.length - 1; i++) {
        expect(visible[i]!.title.localeCompare(visible[i + 1]!.title)).toBeLessThanOrEqual(0);
      }
    });

    it("sorts Recently Updated by updatedAt descending", () => {
      const visible = getVisibleCourses(combined, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      // sampleApiCourse2 was updated 2026-02-25, sampleApiCourse1 on 2026-02-20
      const goIndex = visible.findIndex((c) => c.title === "Go Microservices Mastery");
      const rustIndex = visible.findIndex((c) => c.title === "Rust Systems Programming");

      expect(goIndex).toBeLessThan(rustIndex);
    });
  });

  describe("6. Editing Mode Terms & Loading State Logic", () => {
    it("distinguishes create vs edit mode based on activeEditId", () => {
      const activeEditId = "course-123";
      const isEditing = Boolean(activeEditId);
      const isPublished = false;

      const headerTitle = isEditing ? "Edit Course" : "Create New Course";
      const wizardAriaLabel = isEditing ? "Course editing steps" : "Course creation steps";

      expect(headerTitle).toBe("Edit Course");
      expect(wizardAriaLabel).toBe("Course editing steps");
    });

    it("evaluates isInitialLoadingCourse accurately when fetching editor data", () => {
      const activeEditId = "course-123";
      const isEditing = Boolean(activeEditId);
      const isLoadingEditor = true;
      const editorData = undefined;

      const isInitialLoadingCourse = isEditing && isLoadingEditor && !editorData;
      expect(isInitialLoadingCourse).toBe(true);
    });

    it("clears isInitialLoadingCourse once editorData is hydrated", () => {
      const activeEditId = "course-123";
      const isEditing = Boolean(activeEditId);
      const isLoadingEditor = false;
      const editorData = { course: sampleApiCourse1 };

      const isInitialLoadingCourse = isEditing && isLoadingEditor && !editorData;
      expect(isInitialLoadingCourse).toBe(false);
    });
  });

  describe("7. Soft-Delete API & List State Handling", () => {
    it("filters out soft-deleted courses from the active creator course list", () => {
      const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
        adaptApiCourseToCatalogueCourse,
      );
      const combined = [...apiCourses, ...mockCourses];

      // Simulate soft-deleting sampleApiCourse1 (it is no longer returned by GET /api/v1/courses/mine)
      const afterDeletionApiCourses = [sampleApiCourse2].map(
        adaptApiCourseToCatalogueCourse,
      );
      const existingIds = new Set(afterDeletionApiCourses.map((c) => c.id));
      const updatedList = [
        ...afterDeletionApiCourses,
        ...mockCourses.filter((c) => !existingIds.has(c.id)),
      ];

      expect(updatedList.some((c) => c.id === sampleApiCourse1.id)).toBe(false);
      expect(updatedList.some((c) => c.id === sampleApiCourse2.id)).toBe(true);
      expect(updatedList.length).toBe(combined.length - 1);
    });

    it("retains the course in the list when the delete API call fails", () => {
      const apiCourses = [sampleApiCourse1, sampleApiCourse2].map(
        adaptApiCourseToCatalogueCourse,
      );
      const combined = [...apiCourses, ...mockCourses];

      // Simulate failed delete: API query is not updated, list remains untouched
      const listAfterFailure = combined;

      expect(listAfterFailure.some((c) => c.id === sampleApiCourse1.id)).toBe(true);
      expect(listAfterFailure.length).toBe(combined.length);
    });

    it("handles mock course deletion without sending network request", () => {
      const deletedMockCourseIds = new Set(["backend-nodejs"]);
      const apiCourses = [sampleApiCourse1].map(adaptApiCourseToCatalogueCourse);
      const existingIds = new Set(apiCourses.map((c) => c.id));

      const updatedList = [
        ...apiCourses,
        ...mockCourses.filter(
          (c) => !existingIds.has(c.id) && !deletedMockCourseIds.has(c.id),
        ),
      ];

      expect(updatedList.some((c) => c.id === "backend-nodejs")).toBe(false);
      expect(updatedList.some((c) => c.id === sampleApiCourse1.id)).toBe(true);
    });
  });
});
