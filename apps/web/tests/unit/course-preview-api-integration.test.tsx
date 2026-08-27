import { render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it } from "vitest";
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
    const metaElem = screen.getByText("English");

    expect(titleElem).toBeVisible();
    expect(metaElem).toBeVisible();

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

  it("renders dynamic language from settings in meta row", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("English")).toBeVisible();
  });

  it("renders non-English languages dynamically", () => {
    const spanishCourseData: CourseEditorDataResponse = {
      ...mockPreviewData,
      settings: {
        ...mockPreviewData.settings!,
        language: "es",
      },
    };

    render(
      <CourseOverviewPage
        previewData={spanishCourseData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("Spanish")).toBeVisible();
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

  it("renders server access rules: lifetime access", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("Full lifetime access")).toBeVisible();
  });

  it("renders server access rules: fixed duration access", () => {
    const fixedAccessPreviewData: CourseEditorDataResponse = {
      ...mockPreviewData,
      accessRules: {
        id: "acc-2",
        courseId: mockPreviewData.course.id,
        accessType: "everyone",
        durationType: "fixed_duration",
        durationDays: 30,
      },
    };

    render(
      <CourseOverviewPage
        previewData={fixedAccessPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByText("30 days access")).toBeVisible();
    expect(screen.queryByText("Full lifetime access")).toBeNull();
  });

  it("renders certificate perk when certificateEnabled is true and omits when false", () => {
    render(
      <CourseOverviewPage
        previewData={mockPreviewData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );
    expect(screen.getByText("Certificate of completion")).toBeVisible();

    const noCertData: CourseEditorDataResponse = {
      ...mockPreviewData,
      settings: {
        ...mockPreviewData.settings!,
        certificateEnabled: false,
      },
    };

    const { unmount } = render(
      <CourseOverviewPage
        previewData={noCertData}
        categories={mockCategories}
        isReadOnlyPreview={true}
      />,
    );
    expect(screen.queryAllByText("Certificate of completion").length).toBe(1);
    unmount();
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
});
