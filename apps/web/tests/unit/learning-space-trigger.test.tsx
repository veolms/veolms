import { act, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningSpace } from "../../src/learning-space/LearningSpace";
import type { CoursePlayerSession } from "../../src/learning/coursePlayerNavigation";

const sessions: CoursePlayerSession[] = [
  {
    courseId: "typescript-course",
    lessonId: 1,
    origin: "courses",
    path: "/learn/typescript-course/the-beginning-of-a-design-journey?from=courses",
    returnPath: "/courses",
    updatedAt: 10,
  },
  {
    courseId: "backend-nodejs",
    lessonId: 9,
    origin: "courses",
    path: "/learn/backend-nodejs/designing-for-real-users?from=courses",
    returnPath: "/courses",
    updatedAt: 50,
  },
  {
    courseId: "javascript-course",
    lessonId: 2,
    origin: "home",
    path: "/learn/javascript-course/what-is-ui-ux-design?from=home",
    returnPath: "/",
    updatedAt: 30,
  },
];

interface HarnessProps {
  sessions: readonly CoursePlayerSession[];
  onActivate: (session: CoursePlayerSession) => void;
  onExpandedChange: (expanded: boolean) => void;
}

function Harness({
  sessions: openSessions,
  onActivate,
  onExpandedChange,
}: HarnessProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <LearningSpace
      sessions={openSessions}
      activeCourseId={null}
      expanded={expanded}
      onExpandedChange={(nextExpanded) => {
        onExpandedChange(nextExpanded);
        setExpanded(nextExpanded);
      }}
      onActivate={onActivate}
      onClose={vi.fn()}
    />
  );
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query === "(hover: hover) and (pointer: fine)",
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(() => false),
    })),
  );
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Learning Space trigger", () => {
  it("resumes the most recently active session and briefly shows its panel", async () => {
    const onActivate = vi.fn();
    const onExpandedChange = vi.fn();
    render(
      <Harness
        sessions={sessions}
        onActivate={onActivate}
        onExpandedChange={onExpandedChange}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Learning Space, 3 active sessions",
      }),
      { detail: 1 },
    );

    expect(onActivate).toHaveBeenCalledWith(sessions[1]);
    expect(
      screen.getByRole("region", { name: "Learning Space" }),
    ).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });

    expect(onExpandedChange).toHaveBeenLastCalledWith(false);
    expect(
      screen.queryByRole("region", { name: "Learning Space" }),
    ).not.toBeInTheDocument();
  });

  it("keeps the panel open when the pointer reaches it", async () => {
    render(
      <Harness
        sessions={sessions}
        onActivate={vi.fn()}
        onExpandedChange={vi.fn()}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", {
        name: "Learning Space, 3 active sessions",
      }),
      { detail: 1 },
    );
    const panel = screen.getByRole("region", { name: "Learning Space" });
    fireEvent.pointerEnter(panel, { pointerType: "mouse" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(panel).toBeVisible();
  });

  it("shows an empty panel without navigation and uses only a subtle trigger fill", async () => {
    const onActivate = vi.fn();
    render(
      <Harness
        sessions={[]}
        onActivate={onActivate}
        onExpandedChange={vi.fn()}
      />,
    );

    const trigger = screen.getByRole("button", {
      name: "Learning Space, 0 active sessions",
    });
    fireEvent.click(trigger, { detail: 1 });

    expect(onActivate).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("data-empty-open", "true");
    expect(trigger).not.toHaveClass("is-active");
    expect(trigger.className).toContain("var(--accent)_7%");
    expect(
      screen.getByText("Open a course to start a learning session."),
    ).toBeVisible();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      screen.getByRole("region", { name: "Learning Space" }),
    ).toBeVisible();
  });
});
