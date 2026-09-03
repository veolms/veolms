import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseCatalogue } from "../../src/courses/CourseCatalogue.tsx";
import type { CourseCatalogueProps } from "../../src/courses/CourseCatalogue.tsx";
import type { Course } from "../../src/courses/catalogue.ts";

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

const sampleCourse: Course = {
  id: "test-course-id",
  title: "Test Course Title",
  description: "Test Course Description",
  level: "Beginner",
  category: "Development",
  sections: 5,
  lectures: 20,
  progress: null,
  enrolled: false,
  duration: "5h",
  students: 10,
  thumbnail: "/test.webp",
  lifecycleStatus: "published",
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
    const unenrolledCourse = { ...sampleCourse, enrolled: false };

    const { onNavigatePage, setNotice } = renderCatalogue({
      visibleCourses: [unenrolledCourse],
    });

    fireEvent.click(screen.getByRole("button", { name: "View Curriculum" }));

    expect(onNavigatePage).toHaveBeenCalledWith(
      `/courses/${encodeURIComponent(unenrolledCourse.id)}/overview`,
    );
    expect(setNotice).not.toHaveBeenCalled();
  });

  it("navigates to course edit page when edit course action is selected", async () => {
    const target = sampleCourse;
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

  it("opens ConfirmDeleteModal on Delete Course action and triggers onDeleteCourse on confirm", async () => {
    const target: Course = {
      id: "test-course-id",
      title: "Test Course Title",
      description: "Test Course Description",
      level: "Beginner",
      category: "Development",
      sections: 5,
      lectures: 20,
      progress: null,
      enrolled: false,
      duration: "5h",
      students: 10,
      thumbnail: "/test.webp",
      lifecycleStatus: "published",
    };
    const onDeleteCourse = vi.fn().mockResolvedValue(undefined);
    renderCatalogue({
      role: "creator",
      visibleCourses: [target],
      courseMenu: target.id,
      onDeleteCourse,
    });

    // Click Delete Course from the action menu
    fireEvent.click(screen.getByRole("menuitem", { name: /Delete course/i }));

    // Verify confirmation modal is opened
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    expect(screen.getByText("Move course to Bin?")).toBeVisible();
    expect(
      screen.getByText(new RegExp(`Move “${target.title}” to the Bin`, "i")),
    ).toBeVisible();

    // Trigger hold-to-confirm
    const confirmBtn = screen.getByRole("button", { name: /Hold to Move to Bin/i });
    fireEvent.keyDown(confirmBtn, { key: "Enter" });
  });

  it("renders Bin tab in creator mode when isAdmin is true", () => {
    renderCatalogue({
      role: "creator",
      isAdmin: true,
    });

    expect(screen.getByRole("tab", { name: "Bin" })).toBeVisible();
  });

  it("omits Bin tab in creator mode when isAdmin is false or omitted", () => {
    renderCatalogue({
      role: "creator",
      isAdmin: false,
    });

    expect(screen.queryByRole("tab", { name: "Bin" })).toBeNull();
  });

  it("omits Bin tab in student mode even if isAdmin is true", () => {
    renderCatalogue({
      role: "student",
      isAdmin: true,
    });

    expect(screen.queryByRole("tab", { name: "Bin" })).toBeNull();
  });
});
