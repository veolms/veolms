import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render as rtlRender, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Category, CourseEditorDataResponse } from "@veolms/contracts";
import {
  buildLocalPreviewData,
  buildPricingPayload,
  CourseWizardSkeleton,
} from "../../src/courses/CourseCreatePage";
import {
  CourseOverviewPage,
  CourseOverviewSkeleton,
  adaptPreviewDataToOverview,
} from "../../src/courses/CourseOverviewPage";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return rtlRender(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const mockCategories: Category[] = [
  { id: "cat-dev", name: "Development", slug: "development" },
  { id: "cat-design", name: "Design", slug: "design" },
];

describe("Milestone 1: Course Creation Wizard Local Preview & Skeleton", () => {
  describe("1. Pure Local Preview Data Construction (buildLocalPreviewData)", () => {
    it("returns null when currentCourseId is null or empty", () => {
      const result = buildLocalPreviewData({
        currentCourseId: null,
        courseTitle: "Valid Title",
        shortDescription: "",
        courseDescription: "",
        categoryId: "",
        difficultyLevel: "",
        language: "en",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [],
        pricingDraft: {
          pricingType: "free",
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      });

      expect(result).toBeNull();
    });

    it("returns null when courseTitle is empty or whitespace-only (boundary check)", () => {
      const result = buildLocalPreviewData({
        currentCourseId: "course-123",
        courseTitle: "   ",
        shortDescription: "Some short desc",
        courseDescription: "Some full desc",
        categoryId: "",
        difficultyLevel: "beginner",
        language: "en",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [],
        pricingDraft: {
          pricingType: "free",
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      });

      expect(result).toBeNull();
    });

    it("builds local preview data for a partially completed course (only title and ID)", () => {
      const result = buildLocalPreviewData({
        currentCourseId: "course-partial-id",
        courseTitle: "Partial Course Title",
        shortDescription: "",
        courseDescription: "",
        categoryId: "",
        difficultyLevel: "",
        language: "",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [],
        pricingDraft: {
          pricingType: "paid",
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: false,
          enableComments: false,
          enableDownloads: false,
          enableNotes: false,
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      });

      expect(result).not.toBeNull();
      expect(result?.course.id).toBe("course-partial-id");
      expect(result?.course.title).toBe("Partial Course Title");
      expect(result?.course.shortDescription).toBeNull();
      expect(result?.course.description).toBeNull();
      expect(result?.course.difficulty).toBeNull();
      expect(result?.course.status).toBe("draft");
      expect(result?.sections).toEqual([]);
      expect(result?.settings?.language).toBe("en");
      expect(result?.pricing?.pricingType).toBe("paid");
      expect(result?.pricing?.price).toBe(0);
    });

    it("builds full preview data with all major Basics fields populated", () => {
      const result = buildLocalPreviewData({
        currentCourseId: "course-full-id",
        courseTitle: "Complete TypeScript Mastery",
        shortDescription: "A deep dive into advanced TypeScript patterns.",
        courseDescription: "Full course curriculum covering generics, ASTs, and types.",
        categoryId: "cat-dev",
        difficultyLevel: "advanced",
        language: "es",
        instructorAlias: "Senior Architect",
        showInstructorName: true,
        courseVersion: 3,
        isPublished: true,
        thumbnailMediaId: "thumb-asset-123",
        trailerMediaId: "trailer-asset-456",
        totalDurationSeconds: 5400,
        sections: [],
        pricingDraft: {
          pricingType: "paid",
          sellingPrice: "2,499",
          originalPrice: "3,999",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "restricted",
          durationMode: "fixed",
          fixedDurationValue: 6,
          fixedDurationUnit: "Months",
          enableQA: true,
          enableComments: false,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: true,
        manualIncludesDraft: [
          { id: "inc-1", text: "Downloadable Cheatsheets" },
          { id: "inc-2", text: "Verified Completion Certificate" },
        ],
      });

      expect(result).not.toBeNull();
      expect(result?.course.title).toBe("Complete TypeScript Mastery");
      expect(result?.course.shortDescription).toBe(
        "A deep dive into advanced TypeScript patterns.",
      );
      expect(result?.course.description).toBe(
        "Full course curriculum covering generics, ASTs, and types.",
      );
      expect(result?.course.categoryId).toBe("cat-dev");
      expect(result?.course.difficulty).toBe("advanced");
      expect(result?.course.instructorAlias).toBe("Senior Architect");
      expect(result?.course.version).toBe(3);
      expect(result?.course.status).toBe("published");
      expect(result?.course.thumbnailMediaId).toBe("thumb-asset-123");
      expect(result?.course.trailerMediaId).toBe("trailer-asset-456");
      expect(result?.course.totalDurationSeconds).toBe(5400);

      // Settings
      expect(result?.settings?.language).toBe("es");
      expect(result?.settings?.showInstructorName).toBe(true);
      expect(result?.settings?.certificateEnabled).toBe(true);
      expect(result?.settings?.allowQa).toBe(true);
      expect(result?.settings?.allowComments).toBe(false);
      expect(result?.settings?.allowDownloads).toBe(true);

      // Access Rules: 6 months = 180 days
      expect(result?.accessRules?.accessType).toBe("restricted");
      expect(result?.accessRules?.durationType).toBe("fixed_duration");
      expect(result?.accessRules?.durationDays).toBe(180);

      // Pricing
      expect(result?.pricing?.pricingType).toBe("paid");
      expect(result?.pricing?.price).toBe(3999);
      expect(result?.pricing?.salePrice).toBe(2499);
      expect(result?.pricing?.currency).toBe("INR");

      // Inclusions
      expect(result?.includes).toHaveLength(2);
      expect(result?.includes?.[0]?.text).toBe("Downloadable Cheatsheets");
      expect(result?.includes?.[1]?.text).toBe(
        "Verified Completion Certificate",
      );
    });

    it("preserves an explicit thumbnail removal in local preview data", () => {
      const result = buildLocalPreviewData({
        currentCourseId: "course-thumbnail-removal",
        courseTitle: "Thumbnail Removal",
        shortDescription: "",
        courseDescription: "",
        categoryId: "",
        difficultyLevel: "",
        language: "en",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 2,
        isPublished: false,
        thumbnailMediaId: null,
        editorData: {
          course: { thumbnailMediaId: "existing-thumbnail" },
        } as CourseEditorDataResponse,
        sections: [],
        pricingDraft: {
          pricingType: "free",
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      });

      expect(result?.course.thumbnailMediaId).toBeNull();
    });

    it("correctly calculates duration days across Days, Weeks, Months, and Years", () => {
      const baseParams = {
        currentCourseId: "course-123",
        courseTitle: "Access Rules Course",
        shortDescription: "",
        courseDescription: "",
        categoryId: "",
        difficultyLevel: "" as const,
        language: "en",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [],
        pricingDraft: {
          pricingType: "free" as const,
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      };

      const daysResult = buildLocalPreviewData({
        ...baseParams,
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "fixed",
          fixedDurationValue: 45,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
      });
      expect(daysResult?.accessRules?.durationDays).toBe(45);

      const weeksResult = buildLocalPreviewData({
        ...baseParams,
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "fixed",
          fixedDurationValue: 3,
          fixedDurationUnit: "Weeks",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
      });
      expect(weeksResult?.accessRules?.durationDays).toBe(21);

      const yearsResult = buildLocalPreviewData({
        ...baseParams,
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "fixed",
          fixedDurationValue: 2,
          fixedDurationUnit: "Years",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
      });
      expect(yearsResult?.accessRules?.durationDays).toBe(730);

      const lifetimeResult = buildLocalPreviewData({
        ...baseParams,
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
      });
      expect(lifetimeResult?.accessRules?.durationType).toBe("lifetime");
      expect(lifetimeResult?.accessRules?.durationDays).toBeNull();
    });

    it("correctly maps curriculum sections, lessons, preview tags, and resources", () => {
      const result = buildLocalPreviewData({
        currentCourseId: "course-curr-id",
        courseTitle: "Curriculum Structure Course",
        shortDescription: "",
        courseDescription: "",
        categoryId: "",
        difficultyLevel: "intermediate",
        language: "en",
        instructorAlias: "",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [
          {
            id: "sec-1",
            title: "Getting Started",
            lessons: [
              {
                id: "les-1",
                title: "Welcome Video",
                description: "Introduction video",
                contentType: "video",
                isPreview: true,
                isPublished: true,
                resources: [
                  { id: "res-1", name: "Slides.pdf", mediaAssetId: "asset-1" },
                ],
              },
              {
                id: "les-2",
                title: "Environment Setup",
                description: "Setup guide",
                contentType: "document",
                isPreview: false,
                isPublished: true,
              },
            ],
          },
          {
            id: "sec-2",
            title: "Advanced Concepts",
            lessons: [
              {
                id: "les-3",
                title: "Deep Dive",
                contentType: "video",
                isPreview: false,
                isPublished: false,
              },
            ],
          },
        ],
        pricingDraft: {
          pricingType: "free",
          sellingPrice: "",
          originalPrice: "",
          currency: "USD",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: false,
        manualIncludesDraft: [],
      });

      expect(result?.course.totalSections).toBe(2);
      expect(result?.course.totalLessons).toBe(3);
      expect(result?.sections).toHaveLength(2);

      const sec1 = result?.sections[0];
      expect(sec1?.title).toBe("Getting Started");
      expect(sec1?.position).toBe(0);
      expect(sec1?.lessons).toHaveLength(2);
      expect(sec1?.lessons?.[0]?.title).toBe("Welcome Video");
      expect(sec1?.lessons?.[0]?.isPreview).toBe(true);
      expect(sec1?.lessons?.[0]?.position).toBe(0);
      expect(sec1?.lessons?.[0]?.resources).toHaveLength(1);
      expect(sec1?.lessons?.[1]?.title).toBe("Environment Setup");
      expect(sec1?.lessons?.[1]?.isPreview).toBe(false);

      const sec2 = result?.sections[1];
      expect(sec2?.title).toBe("Advanced Concepts");
      expect(sec2?.position).toBe(1);
      expect(sec2?.lessons?.[0]?.title).toBe("Deep Dive");
    });
  });

  describe("2. Pricing Payload Helper (buildPricingPayload)", () => {
    it("handles free pricing", () => {
      const payload = buildPricingPayload({
        pricingType: "free",
        sellingPrice: "999",
        originalPrice: "1999",
        currency: "USD",
      });
      expect(payload).toEqual({
        pricingType: "free",
        price: 0,
        salePrice: null,
        currency: "USD",
      });
    });

    it("handles paid pricing without sale price", () => {
      const payload = buildPricingPayload({
        pricingType: "paid",
        sellingPrice: "1,500",
        originalPrice: "",
        currency: "EUR",
      });
      expect(payload).toEqual({
        pricingType: "paid",
        price: 1500,
        salePrice: null,
        currency: "EUR",
      });
    });

    it("handles paid pricing with sale price and discount", () => {
      const payload = buildPricingPayload({
        pricingType: "paid",
        sellingPrice: "800",
        originalPrice: "1,000",
        currency: "GBP",
      });
      expect(payload).toEqual({
        pricingType: "paid",
        price: 1000,
        salePrice: 800,
        currency: "GBP",
      });
    });
  });

  describe("3. CourseOverviewPage Integration with Local Preview Data", () => {
    it("renders local preview data immediately without generic spinner", () => {
      const localData = buildLocalPreviewData({
        currentCourseId: "11111111-2222-3333-4444-555555555555",
        courseTitle: "Interactive React Architecture",
        shortDescription: "Learn scalable frontends.",
        courseDescription: "Detailed markdown description of the course.",
        categoryId: "cat-dev",
        difficultyLevel: "advanced",
        language: "en",
        instructorAlias: "Master Instructor",
        showInstructorName: true,
        courseVersion: 1,
        isPublished: false,
        sections: [
          {
            id: "sec-1",
            title: "Architecture 101",
            lessons: [
              {
                id: "les-1",
                title: "Component Tree Design",
                contentType: "video",
                isPreview: true,
                isPublished: true,
              },
            ],
          },
        ],
        pricingDraft: {
          pricingType: "paid",
          sellingPrice: "500",
          originalPrice: "1000",
          currency: "USD",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: true,
        manualIncludesDraft: [
          { id: "inc-1", text: "Lifetime Access to Material" },
        ],
      });

      expect(localData).not.toBeNull();

      renderWithClient(
        <CourseOverviewPage
          previewData={localData!}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      // Title rendered
      expect(
        screen.getByRole("heading", {
          name: "Interactive React Architecture",
          level: 1,
        }),
      ).toBeVisible();

      // Category rendered
      expect(screen.getByText("Development")).toBeVisible();

      // Difficulty tag is not rendered on course overview and preview page
      expect(screen.queryByText("ADVANCED")).toBeNull();

      // Section and Lesson rendered
      expect(screen.getByText("Architecture 101")).toBeVisible();
      expect(screen.getByText("Component Tree Design")).toBeVisible();

      // Pricing rendered ($500 sale, $1,000 orig, 50% OFF)
      expect(screen.getByText("$500")).toBeVisible();
      expect(screen.getByText("$1,000")).toBeVisible();
      expect(screen.getByText("50% OFF")).toBeVisible();

      // Inclusions rendered
      expect(screen.getByText("Lifetime Access to Material")).toBeVisible();
    });
  });

  describe("4. 4-Tier Hierarchy Behavior Verification", () => {
    it("renders CourseOverviewSkeleton pulse placeholder when loading with onNavigateCourses", () => {
      const onNavigateCourses = vi.fn();
      renderWithClient(
        <CourseOverviewSkeleton onNavigateCourses={onNavigateCourses} />,
      );

      const skeleton = screen.getByTestId("course-overview-skeleton");
      expect(skeleton).toBeVisible();
      expect(skeleton).toHaveClass("animate-pulse");
    });

    it("verifies adaptPreviewDataToOverview strictly follows contract with local data", () => {
      const localData = buildLocalPreviewData({
        currentCourseId: "test-course-id",
        courseTitle: "Local Adaptation Test",
        shortDescription: "A short summary",
        courseDescription: "Full course description body",
        categoryId: "cat-design",
        difficultyLevel: "beginner",
        language: "es",
        instructorAlias: "Design Lead",
        showInstructorName: true,
        courseVersion: 2,
        isPublished: true,
        sections: [
          {
            id: "sec-1",
            title: "Color Theory",
            lessons: [
              {
                id: "les-1",
                title: "Palettes and Contrast",
                contentType: "video",
                isPreview: true,
                isPublished: true,
              },
            ],
          },
        ],
        pricingDraft: {
          pricingType: "free",
          sellingPrice: "",
          originalPrice: "",
          currency: "INR",
        },
        accessRulesDraft: {
          accessType: "everyone",
          durationMode: "lifetime",
          fixedDurationValue: 30,
          fixedDurationUnit: "Days",
          enableQA: true,
          enableComments: true,
          enableDownloads: true,
          enableNotes: true,
        },
        enableCertificate: false,
        manualIncludesDraft: [{ id: "p1", text: "Design Assets" }],
        totalDurationSeconds: 5400,
      });

      const adapted = adaptPreviewDataToOverview(
        localData!,
        mockCategories,
        "Fallback Instructor",
      );

      expect(adapted.course.title).toBe("Local Adaptation Test");
      expect(adapted.categoryName).toBe("Design");
      expect(adapted.course.level).toBe("Beginner");
      expect(adapted.instructorName).toBe("Design Lead");
      expect(adapted.language).toBe("Spanish");
      expect(adapted.course.duration).toBe("1h 30m");
      expect(adapted.pricing.price).toBe("Free");
      expect(adapted.sections).toHaveLength(1);
      expect(adapted.sections[0]!.title).toBe("Color Theory");
      expect(adapted.sections[0]!.lessons[0]![1]).toBe("Palettes and Contrast");
      expect(adapted.sections[0]!.lessons[0]![4]).toBe(true); // isPreview
      expect(adapted.inclusions).toEqual(["Design Assets"]);
    });
  });
});
