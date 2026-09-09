import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { CourseOverviewResponse } from "@veolms/contracts";
import {
  CourseOverviewPage,
  CourseOverviewSkeleton,
  adaptCourseOverviewResponse,
} from "../../src/courses/CourseOverviewPage";
import type { Course } from "../../src/courses/catalogue";

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

    it("2a. Creator Preview (Paid) shows price, 'Apply coupon', and 'Buy Now' as demo UI", () => {
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

      // Shows Buy Now as demo UI (not disabled)
      const buyNowBtn = screen.getByRole("button", { name: /Buy Now/i });
      expect(buyNowBtn).toBeVisible();
      expect(buyNowBtn).not.toBeDisabled();
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

    it("3a. Student (Paid) shows price, 'Apply coupon', and visibly disabled 'Buy Now'", () => {
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

      // Purchase/Buy Now action is visibly disabled/non-functional
      const buyNowBtn = screen.getByRole("button", { name: /Buy Now/i });
      expect(buyNowBtn).toBeVisible();
      expect(buyNowBtn).toBeDisabled();
    });

    it("3b. Student (Free) shows 'Free' and 'Continue Learning' opening Learning Space without coupon", () => {
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
});

