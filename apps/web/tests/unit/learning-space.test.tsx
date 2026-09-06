import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningSpace } from "../../src/learning-space/LearningSpace";
import { getCoursePlayerPath } from "../../src/learning/coursePlayerNavigation";
import type { CoursePlayerSession } from "../../src/learning/coursePlayerNavigation";

const courseIds = [
  "typescript-course",
  "backend-nodejs",
  "javascript-course",
  "figma-ui-essentials",
  "mongodb-database-design",
  "aws-cloud-practitioner",
  "building-veolms",
  "illustrator-designers",
  "advanced-react",
  "data-visualization-d3",
] as const;

const createSessions = (count: number): CoursePlayerSession[] =>
  courseIds.slice(0, count).map((courseId, index) => {
    const lessonId = index + 1;
    return {
      courseId,
      lessonId,
      origin: "courses",
      path: getCoursePlayerPath(courseId, "courses", lessonId),
      returnPath: "/courses",
      updatedAt: index + 1,
    };
  });

const defaultMatchMedia = window.matchMedia;

beforeEach(() => {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return false;
    },
  })) as typeof window.matchMedia;
});

afterEach(() => {
  window.matchMedia = defaultMatchMedia;
});

interface RenderLearningSpaceOptions {
  sessions?: CoursePlayerSession[];
  activeCourseId?: string | null;
  expanded?: boolean;
  collapsedSidebar?: boolean;
  mobile?: boolean;
  onExpandedChange?: (expanded: boolean) => void;
  onRequestSidebarExpand?: () => void;
  onActivate?: (session: CoursePlayerSession) => void;
  onClose?: (session: CoursePlayerSession) => void;
}

const renderLearningSpace = ({
  sessions = createSessions(3),
  activeCourseId = sessions[0]?.courseId,
  expanded = true,
  collapsedSidebar = false,
  mobile = false,
  onExpandedChange = vi.fn(),
  onRequestSidebarExpand = vi.fn(),
  onActivate = vi.fn(),
  onClose = vi.fn(),
}: RenderLearningSpaceOptions = {}) => {
  const result = render(
    <LearningSpace
      sessions={sessions}
      activeCourseId={activeCourseId}
      expanded={expanded}
      collapsedSidebar={collapsedSidebar}
      mobile={mobile}
      onExpandedChange={onExpandedChange}
      onRequestSidebarExpand={onRequestSidebarExpand}
      onActivate={onActivate}
      onClose={onClose}
    />,
  );

  return {
    ...result,
    onExpandedChange,
    onRequestSidebarExpand,
    onActivate,
    onClose,
  };
};

