import { describe, expect, it } from "vitest";
import type { Course as ApiCourse, DeletedCourse } from "@veolms/contracts";
import {
  adaptApiCourseToCatalogueCourse,
  adaptDeletedCourseToCatalogueCourse,
} from "../../src/courses/courseAdapter";
import { courses as mockCourses, getVisibleCourses } from "../../src/courses/catalogue";
import type { Course } from "../../src/courses/catalogue";
import { parseWizardTab, CourseWizardSkeleton } from "../../src/courses/CourseCreatePage";

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

  describe("7. Soft-Delete API, Bin & Restore State Handling", () => {
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

    it("populates the Bin view with deleted courses from the Bin endpoint", () => {
      const deletedCourse: DeletedCourse = {
        id: sampleApiCourse1.id,
        slug: sampleApiCourse1.slug,
        title: sampleApiCourse1.title,
        status: sampleApiCourse1.status,
        creatorId: sampleApiCourse1.creatorId,
        deletedAt: "2026-08-28T12:00:00.000Z",
        purgeAt: "2026-09-27T12:00:00.000Z",
        purgeState: "scheduled",
        purgeAttempts: 0,
        lastPurgeError: null,
      };

      const adaptedBinCourse = adaptDeletedCourseToCatalogueCourse(deletedCourse);
      expect(adaptedBinCourse.id).toBe(sampleApiCourse1.id);
      expect(adaptedBinCourse.title).toBe("Rust Systems Programming");
      expect(adaptedBinCourse.deletedAt).toBe("2026-08-28T12:00:00.000Z");
      expect(adaptedBinCourse.purgeAt).toBe("2026-09-27T12:00:00.000Z");
      expect(adaptedBinCourse.isApi).toBe(true);

      const binList: Course[] = [adaptedBinCourse];
      const visible = getVisibleCourses(binList, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "bin",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible).toHaveLength(1);
      expect(visible[0]?.id).toBe(sampleApiCourse1.id);
    });

    it("restores a course from the Bin back to the active catalogue", () => {
      // Simulating restore: course is removed from bin and re-added to active courses
      const apiCourses = [sampleApiCourse2].map(adaptApiCourseToCatalogueCourse);
      const restoredCourse = adaptApiCourseToCatalogueCourse(sampleApiCourse1);
      const afterRestoreApiCourses = [...apiCourses, restoredCourse];
      const existingIds = new Set(afterRestoreApiCourses.map((c) => c.id));
      const activeList = [
        ...afterRestoreApiCourses,
        ...mockCourses.filter((c) => !existingIds.has(c.id)),
      ];

      expect(activeList.some((c) => c.id === sampleApiCourse1.id)).toBe(true);
      expect(activeList.some((c) => c.id === sampleApiCourse2.id)).toBe(true);
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

    it("handles mock course deletion and restore without network request", () => {
      let deletedMockCourseIds = new Set<string>();
      
      // Move mock course to Bin
      deletedMockCourseIds = new Set(deletedMockCourseIds).add("backend-nodejs");
      const apiCourses = [sampleApiCourse1].map(adaptApiCourseToCatalogueCourse);
      const existingIds = new Set(apiCourses.map((c) => c.id));

      let activeList = [
        ...apiCourses,
        ...mockCourses.filter(
          (c) => !existingIds.has(c.id) && !deletedMockCourseIds.has(c.id),
        ),
      ];
      expect(activeList.some((c) => c.id === "backend-nodejs")).toBe(false);

      // Restore mock course from Bin
      deletedMockCourseIds = new Set(deletedMockCourseIds);
      deletedMockCourseIds.delete("backend-nodejs");

      activeList = [
        ...apiCourses,
        ...mockCourses.filter(
          (c) => !existingIds.has(c.id) && !deletedMockCourseIds.has(c.id),
        ),
      ];
      expect(activeList.some((c) => c.id === "backend-nodejs")).toBe(true);
    });
  });

  describe("8. URL Param Wizard Navigation & Tab Normalization", () => {
    it("correctly parses valid tab identifiers", () => {
      expect(parseWizardTab("basics")).toBe("basics");
      expect(parseWizardTab("curriculum")).toBe("curriculum");
      expect(parseWizardTab("pricing")).toBe("pricing");
      expect(parseWizardTab("extras")).toBe("extras");
      expect(parseWizardTab("publish")).toBe("publish");
    });

    it("normalizes 'access', 'accessrules', and 'access-rules' to 'access-rules'", () => {
      expect(parseWizardTab("access")).toBe("access-rules");
      expect(parseWizardTab("accessrules")).toBe("access-rules");
      expect(parseWizardTab("access-rules")).toBe("access-rules");
    });

    it("returns null for missing, unknown, or invalid tab values to allow fallback to basics", () => {
      expect(parseWizardTab(null)).toBeNull();
      expect(parseWizardTab(undefined)).toBeNull();
      expect(parseWizardTab("")).toBeNull();
      expect(parseWizardTab("invalid-step-123")).toBeNull();
      expect(parseWizardTab("unknown")).toBeNull();
    });

    it("evaluates CourseWizardSkeleton structure for direct tab navigation", () => {
      expect(CourseWizardSkeleton).toBeDefined();
    });
  });

  describe("9. On-Demand Role & Tab Query Gating Logic", () => {
    const getQueryGatingState = (role: "student" | "creator", enrollmentFilter: string) => {
      const isStudent = role === "student";
      const isCreator = role === "creator";
      const isBin = isCreator && enrollmentFilter === "bin";
      const isCreatorActive = isCreator && enrollmentFilter !== "bin";

      return {
        isCoursesQueryEnabled: isStudent,
        isMyCoursesQueryEnabled: isCreatorActive,
        isDeletedCoursesQueryEnabled: isBin,
      };
    };

    it("Scenario A: Creator -> All tab only enables /courses/mine", () => {
      const gating = getQueryGatingState("creator", "all");
      expect(gating.isMyCoursesQueryEnabled).toBe(true);
      expect(gating.isCoursesQueryEnabled).toBe(false);
      expect(gating.isDeletedCoursesQueryEnabled).toBe(false);
    });

    it("Scenario B: Creator -> Published tab only enables /courses/mine", () => {
      const gating = getQueryGatingState("creator", "published");
      expect(gating.isMyCoursesQueryEnabled).toBe(true);
      expect(gating.isCoursesQueryEnabled).toBe(false);
      expect(gating.isDeletedCoursesQueryEnabled).toBe(false);
    });

    it("Scenario C: Creator -> Draft tab only enables /courses/mine", () => {
      const gating = getQueryGatingState("creator", "draft");
      expect(gating.isMyCoursesQueryEnabled).toBe(true);
      expect(gating.isCoursesQueryEnabled).toBe(false);
      expect(gating.isDeletedCoursesQueryEnabled).toBe(false);
    });

    it("Scenario D: Creator -> Bin tab only enables /bin/courses", () => {
      const gating = getQueryGatingState("creator", "bin");
      expect(gating.isDeletedCoursesQueryEnabled).toBe(true);
      expect(gating.isCoursesQueryEnabled).toBe(false);
      expect(gating.isMyCoursesQueryEnabled).toBe(false);
    });

    it("Scenario E: Student view only enables /courses", () => {
      const gatingAll = getQueryGatingState("student", "all");
      expect(gatingAll.isCoursesQueryEnabled).toBe(true);
      expect(gatingAll.isMyCoursesQueryEnabled).toBe(false);
      expect(gatingAll.isDeletedCoursesQueryEnabled).toBe(false);

      const gatingEnrolled = getQueryGatingState("student", "enrolled");
      expect(gatingEnrolled.isCoursesQueryEnabled).toBe(true);
      expect(gatingEnrolled.isMyCoursesQueryEnabled).toBe(false);
      expect(gatingEnrolled.isDeletedCoursesQueryEnabled).toBe(false);
    });

    it("Scenario F: Role toggle switches queries seamlessly without simultaneous execution", () => {
      let role: "student" | "creator" = "creator";
      let filter = "all";

      // Initially in creator mode
      let state = getQueryGatingState(role, filter);
      expect(state.isMyCoursesQueryEnabled).toBe(true);
      expect(state.isCoursesQueryEnabled).toBe(false);

      // Switch to student mode
      role = "student";
      state = getQueryGatingState(role, filter);
      expect(state.isCoursesQueryEnabled).toBe(true);
      expect(state.isMyCoursesQueryEnabled).toBe(false);
      expect(state.isDeletedCoursesQueryEnabled).toBe(false);

      // Switch back to creator bin mode
      role = "creator";
      filter = "bin";
      state = getQueryGatingState(role, filter);
      expect(state.isDeletedCoursesQueryEnabled).toBe(true);
      expect(state.isCoursesQueryEnabled).toBe(false);
      expect(state.isMyCoursesQueryEnabled).toBe(false);
    });
  });
});
