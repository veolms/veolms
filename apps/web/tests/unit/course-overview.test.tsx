import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { CourseOverviewPage } from "../../src/courses/CourseOverviewPage";
import { courses } from "../../src/courses/catalogue";

describe("CourseOverviewPage", () => {
  it("renders course details for a valid catalogue course", () => {
    const target = courses.find((c) => c.id === "ui-ux-design-mastery")!;
    render(
      <CourseOverviewPage
        courseSlug={target.id}
        onNavigateCourses={vi.fn()}
        onNavigatePage={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: target.title, level: 1 })).toBeVisible();
    expect(screen.getByText(/About this course/i)).toBeVisible();
    expect(screen.getByText(/Course curriculum/i)).toBeVisible();
  });

  it("renders customCourse data when provided", () => {
    const customCourse = {
      ...courses[0]!,
      title: "Custom Preview Title",
      description: "Custom Preview Description",
    };

    render(
      <CourseOverviewPage
        customCourse={customCourse}
        isReadOnlyPreview={true}
        onNavigateCourses={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Custom Preview Title", level: 1 })).toBeVisible();
  });

  it("renders not-found state when courseSlug is unknown and calls onNavigateCourses", () => {
    const onNavigateCourses = vi.fn();
    render(
      <CourseOverviewPage
        courseSlug="non-existent-course-slug"
        onNavigateCourses={onNavigateCourses}
      />,
    );

    expect(screen.getByRole("heading", { name: "Course not found", level: 2 })).toBeVisible();
    expect(
      screen.getByText("The course you are looking for does not exist or may have been removed."),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Explore courses" }));
    expect(onNavigateCourses).toHaveBeenCalledTimes(1);
  });

  it("associates unique aria-controls and panel IDs on section toggles", () => {
    const target = courses.find((c) => c.id === "ui-ux-design-mastery")!;
    render(
      <CourseOverviewPage
        courseSlug={target.id}
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
});
