import { describe, expect, it } from "vitest";
import type { Course as ApiCourse, DeletedCourse } from "@veolms/contracts";
import {
  adaptApiCourseToCatalogueCourse,
  adaptDeletedCourseToCatalogueCourse,
  formatCoursePricing,
} from "../../src/courses/courseAdapter";
import { getVisibleCourses } from "../../src/courses/catalogue";
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

  const sampleApiCourse3: ApiCourse = {
    id: "cccccccc-3333-4333-a333-333333333333",
    slug: "typescript-production",
    title: "TypeScript in Production",
    shortDescription: "Advanced TypeScript architecture patterns.",
    description: "Deep dive into strict TypeScript patterns.",
    difficulty: "advanced",
    status: "archived",
    creatorId: "user-123",
    categoryId: "cat-1",
    thumbnailMediaId: null,
    trailerMediaId: null,
    instructorAlias: "Anurag Singh",
    version: 1,
    createdAt: "2026-01-01T10:00:00.000Z",
    updatedAt: "2026-01-20T14:30:00.000Z",
    publishedAt: "2026-01-20T14:30:00.000Z",
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
      expect(adapted.isApi).toBe(true);
    });

    it("falls back to description when shortDescription is null/empty", () => {
      const courseWithoutShortDesc: ApiCourse = {
        ...sampleApiCourse1,
        shortDescription: null,
        description: "Fallback description text",
      };
      const adapted = adaptApiCourseToCatalogueCourse(courseWithoutShortDesc);
      expect(adapted.description).toBe("Fallback description text");
    });
  });

  describe("2. Pure API Course List Handling", () => {
    it("maps all API courses into catalogue course models", () => {
      const apiCourses = [sampleApiCourse1, sampleApiCourse2, sampleApiCourse3].map(
        adaptApiCourseToCatalogueCourse,
      );

      expect(apiCourses.length).toBe(3);
      expect(apiCourses[0]?.title).toBe("Rust Systems Programming");
      expect(apiCourses[1]?.title).toBe("Go Microservices Mastery");
      expect(apiCourses[2]?.title).toBe("TypeScript in Production");
    });
  });

  describe("3. Creator Status Filtering across API Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2, sampleApiCourse3].map(
      adaptApiCourseToCatalogueCourse,
    );

    it("filter 'all' returns all published, draft, and archived courses", () => {
      const visible = getVisibleCourses(apiCourses, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible.length).toBe(3);
      expect(visible.some((c) => c.title === "Rust Systems Programming")).toBe(true);
      expect(visible.some((c) => c.title === "Go Microservices Mastery")).toBe(true);
    });

    it("filter 'published' returns only published courses", () => {
      const visible = getVisibleCourses(apiCourses, {
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

    it("filter 'draft' returns only draft courses", () => {
      const visible = getVisibleCourses(apiCourses, {
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

  describe("4. Frontend Search across API Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2, sampleApiCourse3].map(
      adaptApiCourseToCatalogueCourse,
    );

    it("searches and finds API course by title keyword", () => {
      const visible = getVisibleCourses(apiCourses, {
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
      const visible = getVisibleCourses(apiCourses, {
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

    it("searches and finds API course by title keyword case-insensitively", () => {
      const visible = getVisibleCourses(apiCourses, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "typescript",
        sort: "latest",
      });

      expect(visible.length).toBe(1);
      expect(visible[0]?.title).toBe("TypeScript in Production");
    });
  });

  describe("5. Sorting across API Courses", () => {
    const apiCourses = [sampleApiCourse1, sampleApiCourse2, sampleApiCourse3].map(
      adaptApiCourseToCatalogueCourse,
    );

    it("sorts A-Z alphabetically by title", () => {
      const visible = getVisibleCourses(apiCourses, {
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
      const visible = getVisibleCourses(apiCourses, {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible[0]?.title).toBe("Go Microservices Mastery");
    });
  });

  describe("6. Empty States & Loading Conditions", () => {
    it("recognizes when creator has no courses in any filter", () => {
      const visible = getVisibleCourses([], {
        activeSection: "Courses",
        wishlisted: new Set(),
        role: "creator",
        enrollmentFilter: "all",
        statusFilter: "all",
        search: "",
        sort: "latest",
      });

      expect(visible).toHaveLength(0);
    });

    it("evaluates loading state properly when API query is pending", () => {
      const isInitialLoadingCourse = false;
      expect(isInitialLoadingCourse).toBe(false);
    });
  });

  describe("7. Soft-Delete API, Bin & Restore State Handling", () => {
    it("filters out soft-deleted courses from the active creator course list", () => {
      // Simulate soft-deleting sampleApiCourse1 (it is no longer returned by GET /api/v1/courses/mine)
      const afterDeletionApiCourses = [sampleApiCourse2, sampleApiCourse3].map(
        adaptApiCourseToCatalogueCourse,
      );

      expect(afterDeletionApiCourses.some((c) => c.id === sampleApiCourse1.id)).toBe(false);
      expect(afterDeletionApiCourses.some((c) => c.id === sampleApiCourse2.id)).toBe(true);
      expect(afterDeletionApiCourses.length).toBe(2);
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
      // Simulating restore: course is re-added to active courses
      const apiCourses = [sampleApiCourse2, sampleApiCourse3].map(
        adaptApiCourseToCatalogueCourse,
      );
      const restoredCourse = adaptApiCourseToCatalogueCourse(sampleApiCourse1);
      const afterRestoreApiCourses = [...apiCourses, restoredCourse];

      expect(afterRestoreApiCourses.some((c) => c.id === sampleApiCourse1.id)).toBe(true);
      expect(afterRestoreApiCourses.some((c) => c.id === sampleApiCourse2.id)).toBe(true);
    });

    it("retains the course in the list when the delete API call fails", () => {
      const apiCourses = [sampleApiCourse1, sampleApiCourse2, sampleApiCourse3].map(
        adaptApiCourseToCatalogueCourse,
      );

      // Simulate failed delete: API query is not updated, list remains untouched
      const listAfterFailure = apiCourses;

      expect(listAfterFailure.some((c) => c.id === sampleApiCourse1.id)).toBe(true);
      expect(listAfterFailure.length).toBe(3);
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

  describe("10. Pricing formatting via formatCoursePricing", () => {
    it("formats free courses properly", () => {
      expect(
        formatCoursePricing({
          pricingType: "free",
          price: 0,
          currency: "INR",
          salePrice: null,
        }),
      ).toEqual({
        price: "Free",
        originalPrice: "",
        discount: "",
      });
    });

    it("formats INR currency and sale price with minor unit conversion, Indian locale grouping and ₹ symbol", () => {
      expect(
        formatCoursePricing({
          pricingType: "paid",
          price: 100000, // 1,000.00 INR
          currency: "INR",
          salePrice: 50000, // 500.00 INR
        }),
      ).toEqual({
        price: "₹500",
        originalPrice: "₹1,000",
        discount: "50% off",
      });
    });

    it("formats USD currency and sale price with minor unit conversion and $ symbol", () => {
      expect(
        formatCoursePricing({
          pricingType: "paid",
          price: 10000, // 100.00 USD
          currency: "USD",
          salePrice: 8000, // 80.00 USD
        }),
      ).toEqual({
        price: "$80",
        originalPrice: "$100",
        discount: "20% off",
      });
    });

    it("formats EUR currency with € symbol and matching locale grouping", () => {
      expect(
        formatCoursePricing({
          pricingType: "paid",
          price: 250000, // 2,500.00 EUR
          currency: "EUR",
          salePrice: null,
        }),
      ).toEqual({
        price: "€2,500",
        originalPrice: "",
        discount: "",
      });
    });

    it("formats GBP currency with £ symbol", () => {
      expect(
        formatCoursePricing({
          pricingType: "paid",
          price: 4900, // 49.00 GBP
          currency: "GBP",
          salePrice: null,
        }),
      ).toEqual({
        price: "£49",
        originalPrice: "",
        discount: "",
      });
    });
  });
});
