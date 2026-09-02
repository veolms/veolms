import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import React from "react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Curriculum } from "../../src/learning/Curriculum.tsx";
import {
  createCurriculumSections,
  createLessonsById,
} from "../../src/learning/courseContent.ts";
import { useLessonDrawerHeroControl } from "../../src/learning/useLessonDrawerHeroControl.ts";

const testSections = createCurriculumSections(3, 16);
const testLessonsById = createLessonsById(testSections);

function TestCurriculum(props: ComponentProps<typeof Curriculum>) {
  return (
    <Curriculum
      sections={testSections}
      lessonsById={testLessonsById}
      {...props}
    />
  );
}

function TestDrawerCurriculum(props: ComponentProps<typeof Curriculum>) {
  const drawerHeroControlProps = useLessonDrawerHeroControl({
    open: true,
    expanded: false,
    onExpand: () => undefined,
    onCollapse: () => undefined,
    onClose: () => undefined,
  });

  return (
    <div data-slot="drawer-popup">
      <TestCurriculum
        {...props}
        drawerHeroControlProps={drawerHeroControlProps}
      />
    </div>
  );
}

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

  it("updates the visible scroll control direction when the curriculum reaches an edge", () => {
    render(
      <TestCurriculum
        persistenceKey="curriculum-scroll-direction"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const curriculum = screen.getByRole("complementary", {
      name: "Course curriculum",
    });
    Object.defineProperties(curriculum, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1000 },
    });

    curriculum.scrollTop = 600;
    fireEvent.scroll(curriculum);
    expect(
      screen.getByRole("button", { name: "Scroll curriculum to top" }),
    ).toBeVisible();

    curriculum.scrollTop = 0;
    fireEvent.scroll(curriculum);
    expect(
      screen.getByRole("button", { name: "Scroll curriculum to bottom" }),
    ).toBeVisible();
  });

  it("sizes the course title from the curriculum panel width within fixed bounds", () => {
    render(
      <TestCurriculum
        persistenceKey="curriculum-title-sizing"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="Complete Backend with Node.js"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const title = screen.getByRole("heading", {
      name: "Complete Backend with Node.js",
    });

    expect(title).toHaveClass("text-[clamp(1rem,4.25cqi,1.1875rem)]");
    expect(title.closest(".learning-curriculum__title-row")).toHaveClass(
      "@container",
    );
  });

  it("uses a theme progress ring for active lectures and completes it at 100 percent", () => {
    const { rerender } = render(
      <TestCurriculum
        persistenceKey="curriculum-lesson-progress"
        selectedLesson={11}
        lessonProgress={{ 11: 52 }}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const sectionToggle = screen
      .getAllByRole("button", {
        name: /Section 3: Information Architecture/,
      })
      .find((button) =>
        button.classList.contains("learning-curriculum__section-toggle"),
      );
    if (!sectionToggle) throw new Error("Expected Section 3 toggle");
    fireEvent.click(sectionToggle);
    const activeLesson = screen.getByRole("button", {
      name: /11\.\s*The Beginning of a Design Journey\s*07:34/,
    });
    expect(
      within(activeLesson).getByRole("progressbar", {
        name: "Lecture 11 progress",
      }),
    ).toHaveAttribute("aria-valuenow", "52");

    rerender(
      <TestCurriculum
        persistenceKey="curriculum-lesson-progress"
        selectedLesson={11}
        lessonProgress={{ 11: 100 }}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    expect(
      within(activeLesson).queryByRole("progressbar", {
        name: "Lecture 11 progress",
      }),
    ).not.toBeInTheDocument();
    expect(within(activeLesson).getByLabelText("Completed")).toBeVisible();
  });

  it("toggles sections, filters lessons, and delegates lesson selection and close", () => {
    const onSelectLesson = vi.fn();
    const onOpenCourseOverview = vi.fn();
    const onClose = vi.fn();

    render(
      <TestCurriculum
        persistenceKey="curriculum-test-repeated"
        selectedLesson={1}
        onSelectLesson={onSelectLesson}
        onOpenCourseOverview={onOpenCourseOverview}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
        onClose={onClose}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "View course overview for UX Design Fundamentals",
      }),
    );
    expect(onOpenCourseOverview).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Progress", { selector: "span" })).toBeVisible();

    expect(
      screen.getByRole("button", {
        name: "Go to current section, Section 1: Introduction",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: "Go to current chapter, Chapter 1: The Beginning of a Design Journey",
      }),
    ).toBeInTheDocument();

    const lessonList = document.querySelector(
      ".learning-curriculum__lesson-list",
    );
    expect(lessonList).not.toBeNull();
    const lessonListQueries = within(lessonList as HTMLElement);

    const introduction = lessonListQueries.getByRole("button", {
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
      lessonListQueries.queryByRole("button", {
        name: /Section 1: Introduction/,
      }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Section 2: User Research/ }),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: "Back from lesson search" }),
    );
    expect(
      lessonListQueries.getByRole("button", {
        name: /Section 1: Introduction/,
      }),
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
      <TestCurriculum
        persistenceKey="curriculum-test"
        selectedLesson={1}
        onSelectLesson={onSelectLesson}
        onOpenCourseOverview={vi.fn()}
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
        name: /11\.\s*The Beginning of a Design Journey\s*07:34/,
      }),
    );
    expect(onSelectLesson).toHaveBeenCalledWith(11);
  }, 30_000);

  it("keeps locked lectures visible but prevents anonymous selection", () => {
    const onSelectLesson = vi.fn();

    render(
      <TestCurriculum
        persistenceKey="curriculum-public-preview"
        selectedLesson={1}
        onSelectLesson={onSelectLesson}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UI/UX Design Mastery"
        courseThumbnail="/course-thumbnail.png"
        isLessonAvailable={(lessonNumber) => lessonNumber <= 2}
      />,
    );

    const lockedLesson = screen.getByRole("button", {
      name: /The Design Mindset.*log in to watch/i,
    });
    expect(lockedLesson).toBeDisabled();
    expect(lockedLesson).toHaveAttribute(
      "title",
      "Log in to watch this lecture",
    );

    fireEvent.click(lockedLesson);
    expect(onSelectLesson).not.toHaveBeenCalled();
  });

  it("offers state-aware curriculum actions from the context menu", async () => {
    render(
      <TestCurriculum
        persistenceKey="curriculum-context-menu"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const curriculum = screen.getByRole("complementary", {
      name: "Course curriculum",
    });
    const curriculumHero = curriculum.querySelector<HTMLElement>(
      ".learning-curriculum__hero",
    );
    expect(curriculumHero).not.toBeNull();

    fireEvent.contextMenu(curriculum, { clientX: 48, clientY: 72 });
    expect(
      screen.queryByRole("menu", { name: "Course curriculum actions" }),
    ).not.toBeInTheDocument();

    fireEvent.contextMenu(curriculumHero!, { clientX: 48, clientY: 72 });
    expect(
      await screen.findByRole("menuitem", { name: "Expand all sections" }),
    ).toBeVisible();
    expect(
      screen.getByRole("menuitem", { name: "Collapse all sections" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Expand all sections" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: "Expand all sections" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.contextMenu(curriculumHero!, { clientX: 48, clientY: 72 });
    expect(
      screen.queryByRole("menuitem", { name: "Expand all sections" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByRole("menuitem", { name: "Collapse all sections" }),
    ).toBeVisible();

    fireEvent.click(
      screen.getByRole("menuitem", { name: "Collapse all sections" }),
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: "Collapse all sections" }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.contextMenu(curriculumHero!, { clientX: 48, clientY: 72 });
    expect(
      await screen.findByRole("menuitem", { name: "Expand all sections" }),
    ).toBeVisible();
    expect(
      screen.queryByRole("menuitem", { name: "Collapse all sections" }),
    ).not.toBeInTheDocument();
  }, 30_000);

  it("keeps curriculum actions inside a fullscreen-capable video shell", async () => {
    const { container } = render(
      <div className="video-shell">
        <TestCurriculum
          persistenceKey="fullscreen-curriculum-context-menu"
          selectedLesson={1}
          onSelectLesson={vi.fn()}
          onOpenCourseOverview={vi.fn()}
          courseTitle="UX Design Fundamentals"
          courseThumbnail="/course-thumbnail.png"
        />
      </div>,
    );

    const shell = container.querySelector(".video-shell");
    const curriculumHero = screen
      .getByRole("complementary", { name: "Course curriculum" })
      .querySelector<HTMLElement>(".learning-curriculum__hero");
    expect(shell).not.toBeNull();
    expect(curriculumHero).not.toBeNull();

    fireEvent.contextMenu(curriculumHero!, { clientX: 48, clientY: 72 });
    const expandAll = await screen.findByRole("menuitem", {
      name: "Expand all sections",
    });
    const portal = expandAll.closest('[data-slot="context-menu-portal"]');
    expect(portal?.parentElement).toBe(shell);

    fireEvent.click(expandAll);
    await waitFor(() =>
      expect(
        screen.queryByRole("menuitem", { name: "Expand all sections" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("opens curriculum actions after a touch long press", async () => {
    vi.useFakeTimers();
    try {
      render(
        <TestCurriculum
          persistenceKey="curriculum-long-press"
          selectedLesson={1}
          onSelectLesson={vi.fn()}
          onOpenCourseOverview={vi.fn()}
          courseTitle="UX Design Fundamentals"
          courseThumbnail="/course-thumbnail.png"
        />,
      );

      const curriculum = screen.getByRole("complementary", {
        name: "Course curriculum",
      });
      const curriculumHero = curriculum.querySelector<HTMLElement>(
        ".learning-curriculum__hero",
      );
      expect(curriculumHero).not.toBeNull();
      fireEvent.touchStart(curriculumHero!, {
        touches: [{ clientX: 56, clientY: 84 }],
      });
      await vi.advanceTimersByTimeAsync(500);

      expect(
        screen.getByRole("menu", { name: "Course curriculum actions" }),
      ).toBeVisible();
      fireEvent.touchEnd(curriculumHero!, { touches: [] });
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

  it("does not open curriculum actions when a touch long press becomes a drag", async () => {
    vi.useFakeTimers();
    try {
      render(
        <TestDrawerCurriculum
          persistenceKey="curriculum-long-press-drag"
          selectedLesson={1}
          onSelectLesson={vi.fn()}
          onOpenCourseOverview={vi.fn()}
          courseTitle="UX Design Fundamentals"
          courseThumbnail="/course-thumbnail.png"
        />,
      );

      const curriculum = screen.getByRole("complementary", {
        name: "Course curriculum",
      });
      const curriculumHero = curriculum.querySelector<HTMLElement>(
        ".learning-curriculum__hero",
      );
      expect(curriculumHero).not.toBeNull();

      fireEvent.touchStart(curriculumHero!, {
        touches: [{ clientX: 56, clientY: 84 }],
      });
      fireEvent.touchMove(curriculumHero!, {
        touches: [{ clientX: 56, clientY: 108 }],
      });
      await vi.advanceTimersByTimeAsync(500);

      expect(
        screen.queryByRole("menu", { name: "Course curriculum actions" }),
      ).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  }, 30_000);

  it("moves the drawer with the course card throughout a touch drag", () => {
    render(
      <TestDrawerCurriculum
        persistenceKey="curriculum-live-card-drag"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const popup = document.querySelector<HTMLElement>(
      '[data-slot="drawer-popup"]',
    )!;
    const curriculumHero = popup.querySelector<HTMLElement>(
      ".learning-curriculum__hero",
    )!;
    vi.spyOn(popup, "getBoundingClientRect").mockReturnValue(
      new DOMRect(0, 240, 375, 427),
    );

    fireEvent.touchStart(curriculumHero, {
      touches: [{ clientX: 56, clientY: 300 }],
    });
    fireEvent.touchMove(curriculumHero, {
      touches: [{ clientX: 56, clientY: 232 }],
    });

    expect(popup).toHaveAttribute("data-swiping");
    expect(popup.style.getPropertyValue("--drawer-swipe-movement-y")).toBe(
      "-68px",
    );

    fireEvent.touchCancel(curriculumHero);
    expect(popup).not.toHaveAttribute("data-swiping");
    expect(popup.style.getPropertyValue("--drawer-swipe-movement-y")).toBe("");
  });

  it("keeps a course-card tap navigable when drawer gestures are enabled", () => {
    const onOpenCourseOverview = vi.fn();
    render(
      <TestDrawerCurriculum
        persistenceKey="curriculum-card-tap"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={onOpenCourseOverview}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const overview = screen.getByRole("button", {
      name: "View course overview for UX Design Fundamentals",
    });
    const curriculumHero = overview.closest<HTMLElement>(
      ".learning-curriculum__hero",
    )!;
    fireEvent.touchStart(curriculumHero, {
      touches: [{ clientX: 56, clientY: 84 }],
    });
    fireEvent.touchEnd(curriculumHero, {
      changedTouches: [{ clientX: 56, clientY: 84 }],
      touches: [],
    });
    fireEvent.click(overview);

    expect(onOpenCourseOverview).toHaveBeenCalledOnce();
  });

  it("returns the curriculum to the course card when opening lesson search", () => {
    const onLessonSearchOpen = vi.fn();

    render(
      <TestCurriculum
        persistenceKey="curriculum-search-scroll-top"
        selectedLesson={1}
        onSelectLesson={vi.fn()}
        onOpenCourseOverview={vi.fn()}
        onLessonSearchOpen={onLessonSearchOpen}
        courseTitle="UX Design Fundamentals"
        courseThumbnail="/course-thumbnail.png"
      />,
    );

    const curriculum = screen.getByRole("complementary", {
      name: "Course curriculum",
    });
    curriculum.scrollTop = 240;

    fireEvent.click(screen.getByRole("button", { name: "Search lessons" }));

    expect(onLessonSearchOpen).toHaveBeenCalledOnce();
    expect(curriculum.scrollTop).toBe(0);
    const searchbox = screen.getByRole("searchbox", { name: "Search lessons" });
    expect(searchbox).toBeVisible();
    expect(searchbox).toHaveFocus();
  });

  it("returns the curriculum to the course card for a new top request", () => {
    const props = {
      persistenceKey: "curriculum-drawer-top",
      selectedLesson: 15,
      onSelectLesson: vi.fn(),
      onOpenCourseOverview: vi.fn(),
      courseTitle: "UX Design Fundamentals",
      courseThumbnail: "/course-thumbnail.png",
    };
    const { rerender } = render(<TestCurriculum {...props} topRequest={0} />);
    const curriculum = screen.getByRole("complementary", {
      name: "Course curriculum",
    });
    curriculum.scrollTop = 420;

    rerender(<TestCurriculum {...props} topRequest={1} />);

    expect(curriculum.scrollTop).toBe(0);
    expect(
      screen.getByRole("heading", { name: "UX Design Fundamentals" }),
    ).toBeInTheDocument();
  });
});
