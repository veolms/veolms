import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseCatalogue } from "../../src/courses/CourseCatalogue.tsx";
import type { CourseCatalogueProps } from "../../src/courses/CourseCatalogue.tsx";
import { courses } from "../../src/courses/catalogue.ts";

vi.mock("../../src/ThemedSelect.tsx", () => ({
  ThemedSelect: ({
    ariaLabel,
    onValueChange,
  }: {
    ariaLabel: string;
    onValueChange: (value: string) => void;
  }) => (
    <button
      type="button"
      role="combobox"
      aria-label={ariaLabel}
      onClick={() =>
        onValueChange(
          ariaLabel === "Filter by category" ? "Development" : "title",
        )
      }
    >
      {ariaLabel}
    </button>
  ),
}));

const renderCatalogue = (props: Partial<CourseCatalogueProps> = {}) => {
  const callbacks = {
    onEnrollmentFilterChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
    onCategoryChange: vi.fn(),
    onWishlist: vi.fn(),
    onOpenCourse: vi.fn(),
    setCourseMenu: vi.fn(),
    setNotice: vi.fn(),
    onNavigatePage: vi.fn(),
    onResetCatalogue: vi.fn(),
  };
  const view = render(
    <CourseCatalogue
      activeSection="Courses"
      role="student"
      wishlisted={new Set<string>()}
      enrollmentFilter="all"
      search=""
      sort="latest"
      category="all"
      visibleCourses={[]}
      courseMenu={null}
      {...callbacks}
      {...props}
    />,
  );

  return { ...callbacks, ...view };
};

describe("CourseCatalogue", () => {
  it("forwards enrollment, search, and category controls to the parent", () => {
    const {
      onEnrollmentFilterChange,
      onSearchChange,
      onSortChange,
      onCategoryChange,
    } = renderCatalogue();

    fireEvent.click(screen.getByRole("tab", { name: "Enrolled" }));
    fireEvent.change(screen.getByPlaceholderText("Search your courses..."), {
      target: { value: "mongo" },
    });
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Filter by category",
      }),
    );
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Sort courses",
      }),
    );

    expect(onEnrollmentFilterChange).toHaveBeenCalledWith("enrolled");
    expect(onSearchChange).toHaveBeenCalledWith("mongo");
    expect(onCategoryChange).toHaveBeenCalledWith("Development");
    expect(onSortChange).toHaveBeenCalledWith("title");
  });

  it("opens the dedicated create-course route for creators", () => {
    const { onNavigatePage, setNotice } = renderCatalogue({ role: "creator" });

    fireEvent.click(screen.getByRole("button", { name: "Create Course" }));

    expect(onNavigatePage).toHaveBeenCalledWith("Create Course");
    expect(setNotice).not.toHaveBeenCalled();
  });

  it("opens the overview route when a student explores an unenrolled course", () => {
    const unenrolledCourse = courses.find((course) => !course.enrolled);
    expect(unenrolledCourse).toBeDefined();

    const { onNavigatePage, setNotice } = renderCatalogue({
      visibleCourses: [unenrolledCourse!],
    });

    fireEvent.click(screen.getByRole("button", { name: "Explore Course" }));

    expect(onNavigatePage).toHaveBeenCalledWith(
      `/explore-courses/${encodeURIComponent(unenrolledCourse!.id)}/overview`,
    );
    expect(setNotice).not.toHaveBeenCalled();
  });

  it("keeps wishlist empty copy and delegates reset to the parent", () => {
    const { onResetCatalogue } = renderCatalogue({
      activeSection: "Wishlist",
      wishlisted: new Set(["course-a", "course-b"]),
    });

    expect(screen.getByText("2 saved courses")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Your wishlist is empty" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Save a course with its heart button and it will appear here.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View all courses" }));

    expect(onResetCatalogue).toHaveBeenCalledTimes(1);
  });
});
