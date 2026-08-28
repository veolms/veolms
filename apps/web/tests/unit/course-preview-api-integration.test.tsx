import { render as rtlRender, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Category, CourseEditorDataResponse } from "@veolms/contracts";
import {
  CourseOverviewPage,
  formatPriceWithCurrency,
  getCurrencySymbol,
  getLanguageLabel,
  getPriceSizeVariant,
  isCourseSaleActive,
} from "../../src/courses/CourseOverviewPage";
import { courseKeys } from "../../src/services/courses/courses.keys";

function render(ui: React.ReactElement) {
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

describe("Course Preview API Integration - Dynamic Metadata & Layout", () => {
  const mockCategories: Category[] = [
    { id: "cat-1", name: "Web Development", slug: "web-development" },
    { id: "cat-2", name: "UI/UX Design", slug: "ui-ux-design" },
  ];

  const mockPreviewData: CourseEditorDataResponse = {
    course: {
      id: "11111111-1111-4111-a111-111111111111",
      slug: "fullstack-mastery",
      title: "Fullstack Web Engineering",
      shortDescription: "A comprehensive guide to fullstack mastery.",
      description: "### Master Fullstack\n\nLearn modern web architecture.",
      difficulty: "advanced",
      status: "draft",
      creatorId: "user-123",
      categoryId: "cat-1",
      thumbnailMediaId: null,
      trailerMediaId: null,
      version: 1,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      publishedAt: null,
    },
    sections: [
      {
        id: "22222222-2222-4222-a222-222222222222",
        courseId: "11111111-1111-4111-a111-111111111111",
        title: "Architecture & Foundations",
        position: 0,
        lessons: [
          {
            id: "33333333-3333-4333-a333-333333333331",
            sectionId: "22222222-2222-4222-a222-222222222222",
            courseId: "11111111-1111-4111-a111-111111111111",
            title: "System Design Overview",
            description: null,
            contentType: "video",
            contentMediaId: "media-1",
            position: 0,
            isPreview: true,
            isPublished: true,
          },
          {
            id: "33333333-3333-4333-a333-333333333332",
            sectionId: "22222222-2222-4222-a222-222222222222",
            courseId: "11111111-1111-4111-a111-111111111111",
            title: "Setup Cheatsheet.pdf",
            description: null,
            contentType: "document",
            contentMediaId: "media-2",
            position: 1,
            isPreview: false,
            isPublished: true,
          },
        ],
      },
      {
        id: "22222222-2222-4222-a222-222222222223",
        courseId: "11111111-1111-4111-a111-111111111111",
        title: "Empty Section for Testing",
        position: 1,
        lessons: [],
      },
    ],
    accessRules: {
      id: "acc-1",
      courseId: "11111111-1111-4111-a111-111111111111",
      accessType: "everyone",
      durationType: "lifetime",
      durationDays: null,
    },
    pricing: {
      id: "pr-1",
      courseId: "11111111-1111-4111-a111-111111111111",
      pricingType: "paid",
      price: 100,
      currency: "USD",
      salePrice: 80,
    },
    settings: {
      id: "set-1",
      courseId: "11111111-1111-4111-a111-111111111111",
      language: "en",
      estimatedDuration: 4,
      allowQa: true,
      allowComments: true,
      allowDownloads: true,
      certificateEnabled: true,
      showInstructorName: true,
    },
  };

  it("builds the correct React Query key for course preview", () => {
    const courseId = "test-course-id";
    expect(courseKeys.preview(courseId)).toEqual(["courses", "preview", "test-course-id"]);
  });

  it("does not render shortDescription in hero section to keep composition clean", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    const titleElem = screen.getByRole("heading", { name: "Fullstack Web Engineering", level: 1 });

    expect(titleElem).toBeVisible();

    // Short description should not be rendered in the preview hero
    expect(screen.queryByText("A comprehensive guide to fullstack mastery.")).toBeNull();
  });

  it("renders dynamic category in the metadata row and not as a top badge", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    // Category should be visible in metadata
    expect(screen.getByText("Web Development")).toBeVisible();
    // Top row level badge should be present
    expect(screen.getByText("ADVANCED")).toBeVisible();
    // Category should NOT be an aria-label badge in the top row
    expect(screen.queryByLabelText("Category: Web Development")).toBeNull();
  });

  it("omits category from metadata when categoryId is null without fake default text", () => {
    const noCatData: CourseEditorDataResponse = {
      ...mockPreviewData,
      course: {
        ...mockPreviewData.course,
        categoryId: null,
      },
    };

    render(
      <CourseOverviewPage
        previewData={noCatData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.queryByText("Web Development")).toBeNull();
    expect(screen.getByText("ADVANCED")).toBeVisible();
  });

  it("omits language from metadata row while preserving resolution helper for future use", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    // Language is hidden from overview metadata per current requirement
    expect(screen.queryByText("English")).toBeNull();
    // Helper function continues to resolve properly
    expect(getLanguageLabel("en")).toBe("English");
    expect(getLanguageLabel("es")).toBe("Spanish");
  });

  it("calculates price size variant based on digit magnitude", () => {
    expect(getPriceSizeVariant("Free")).toBe("normal");
    expect(getPriceSizeVariant("$99")).toBe("normal");
    expect(getPriceSizeVariant("₹1,999")).toBe("normal");
    expect(getPriceSizeVariant("₹49,999")).toBe("medium"); // 5 digits
    expect(getPriceSizeVariant("₹500,000")).toBe("large"); // 6 digits
    expect(getPriceSizeVariant("$1,000,000")).toBe("large"); // 7 digits
    expect(getPriceSizeVariant("₹50,000,000")).toBe("xlarge"); // 8 digits
  });

  it("renders dynamic currency for INR, EUR, GBP, USD", () => {
    expect(getCurrencySymbol("INR")).toBe("₹");
    expect(getCurrencySymbol("USD")).toBe("$");
    expect(getCurrencySymbol("EUR")).toBe("€");
    expect(getCurrencySymbol("GBP")).toBe("£");
    expect(formatPriceWithCurrency(1000, "INR")).toBe("₹1,000");
    expect(formatPriceWithCurrency(1000, "USD")).toBe("$1,000");
    expect(formatPriceWithCurrency(1000, "EUR")).toBe("€1,000");
    expect(formatPriceWithCurrency(1000, "GBP")).toBe("£1,000");
  });

  it("renders large price (₹500,000) with proper pricing layout and without overlap", () => {
    const largePriceData: CourseEditorDataResponse = {
      ...mockPreviewData,
      pricing: {
        id: "pr-large",
        courseId: mockPreviewData.course.id,
        pricingType: "paid",
        price: 700000,
        currency: "INR",
        salePrice: 500000,
      },
    };

    render(
      <CourseOverviewPage
        previewData={largePriceData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("₹500,000")).toBeVisible();
    expect(screen.getByText("₹700,000")).toBeVisible();
    expect(screen.getByText("29% OFF")).toBeVisible();
  });

  it("renders free pricing when pricingType is free", () => {
    const freePreviewData: CourseEditorDataResponse = {
      ...mockPreviewData,
      pricing: {
        id: "pr-2",
        courseId: mockPreviewData.course.id,
        pricingType: "free",
        price: 0,
        currency: "USD",
      },
    };

    render(
      <CourseOverviewPage
        previewData={freePreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("Free")).toBeVisible();
    expect(screen.getByText("Enroll for Free")).toBeVisible();
  });

  it("renders active sale price and dynamic discount percentage", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    // Sale price $80 and original price $100 -> 20% OFF
    expect(screen.getByText("$80")).toBeVisible();
    expect(screen.getByText("$100")).toBeVisible();
    expect(screen.getByText("20% OFF")).toBeVisible();
  });

  it("respects sale window: inactive when salePrice is invalid or zero", () => {
    const invalidSaleData: CourseEditorDataResponse = {
      ...mockPreviewData,
      pricing: {
        id: "pr-invalid",
        courseId: mockPreviewData.course.id,
        pricingType: "paid",
        price: 100,
        currency: "USD",
        salePrice: 0,
      },
    };

    expect(
      isCourseSaleActive(
        invalidSaleData.pricing?.salePrice,
        invalidSaleData.pricing?.price!,
      ),
    ).toBe(false);

    render(
      <CourseOverviewPage
        previewData={invalidSaleData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    // Regular price displayed, no discount
    expect(screen.getByText("$100")).toBeVisible();
    expect(screen.queryByText("0% OFF")).toBeNull();
  });

  it("respects sale window: inactive when saleStartsAt is in the future", () => {
    expect(
      isCourseSaleActive(
        150,
        200,
        "2099-01-01T00:00:00.000Z",
        "2099-01-10T00:00:00.000Z",
      ),
    ).toBe(false);
  });

  describe("Course Includes Source of Truth in Preview", () => {
    it("renders saved previewData.includes as single source of truth in exact position order", () => {
      const previewWithIncludes: CourseEditorDataResponse = {
        ...mockPreviewData,
        includes: [
          {
            id: "inc-2",
            courseId: mockPreviewData.course.id,
            text: "1-on-1 Mentorship Session",
            position: 1,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "inc-1",
            courseId: mockPreviewData.course.id,
            text: "Official Course Certificate",
            position: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "inc-3",
            courseId: mockPreviewData.course.id,
            text: "Lifetime Access",
            position: 2,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      };

      const { container } = render(
        <CourseOverviewPage
          previewData={previewWithIncludes}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      // Verify all items are rendered
      expect(screen.getByText("Official Course Certificate")).toBeVisible();
      expect(screen.getByText("1-on-1 Mentorship Session")).toBeVisible();
      expect(screen.getByText("Lifetime Access")).toBeVisible();

      // Verify exact order: "Official Course Certificate" (pos 0) comes before "1-on-1 Mentorship Session" (pos 1)
      const perks = container.querySelectorAll(".border-t span.font-medium span");
      const perkTexts = Array.from(perks).map((el) => el.textContent?.trim());
      expect(perkTexts).toEqual([
        "Official Course Certificate",
        "1-on-1 Mentorship Session",
        "Lifetime Access",
      ]);
    });

    it("does not automatically generate or prepend hardcoded perks when omitted", () => {
      const previewWithCustomOnly: CourseEditorDataResponse = {
        ...mockPreviewData,
        settings: {
          ...mockPreviewData.settings!,
          certificateEnabled: true,
        },
        accessRules: {
          ...mockPreviewData.accessRules!,
          durationType: "lifetime",
        },
        includes: [
          {
            id: "inc-custom",
            courseId: mockPreviewData.course.id,
            text: "Community Discord Access",
            position: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      };

      render(
        <CourseOverviewPage
          previewData={previewWithCustomOnly}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      // Custom inclusion is rendered
      expect(screen.getByText("Community Discord Access")).toBeVisible();

      // Auto-derived strings must NOT be prepended
      expect(screen.queryByText("Full lifetime access")).toBeNull();
      expect(screen.queryByText("Certificate of completion")).toBeNull();
      expect(screen.queryByText("Free preview")).toBeNull();
    });

    it("does not render any perk row when previewData.includes is empty (deleted includes do not reappear)", () => {
      const emptyIncludesData: CourseEditorDataResponse = {
        ...mockPreviewData,
        includes: [],
      };

      render(
        <CourseOverviewPage
          previewData={emptyIncludesData}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      expect(screen.queryByText("Full lifetime access")).toBeNull();
      expect(screen.queryByText("Certificate of completion")).toBeNull();
      expect(screen.queryByText("Access on mobile & desktop")).toBeNull();
    });
  });

  it("renders real curriculum sections and empty lesson state without synthetic lessons", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("Architecture & Foundations")).toBeVisible();
    expect(screen.getByText("System Design Overview")).toBeVisible();
    expect(screen.getByText("Setup Cheatsheet.pdf")).toBeVisible();
    expect(screen.getByText("Empty Section for Testing")).toBeVisible();
    expect(screen.getByText("No lessons added yet")).toBeVisible();

    // No fake lessons or fake durations
    expect(screen.queryByText("Welcome to the course and setup your environment")).toBeNull();
    expect(screen.queryByText("05:24")).toBeNull();
  });

  it("renders empty curriculum state when no sections exist", () => {
    const emptyCurriculumData: CourseEditorDataResponse = {
      ...mockPreviewData,
      sections: [],
    };

    render(
      <CourseOverviewPage
        previewData={emptyCurriculumData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("No sections added yet")).toBeVisible();
  });

  describe("Duration and Instructor Metadata Handling", () => {
    it("renders 0h0m duration when estimated duration is omitted / no media", () => {
      const noDurationData: CourseEditorDataResponse = {
        ...mockPreviewData,
        settings: {
          ...mockPreviewData.settings!,
          estimatedDuration: undefined,
        },
      };

      render(
        <CourseOverviewPage
          previewData={noDurationData}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      expect(screen.getByText("0h0m")).toBeVisible();
    });

    it("renders instructor alias when provided and showInstructorName is true", () => {
      const aliasData: CourseEditorDataResponse = {
        ...mockPreviewData,
        course: {
          ...mockPreviewData.course,
          instructorAlias: "Prof. Ada Lovelace",
        },
        settings: {
          ...mockPreviewData.settings!,
          showInstructorName: true,
        },
      };

      render(
        <CourseOverviewPage
          previewData={aliasData}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      expect(screen.getByText("Prof. Ada Lovelace")).toBeVisible();
    });

    it("omits instructor from metadata row when showInstructorName is false", () => {
      const noInstructorData: CourseEditorDataResponse = {
        ...mockPreviewData,
        course: {
          ...mockPreviewData.course,
          instructorAlias: "Prof. Ada Lovelace",
        },
        settings: {
          ...mockPreviewData.settings!,
          showInstructorName: false,
        },
      };

      render(
        <CourseOverviewPage
          previewData={noInstructorData}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      expect(screen.queryByText("Prof. Ada Lovelace")).toBeNull();
      expect(screen.queryByText("Instructor")).toBeNull();
    });

    it("renders green ticks for Course Inclusions", () => {
      const includesData: CourseEditorDataResponse = {
        ...mockPreviewData,
        includes: [
          {
            id: "inc-green",
            courseId: mockPreviewData.course.id,
            text: "Premium Mentorship",
            position: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ],
      };

      const { container } = render(
        <CourseOverviewPage
          previewData={includesData}
          categories={mockCategories}
          isReadOnlyPreview={true}
        />,
      );

      const checkmark = container.querySelector(".border-t svg");
      expect(checkmark?.getAttribute("class")).toContain("text-emerald-500");
    });
  });
});
