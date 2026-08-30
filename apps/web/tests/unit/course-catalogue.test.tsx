import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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
          ariaLabel === "Filter course status" ? "completed" : "title",
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
    onStatusFilterChange: vi.fn(),
    onSearchChange: vi.fn(),
    onSortChange: vi.fn(),
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
      statusFilter="all"
      search=""
      sort="latest"
      visibleCourses={[]}
      courseMenu={null}
      {...callbacks}
      {...props}
    />,
  );

  return { ...callbacks, ...view };
};

describe("CourseCatalogue", () => {
  it("forwards enrollment, search, status, and sort controls to the parent", () => {
    const {
      onEnrollmentFilterChange,
      onSearchChange,
      onSortChange,
      onStatusFilterChange,
    } = renderCatalogue();

    fireEvent.click(screen.getByRole("tab", { name: "Enrolled" }));
    fireEvent.change(screen.getByPlaceholderText("Search courses..."), {
      target: { value: "mongo" },
    });
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Filter course status",
      }),
    );
    fireEvent.click(
      screen.getByRole("combobox", {
        name: "Sort courses",
      }),
    );

    expect(onEnrollmentFilterChange).toHaveBeenCalledWith("enrolled");
    expect(onSearchChange).toHaveBeenCalledWith("mongo");
    expect(onStatusFilterChange).toHaveBeenCalledWith("completed");
    expect(onSortChange).toHaveBeenCalledWith("title");
  });

  it("reveals the mobile search field from its compact search control", () => {
    renderCatalogue();

    const searchToggle = screen.getByRole("button", { name: "Search courses" });
    expect(searchToggle).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(searchToggle);

    expect(searchToggle).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByPlaceholderText("Search courses..."),
    ).toBeInTheDocument();
  });

  it("opens the dedicated create-course route for creators", () => {
    const { onNavigatePage, setNotice } = renderCatalogue({ role: "creator" });

    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(onNavigatePage).toHaveBeenCalledWith("Create Course");
    expect(setNotice).not.toHaveBeenCalled();
  });

  it("opens the overview route when a student explores an unenrolled course", () => {
    const unenrolledCourse = courses.find((course) => !course.enrolled);
    expect(unenrolledCourse).toBeDefined();

    const { onNavigatePage, setNotice } = renderCatalogue({
      visibleCourses: [unenrolledCourse!],
    });

    fireEvent.click(screen.getByRole("button", { name: "View Curriculum" }));

    expect(onNavigatePage).toHaveBeenCalledWith(
      `/courses/${encodeURIComponent(unenrolledCourse!.id)}/overview`,
    );
    expect(setNotice).not.toHaveBeenCalled();
  });

  it("navigates to course edit page when edit course action is selected", async () => {
    const target = courses[0]!;
    const { onNavigatePage } = renderCatalogue({
      role: "creator",
      visibleCourses: [target],
      courseMenu: target.id,
    });

    fireEvent.click(screen.getByRole("menuitem", { name: /Edit course/i }));

    await waitFor(() =>
      expect(onNavigatePage).toHaveBeenCalledWith(
        `/courses/create?edit=${encodeURIComponent(target.id)}`,
      ),
    );
  });

  it("keeps wishlist empty copy and delegates reset to the parent", () => {
    const { onResetCatalogue } = renderCatalogue({
      activeSection: "Wishlist",
      wishlisted: new Set(["course-a", "course-b"]),
    });

    expect(screen.getByText("2 saved courses.")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: "Your wishlist is empty" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        "Save a not-enrolled course with its heart button and it will appear here.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "View all courses" }));

    expect(onResetCatalogue).toHaveBeenCalledTimes(1);
  });
});
