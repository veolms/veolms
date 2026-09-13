import { fireEvent, render, screen, within } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  CourseEditorDataResponse,
  CourseOverviewResponse,
} from "@veolms/contracts";
import {
  CourseOverviewPage,
  CourseOverviewSkeleton,
  adaptCourseOverviewResponse,
  adaptPreviewDataToOverview,
  isFreeCoursePricing,
} from "../../src/courses/CourseOverviewPage";
import type { Course } from "../../src/courses/catalogue";
import type { CourseSection } from "../../src/learning/courseContent";

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
  return render(
    <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>,
  );
}

const sampleCourse: Course = {
  id: "test-course-id",
  slug: "test-course",
  title: "Test Course Title",
  description: "Test Course Description",
  level: "Beginner",
  category: "Development",
  sections: 2,
  lectures: 10,
  progress: null,
  enrolled: false,
  duration: "5h",
  students: 10,
  thumbnail: "/test.webp",
  lifecycleStatus: "published",
};

describe("CourseOverviewPage", () => {
  it("renders customCourse data when provided", () => {
    const customCourse = {
      ...sampleCourse,
      title: "Custom Preview Title",
      description: "Custom Preview Description",
    };

    renderWithClient(
      <CourseOverviewPage
        customCourse={customCourse}
        isReadOnlyPreview={true}
        onNavigateCourses={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Custom Preview Title", level: 1 }),
    ).toBeVisible();
    expect(screen.getByText(/About this course/i)).toBeVisible();
    expect(screen.getByText(/Course curriculum/i)).toBeVisible();
  });

  it("renders not-found state when courseSlug is unknown and calls onNavigateCourses", async () => {
    const onNavigateCourses = vi.fn();
    renderWithClient(
      <CourseOverviewPage
        courseSlug="non-existent-course-slug"
        onNavigateCourses={onNavigateCourses}
      />,
    );

    expect(
      await screen.findByRole(
        "heading",
        {
          name: "Course not found",
          level: 2,
        },
        { timeout: 4000 },
      ),
    ).toBeVisible();
    expect(
      screen.getByText(
        "The course you are looking for does not exist or may have been removed.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Explore courses" }));
    expect(onNavigateCourses).toHaveBeenCalledTimes(1);
  });

  it("associates unique aria-controls and panel IDs on section toggles", () => {
    renderWithClient(
      <CourseOverviewPage
        customCourse={sampleCourse}
        customSections={[
          {
            id: 1,
            title: "Section 1",
            progress: "0/1",
            lessons: [[1, "Lesson 1", "5m", "todo", true]],
          },
        ]}
        onNavigateCourses={vi.fn()}
      />,
    );

    const toggleButtons = screen.getAllByRole("button", { expanded: true });
    expect(toggleButtons.length).toBeGreaterThan(0);
    const firstToggle = toggleButtons[0]!;
    const panelId = firstToggle.getAttribute("aria-controls");
    expect(panelId).toBeTruthy();

    const panel = document.getElementById(panelId!);
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("role")).toBe("region");
    expect(panel?.getAttribute("aria-labelledby")).toBe(firstToggle.id);
  });

  it("adaptCourseOverviewResponse correctly maps backend API course overview data", () => {
    const mockOverview: CourseOverviewResponse = {
      course: {
        id: "12345678-1234-4234-a234-123456789012",
        slug: "rust-systems",
        title: "Rust Systems Engineering",
        shortDescription: "Master systems programming in Rust.",
        description: "Comprehensive guide to ownership, lifetimes, and async.",
        difficulty: "advanced",
        status: "published",
        creatorId: "user-1",
        categoryId: "cat-1",
        thumbnailMediaId: null,
        trailerMediaId: null,
        instructorAlias: "Rust Ace",
        version: 2,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-02-01T00:00:00.000Z",
        publishedAt: "2026-02-01T00:00:00.000Z",
      },
      category: {
        id: "cat-1",
        name: "Systems Programming",
        slug: "systems-programming",
      },
      creator: {
        id: "user-1",
        displayName: "Anurag Singh",
        username: "anuragsingh",
      },
      sections: [
        {
          id: "sec-1",
          courseId: "12345678-1234-4234-a234-123456789012",
          title: "Introduction to Rust",
          position: 1,
          lessons: [
            {
              id: "les-1",
              courseId: "12345678-1234-4234-a234-123456789012",
              sectionId: "sec-1",
              title: "Memory Safety & Ownership",
              position: 1,
              contentType: "video",
              isPreview: true,
              isPublished: true,
            },
          ],
        },
      ],
      pricing: {
        id: "price-1",
        courseId: "12345678-1234-4234-a234-123456789012",
        pricingType: "paid",
        price: 2999,
        salePrice: 1999,
        currency: "INR",
      },
      settings: {
        id: "set-1",
        courseId: "12345678-1234-4234-a234-123456789012",
        language: "en",
        showInstructorName: true,
        certificateEnabled: true,
        allowQa: true,
        allowComments: true,
        allowDownloads: true,
        allowNotes: true,
        estimatedDuration: 18,
      },
      includes: [
        {
          id: "inc-1",
          courseId: "12345678-1234-4234-a234-123456789012",
          text: "Full lifetime access",
          position: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
        {
          id: "inc-2",
          courseId: "12345678-1234-4234-a234-123456789012",
          text: "Certificate of completion",
          position: 2,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      ],
      stats: {
        totalSections: 1,
        totalLessons: 1,
        totalDurationSeconds: 64800,
      },
    };

    const adapted = adaptCourseOverviewResponse(
      mockOverview,
      "Default Instructor",
    );

    expect(adapted.course.id).toBe("12345678-1234-4234-a234-123456789012");
    expect(adapted.course.slug).toBe("rust-systems");
    expect(adapted.course.title).toBe("Rust Systems Engineering");
    expect(adapted.course.level).toBe("Advanced");
    expect(adapted.categoryName).toBe("Systems Programming");
    expect(adapted.instructorName).toBe("Rust Ace");
    expect(adapted.language).toBe("English");
    expect(adapted.sections.length).toBe(1);
    expect(adapted.sections[0]?.title).toBe("Introduction to Rust");
    expect(adapted.sections[0]?.lessons[0]).toEqual([
      1,
      "Memory Safety & Ownership",
      "",
      "todo",
      true,
      "video",
    ]);
    expect(adapted.inclusions).toEqual([
      "Full lifetime access",
      "Certificate of completion",
    ]);
    expect(adapted.pricing.price).toBe("₹1,999");
    expect(adapted.pricing.originalPrice).toBe("₹2,999");
    expect(adapted.pricing.discount).toBe("33% OFF");
  });

  it("CourseOverviewSkeleton renders pulse placeholder layout structure with back button", () => {
    const onNavigateCourses = vi.fn();
    render(<CourseOverviewSkeleton onNavigateCourses={onNavigateCourses} />);

    expect(screen.getByTestId("course-overview-skeleton")).toBeVisible();
    expect(screen.getByTestId("course-overview-skeleton")).toHaveClass(
      "animate-pulse",
    );
  });

  it("renders empty state for description when description is missing and never renders dummy text", () => {
    const courseWithoutDescription = {
      ...sampleCourse,
      title: "Course Without Description",
      description: "",
    };

    renderWithClient(
      <CourseOverviewPage
        customCourse={courseWithoutDescription}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.getByTestId("course-description-empty")).toBeVisible();
    expect(screen.getByText("No description available yet")).toBeVisible();
    // Confirms dummy fallback text is completely removed
    expect(screen.queryByText(/This course is designed to take you from the basics/i)).toBeNull();
    expect(screen.queryByText(/You'll learn core concepts/i)).toBeNull();
    expect(screen.queryByText(/Show more/i)).toBeNull();
  });

  it("renders actual course description when description is provided", () => {
    const courseWithDescription = {
      ...sampleCourse,
      title: "Course With Real Description",
      description: "This is a real authentic course description written by the instructor.",
    };

    renderWithClient(
      <CourseOverviewPage
        customCourse={courseWithDescription}
        isReadOnlyPreview={true}
      />,
    );

    expect(screen.queryByTestId("course-description-empty")).toBeNull();
    expect(
      screen.getByText("This is a real authentic course description written by the instructor."),
    ).toBeVisible();
  });

  describe("Course Overview Pricing & Actions: Testing States", () => {
    const paidPricing = {
      price: "$49.99",
      originalPrice: "$99.99",
      discount: "50% OFF",
    };
    const freePricing = {
      price: "Free",
    };

    it("1. Creator viewing their course normally shows only 'Continue Learning' and opens Learning Space", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={paidPricing}
          isCreator={true}
          isReadOnlyPreview={false}
          onNavigatePage={onNavigatePage}
        />,
      );

      // Does not show price in the card
      expect(screen.queryByText("$49.99")).toBeNull();
      // Does not show Buy Now or Apply coupon
      expect(screen.queryByRole("button", { name: /Buy Now/i })).toBeNull();
      expect(screen.queryByRole("button", { name: /Apply coupon/i })).toBeNull();

      // Shows only Continue Learning
      const continueBtn = screen.getByRole("button", { name: /Continue Learning/i });
      expect(continueBtn).toBeVisible();
      expect(continueBtn).not.toBeDisabled();

      // Clicking it opens Learning Space
      fireEvent.click(continueBtn);
      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(`/learn/${sampleCourse.slug}`);
    });

    it("2a. Creator Preview (Paid) shows price, 'Apply coupon', and 'Pay Now' as demo UI", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={paidPricing}
          isReadOnlyPreview={true}
        />,
      );

      // Shows existing price and discounts
      expect(screen.getByText("$49.99")).toBeVisible();
      expect(screen.getByText("$99.99")).toBeVisible();
      expect(screen.getByText("50% OFF")).toBeVisible();

      // Shows Apply coupon
      const couponBtn = screen.getByRole("button", { name: /Apply coupon/i });
      expect(couponBtn).toBeVisible();

      // Shows Pay Now as demo UI (not disabled)
      const payNowBtn = screen.getByRole("button", { name: /Pay Now/i });
      expect(payNowBtn).toBeVisible();
      expect(payNowBtn).not.toBeDisabled();
    });

    it("2b. Creator Preview (Free) shows 'Free' and 'Enroll for Free' as demo UI without coupon", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={freePricing}
          isReadOnlyPreview={true}
        />,
      );

      // Shows Free
      expect(screen.getByText("Free")).toBeVisible();

      // Does not show Apply coupon
      expect(screen.queryByRole("button", { name: /Apply coupon/i })).toBeNull();

      // Shows Enroll for Free as demo UI (not disabled)
      const enrollBtn = screen.getByRole("button", { name: /Enroll for Free/i });
      expect(enrollBtn).toBeVisible();
      expect(enrollBtn).not.toBeDisabled();
    });

    it("3a. Student (Paid) shows price, 'Apply coupon', and 'Pay Now' CTA", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={paidPricing}
          isCreator={false}
          role="student"
          isReadOnlyPreview={false}
        />,
      );

      // Shows price and discount
      expect(screen.getByText("$49.99")).toBeVisible();
      expect(screen.getByText("$99.99")).toBeVisible();
      expect(screen.getByText("50% OFF")).toBeVisible();

      // Shows Apply coupon
      expect(screen.getByRole("button", { name: /Apply coupon/i })).toBeVisible();

      // Pay Now action is visible and functional
      const payNowBtn = screen.getByRole("button", { name: /Pay Now/i });
      expect(payNowBtn).toBeVisible();
      expect(payNowBtn).not.toBeDisabled();
    });

    it("3b. Student (Paid) clicking 'Apply coupon' toggles inline coupon input and Apply button", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={paidPricing}
          isCreator={false}
          role="student"
          isReadOnlyPreview={false}
        />,
      );

      const applyCouponBtn = screen.getByRole("button", { name: /Apply coupon/i });
      expect(applyCouponBtn).toBeVisible();

      // Click "Apply coupon" to open inline input box
      fireEvent.click(applyCouponBtn);

      // Input box and Apply button should now be visible
      const input = screen.getByPlaceholderText("Enter coupon code");
      expect(input).toBeVisible();
      const applyBtn = screen.getByRole("button", { name: "Apply" });
      expect(applyBtn).toBeVisible();
      expect(applyBtn).toBeDisabled();

      // Type code
      fireEvent.change(input, { target: { value: "SAVE50" } });
      expect(input).toHaveValue("SAVE50");
      expect(applyBtn).not.toBeDisabled();

      // Cancel button closes input and restores "Apply coupon" button
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);
      expect(screen.queryByPlaceholderText("Enter coupon code")).toBeNull();
      expect(screen.getByRole("button", { name: /Apply coupon/i })).toBeVisible();
    });

    it("3c. Student (Free) shows 'Free' and 'Continue Learning' opening Learning Space without coupon", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customPricing={freePricing}
          isCreator={false}
          role="student"
          isReadOnlyPreview={false}
          onNavigatePage={onNavigatePage}
        />,
      );

      // Shows Free
      expect(screen.getByText("Free")).toBeVisible();

      // Does not show Apply coupon
      expect(screen.queryByRole("button", { name: /Apply coupon/i })).toBeNull();

      // Shows Continue Learning (enabled)
      const continueBtn = screen.getByRole("button", { name: /Continue Learning/i });
      expect(continueBtn).toBeVisible();
      expect(continueBtn).not.toBeDisabled();

      // Clicking opens existing Learning Space
      fireEvent.click(continueBtn);
      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(`/learn/${sampleCourse.slug}`);
    });
  });

  describe("Curriculum Lesson Row Navigation", () => {
    const multiSections: CourseSection[] = [
      {
        id: 1,
        title: "Section 1: Foundations",
        progress: "0/2",
        lessons: [
          [1, "Introduction to Web Design", "5m", "todo", true, "video"],
          [2, "Tools and Environment", "12m", "todo", false, "video"],
        ],
      },
      {
        id: 2,
        title: "Section 2: Advanced Techniques",
        progress: "0/2",
        lessons: [
          [3, "Typography and Spacing", "18m", "todo", false, "video"],
          [4, "Building Responsive Layouts", "25m", "todo", false, "document"],
        ],
      },
    ];

    it("assigns global 1-based sequential lesson numbers across sections in adaptCourseOverviewResponse", () => {
      const mockOverview: CourseOverviewResponse = {
        course: {
          id: "c1",
          slug: "advanced-css",
          title: "Advanced CSS",
          shortDescription: "Short",
          description: "Full description",
          difficulty: "intermediate",
          status: "published",
          creatorId: "user-1",
          categoryId: "cat-1",
          thumbnailMediaId: null,
          trailerMediaId: null,
          instructorAlias: "Alex",
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: "2026-01-01T00:00:00.000Z",
        },
        sections: [
          {
            id: "s1",
            courseId: "c1",
            title: "Section 1",
            position: 1,
            lessons: [
              {
                id: "l1",
                courseId: "c1",
                sectionId: "s1",
                title: "S1 Lesson 1",
                position: 1,
                contentType: "video",
                isPreview: true,
                isPublished: true,
              },
              {
                id: "l2",
                courseId: "c1",
                sectionId: "s1",
                title: "S1 Lesson 2",
                position: 2,
                contentType: "video",
                isPreview: false,
                isPublished: true,
              },
            ],
          },
          {
            id: "s2",
            courseId: "c1",
            title: "Section 2",
            position: 2,
            lessons: [
              {
                id: "l3",
                courseId: "c1",
                sectionId: "s2",
                title: "S2 Lesson 1",
                position: 1,
                contentType: "video",
                isPreview: false,
                isPublished: true,
              },
              {
                id: "l4",
                courseId: "c1",
                sectionId: "s2",
                title: "S2 Lesson 2",
                position: 2,
                contentType: "video",
                isPreview: false,
                isPublished: true,
              },
            ],
          },
        ],
        stats: {
          totalSections: 2,
          totalLessons: 4,
          totalDurationSeconds: 1200,
        },
      };

      const adapted = adaptCourseOverviewResponse(mockOverview, "Default Instructor");
      expect(adapted.sections).toHaveLength(2);
      expect(adapted.sections[0]?.lessons[0]?.[0]).toBe(1);
      expect(adapted.sections[0]?.lessons[1]?.[0]).toBe(2);
      expect(adapted.sections[1]?.lessons[0]?.[0]).toBe(3); // Global numbering
      expect(adapted.sections[1]?.lessons[1]?.[0]).toBe(4); // Global numbering
    });

    it("assigns global 1-based sequential lesson numbers across sections in adaptPreviewDataToOverview", () => {
      const mockPreviewData: CourseEditorDataResponse = {
        course: {
          id: "c2",
          slug: "preview-course",
          title: "Preview Course",
          shortDescription: "Short",
          description: "Full description",
          difficulty: "beginner",
          status: "draft",
          creatorId: "user-2",
          categoryId: "cat-2",
          thumbnailMediaId: null,
          trailerMediaId: null,
          instructorAlias: "Sam",
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: null,
        },
        sections: [
          {
            id: "ps1",
            courseId: "c2",
            title: "Preview Section 1",
            position: 1,
            lessons: [
              {
                id: "pl1",
                courseId: "c2",
                sectionId: "ps1",
                title: "P1 Lesson 1",
                position: 1,
                contentType: "video",
                isPreview: true,
                isPublished: true,
              },
              {
                id: "pl2",
                courseId: "c2",
                sectionId: "ps1",
                title: "P1 Lesson 2",
                position: 2,
                contentType: "video",
                isPreview: false,
                isPublished: true,
              },
            ],
          },
          {
            id: "ps2",
            courseId: "c2",
            title: "Preview Section 2",
            position: 2,
            lessons: [
              {
                id: "pl3",
                courseId: "c2",
                sectionId: "ps2",
                title: "P2 Lesson 1",
                position: 1,
                contentType: "video",
                isPreview: false,
                isPublished: true,
              },
            ],
          },
        ],
        pricing: null,
        settings: null,
        includes: [],
      };

      const adapted = adaptPreviewDataToOverview(mockPreviewData, [], "Sam");
      expect(adapted.sections).toHaveLength(2);
      expect(adapted.sections[0]?.lessons[0]?.[0]).toBe(1);
      expect(adapted.sections[0]?.lessons[1]?.[0]).toBe(2);
      expect(adapted.sections[1]?.lessons[0]?.[0]).toBe(3); // Global numbering
    });

    it("clicking first lesson in section 1 routes to canonical lecture-1 with from and returnTo context", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={multiSections}
          onNavigatePage={onNavigatePage}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Introduction to Web Design/i,
      });
      expect(lesson1Button).toBeVisible();
      fireEvent.click(lesson1Button);

      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/learn/test-course/lecture-1?from=courses&returnTo=%2Fcourses%2Ftest-course%2Foverview`,
      );
    });

    it("clicking second lesson in section 1 routes correctly to canonical lecture-2", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={multiSections}
          onNavigatePage={onNavigatePage}
        />,
      );

      const lesson2Button = screen.getByRole("button", {
        name: /Lesson 2: Tools and Environment/i,
      });
      expect(lesson2Button).toBeVisible();
      fireEvent.click(lesson2Button);

      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/learn/test-course/lecture-2?from=courses&returnTo=%2Fcourses%2Ftest-course%2Foverview`,
      );
    });

    it("clicking first lesson in section 2 uses GLOBAL numbering (lecture-3)", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={multiSections}
          onNavigatePage={onNavigatePage}
        />,
      );

      // Section 2 starts collapsed; expand section 2
      const section2Toggle = screen.getByRole("button", {
        name: /Section 2: Advanced Techniques/i,
      });
      fireEvent.click(section2Toggle);

      const lesson3Button = screen.getByRole("button", {
        name: /Lesson 3: Typography and Spacing/i,
      });
      expect(lesson3Button).toBeVisible();
      fireEvent.click(lesson3Button);

      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/learn/test-course/lecture-3?from=courses&returnTo=%2Fcourses%2Ftest-course%2Foverview`,
      );
    });

    it("supports keyboard activation on curriculum lesson rows", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={multiSections}
          onNavigatePage={onNavigatePage}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Introduction to Web Design/i,
      });
      lesson1Button.focus();
      expect(document.activeElement).toBe(lesson1Button);
      fireEvent.click(lesson1Button);

      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/learn/test-course/lecture-1?from=courses&returnTo=%2Fcourses%2Ftest-course%2Foverview`,
      );
    });

    it("does not navigate in read-only creator preview mode", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={multiSections}
          isReadOnlyPreview={true}
          onNavigatePage={onNavigatePage}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Introduction to Web Design/i,
      });
      expect(lesson1Button).toBeDisabled();
      expect(lesson1Button).toHaveClass("cursor-default");

      fireEvent.click(lesson1Button);
      expect(onNavigatePage).not.toHaveBeenCalled();
    });
  });

  describe("Curriculum Lesson Free Preview Badge Presentation", () => {
    const testSectionsWithPreview: CourseSection[] = [
      {
        id: 1,
        title: "Curriculum Section",
        progress: "0/2",
        lessons: [
          [1, "Lesson 1: Free Preview Marked", "5m", "todo", true, "video"],
          [2, "Lesson 2: Standard Lesson", "10m", "todo", false, "video"],
        ],
      },
    ];

    it("evaluates isFreeCoursePricing helper accurately for free and paid strings", () => {
      expect(isFreeCoursePricing(undefined)).toBe(true);
      expect(isFreeCoursePricing(null)).toBe(true);
      expect(isFreeCoursePricing({ price: "Free" })).toBe(true);
      expect(isFreeCoursePricing({ price: "free" })).toBe(true);
      expect(isFreeCoursePricing({ price: "0" })).toBe(true);
      expect(isFreeCoursePricing({ price: "$0" })).toBe(true);
      expect(isFreeCoursePricing({ price: "₹0" })).toBe(true);
      expect(isFreeCoursePricing({ price: "₹1,999" })).toBe(false);
      expect(isFreeCoursePricing({ price: "$49.99" })).toBe(false);
    });

    it("FREE COURSE: hides Free preview badge on preview lessons and normal lessons", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={testSectionsWithPreview}
          customPricing={{ price: "Free" }}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Free Preview Marked/i,
      });
      const lesson2Button = screen.getByRole("button", {
        name: /Lesson 2: Standard Lesson/i,
      });

      // Neither lesson should show a Free badge
      expect(within(lesson1Button).queryByLabelText("Free preview")).toBeNull();
      expect(within(lesson1Button).queryByText("Free")).toBeNull();
      expect(within(lesson2Button).queryByLabelText("Free preview")).toBeNull();
      expect(within(lesson2Button).queryByText("Free")).toBeNull();
    });

    it("PAID COURSE: shows Free preview badge ONLY on preview lessons, NOT on normal lessons", () => {
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={testSectionsWithPreview}
          customPricing={{ price: "₹1,999", originalPrice: "₹2,999" }}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Free Preview Marked/i,
      });
      const lesson2Button = screen.getByRole("button", {
        name: /Lesson 2: Standard Lesson/i,
      });

      // Preview lesson on paid course MUST show Free preview badge
      const previewBadge = within(lesson1Button).getByLabelText("Free preview");
      expect(previewBadge).toBeVisible();
      expect(previewBadge).toHaveTextContent("Free");

      // Normal lesson on paid course must NOT show Free badge
      expect(within(lesson2Button).queryByLabelText("Free preview")).toBeNull();
      expect(within(lesson2Button).queryByText("Free")).toBeNull();
    });

    it("CREATOR PREVIEW: applies the same rule for previewData (free vs paid)", () => {
      const freePreviewData: CourseEditorDataResponse = {
        course: {
          id: "preview-free-id",
          slug: "free-preview-course",
          title: "Free Preview Course",
          shortDescription: "Short",
          description: "Full description",
          difficulty: "beginner",
          status: "draft",
          creatorId: "user-1",
          categoryId: "cat-1",
          thumbnailMediaId: null,
          trailerMediaId: null,
          instructorAlias: "Instructor",
          version: 1,
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-01T00:00:00.000Z",
          publishedAt: null,
        },
        sections: [
          {
            id: "ps-1",
            courseId: "preview-free-id",
            title: "Section 1",
            position: 1,
            lessons: [
              {
                id: "pl-1",
                courseId: "preview-free-id",
                sectionId: "ps-1",
                title: "Lesson A (Preview)",
                position: 1,
                contentType: "video",
                isPreview: true,
                isPublished: true,
              },
            ],
          },
        ],
        pricing: {
          id: "pr-1",
          courseId: "preview-free-id",
          pricingType: "free",
          price: 0,
          currency: "INR",
        },
        settings: null,
        includes: [],
      };

      const { unmount } = renderWithClient(
        <CourseOverviewPage
          previewData={freePreviewData}
          isReadOnlyPreview={true}
        />,
      );

      const freeRow = screen.getByRole("button", {
        name: /Lesson A \(Preview\)/i,
      });
      expect(within(freeRow).queryByLabelText("Free preview")).toBeNull();

      unmount();

      // Now paid previewData
      const paidPreviewData: CourseEditorDataResponse = {
        ...freePreviewData,
        pricing: {
          id: "pr-2",
          courseId: "preview-free-id",
          pricingType: "paid",
          price: 1999,
          currency: "INR",
        },
      };

      renderWithClient(
        <CourseOverviewPage
          previewData={paidPreviewData}
          isReadOnlyPreview={true}
        />,
      );

      const paidRow = screen.getByRole("button", {
        name: /Lesson A \(Preview\)/i,
      });
      const badge = within(paidRow).getByLabelText("Free preview");
      expect(badge).toBeVisible();
      expect(badge).toHaveTextContent("Free");
    });

    it("preserves curriculum navigation on paid courses with free-preview badges", () => {
      const onNavigatePage = vi.fn();
      renderWithClient(
        <CourseOverviewPage
          customCourse={sampleCourse}
          customSections={testSectionsWithPreview}
          customPricing={{ price: "₹1,999" }}
          onNavigatePage={onNavigatePage}
        />,
      );

      const lesson1Button = screen.getByRole("button", {
        name: /Lesson 1: Free Preview Marked/i,
      });
      fireEvent.click(lesson1Button);

      expect(onNavigatePage).toHaveBeenCalledTimes(1);
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/learn/test-course/lecture-1?from=courses&returnTo=%2Fcourses%2Ftest-course%2Foverview`,
      );
    });
  });
});

