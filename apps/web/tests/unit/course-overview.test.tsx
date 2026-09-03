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
      await screen.findByRole("heading", {
        name: "Course not found",
        level: 2,
      }),
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
});
