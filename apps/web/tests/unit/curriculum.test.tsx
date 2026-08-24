import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Curriculum } from "../../src/learning/Curriculum.tsx";

describe("Curriculum", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("toggles sections, filters lessons, and delegates lesson selection and close", () => {
    const onSelectLesson = vi.fn();
    const onClose = vi.fn();

    render(
      <Curriculum
        persistenceKey="curriculum-test-repeated"
        selectedLesson={1}
        onSelectLesson={onSelectLesson}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
        onClose={onClose}
      />,
    );

    const introduction = screen.getByRole("button", {
      name: /Section 1: Introduction/,
    });
    expect(introduction).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(introduction);
    expect(introduction).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(introduction);
    expect(introduction).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Search lessons" }));
    fireEvent.change(
      screen.getByRole("searchbox", { name: "Search lessons" }),
      {
        target: { value: "usability" },
      },
    );

    expect(
      screen.queryByRole("button", { name: /Section 1: Introduction/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Section 2: User Research/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Close lesson search" }),
    );
    expect(
      screen.getByRole("button", { name: /Section 1: Introduction/ }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Search lessons" }));

    fireEvent.click(
      screen.getByRole("button", {
        name: /10\.\s*Usability Testing\s*11:39/,
      }),
    );
    expect(onSelectLesson).toHaveBeenCalledWith(10);
    expect(onClose).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("opens repeated dummy lectures from the remaining sections", () => {
    const onSelectLesson = vi.fn();

    render(
      <Curriculum
        persistenceKey="curriculum-test"
        selectedLesson={1}
        onSelectLesson={onSelectLesson}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const informationArchitecture = screen.getByRole("button", {
      name: /Section 3: Information Architecture/,
    });
    fireEvent.click(informationArchitecture);
    expect(informationArchitecture).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(
      screen.getByRole("button", {
        name: /11\.\s*The Beginning of a Design Journey\s*09:13/,
      }),
    );
    expect(onSelectLesson).toHaveBeenCalledWith(11);
  }, 30_000);
});