describe("LearningSpace", () => {
  it.each([1, 3, 6, 10])(
    "renders the active-session count and all %i session rows",
    (count) => {
      renderLearningSpace({ sessions: createSessions(count) });

      expect(
        screen.getByRole("button", {
          name: `Learning Space, ${count} active ${count === 1 ? "session" : "sessions"}`,
        }),
      ).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("region", { name: "Learning Space" }),
      ).toBeVisible();
      expect(screen.getAllByRole("listitem")).toHaveLength(count);
    },
  );

  it("keeps full course and lecture labels available while constraining their visual lines", () => {
    const session = createSessions(7)[6]!;
    renderLearningSpace({ sessions: [session] });

    const courseTitle = screen.getByText("Building VeoLMS: Idea to Production");
    expect(courseTitle).toHaveClass("line-clamp-2");
    expect(courseTitle).toHaveAttribute(
      "title",
      "Building VeoLMS: Idea to Production",
    );

    const lectureLabel = screen.getByText("Section 2 · Research Methods");
    expect(lectureLabel).toHaveClass("line-clamp-2");
    expect(lectureLabel).toHaveAttribute(
      "title",
      "Section 2 · Research Methods",
    );
    expect(
      screen.getByRole("button", {
        name: "Open Building VeoLMS: Idea to Production, Section 2 · Research Methods",
      }),
    ).toHaveAttribute(
      "title",
      "Building VeoLMS: Idea to Production — Section 2 · Research Methods",
    );
  });

  it("exposes the active session and delegates keyboard-accessible row activation", () => {
    const sessions = createSessions(3);
    const onActivate = vi.fn();
    renderLearningSpace({
      sessions,
      activeCourseId: "backend-nodejs",
      onActivate,
    });

    const activeSession = screen.getByRole("button", {
      name: /Open Complete Backend with Node\.js/,
    });
    const inactiveSession = screen.getByRole("button", {
      name: /Open The Ultimate TypeScript Course/,
    });
    expect(activeSession).toHaveAttribute("aria-current", "page");
    expect(inactiveSession).not.toHaveAttribute("aria-current");

    inactiveSession.focus();
    expect(inactiveSession).toHaveFocus();
    fireEvent.click(inactiveSession, { detail: 0 });
    expect(onActivate).toHaveBeenCalledWith(sessions[0]);
  });

  it("does not expose a selected session when nothing is currently playing", () => {
    renderLearningSpace({ activeCourseId: null });

    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
  });

  it("keeps the mini-player course marked as currently playing", () => {
    renderLearningSpace({ activeCourseId: "backend-nodejs" });

    const activeSession = screen.getByRole("button", {
      name: /Open Complete Backend with Node\.js/,
    });
    expect(activeSession).toHaveAttribute("aria-current", "page");
    expect(
      screen.getByRole("article", {
        name: /Currently playing, Complete Backend with Node\.js/,
      }),
    ).toBeInTheDocument();
  });

  it("keeps the session count on the trigger and persists panel dismissal through its owner callback", () => {
    const sessions = createSessions(3);
    const onExpandedChange = vi.fn();
    const { rerender } = renderLearningSpace({
      sessions,
      onExpandedChange,
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Learning Space, 3 active sessions",
      }),
    );
    expect(onExpandedChange).toHaveBeenCalledWith(false);

    rerender(
      <LearningSpace
        sessions={sessions}
        activeCourseId="typescript-course"
        expanded={false}
        onExpandedChange={onExpandedChange}
        onActivate={vi.fn()}
        onClose={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", {
        name: "Learning Space, 3 active sessions",
      }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByRole("region", { name: "Learning Space" }),
    ).not.toBeInTheDocument();
  });

  it("always exposes a close control, including for an unpinned panel", () => {
    const onExpandedChange = vi.fn();
    renderLearningSpace({ onExpandedChange });

    fireEvent.click(
      screen.getByRole("button", { name: "Close Learning Space panel" }),
    );

    expect(onExpandedChange).toHaveBeenCalledWith(false);
  });

  it("opens the floating panel directly from the collapsed sidebar", () => {
    const sessions = createSessions(6);
    const onExpandedChange = vi.fn();
    const onActivate = vi.fn();
    renderLearningSpace({
      sessions,
      collapsedSidebar: true,
      expanded: false,
      onExpandedChange,
      onActivate,
    });

    const trigger = screen.getByRole("button", {
      name: "Learning Space, 6 active sessions",
    });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveAttribute("title", "Learning Space · 6 active");
    fireEvent.click(trigger);
    expect(onExpandedChange).toHaveBeenCalledWith(true);
    expect(onActivate).toHaveBeenCalledWith(sessions[5]);
  });

  it("uses the floating panel as the mobile scroll surface and keeps row actions touch-sized", () => {
    renderLearningSpace({ mobile: true });

    const region = screen.getByRole("region", { name: "Learning Space" });
    const sessionPanel = screen.getByRole("list").parentElement;
    const moreActions = screen.getByRole("button", {
      name: "More actions for The Ultimate TypeScript Course",
    });

    expect(region).toHaveClass("fixed", "overflow-hidden");
    expect(region).toHaveAttribute("data-learning-swipe-ignore");
    expect(sessionPanel).toHaveClass("overflow-y-auto", "overscroll-contain");
    expect(moreActions).toHaveClass("size-9");
  });

  it("opens row actions without activating the session and closes only on command", async () => {
    const sessions = createSessions(1);
    const onActivate = vi.fn();
    const onClose = vi.fn();
    renderLearningSpace({ sessions, onActivate, onClose });

    const moreActions = screen.getByRole("button", {
      name: "More actions for The Ultimate TypeScript Course",
    });
    moreActions.focus();
    expect(moreActions).toHaveFocus();
    fireEvent.click(moreActions, { detail: 0, clientX: 0, clientY: 0 });

    expect(onActivate).not.toHaveBeenCalled();
    expect(moreActions).toHaveAttribute("aria-expanded", "true");
    await screen.findByRole("menuitem", {
      name: "Close session",
    });
    expect(
      screen.getByRole("menuitem", { name: "Open session" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("menuitem", { name: "Open in new tab" }),
    ).toBeEnabled();

    fireEvent.pointerDown(document.body);
    await waitFor(() =>
      expect(moreActions).toHaveAttribute("aria-expanded", "false"),
    );
    expect(
      screen.queryByRole("menu", {
        name: "The Ultimate TypeScript Course session actions",
      }),
    ).not.toBeInTheDocument();

    fireEvent.click(moreActions);

    fireEvent.click(
      await screen.findByRole("menuitem", { name: "Close session" }),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalledWith(sessions[0]));
    expect(onActivate).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(moreActions).toHaveAttribute("aria-expanded", "false"),
    );
  });
});
