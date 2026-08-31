import { act, render, screen, waitFor } from "@testing-library/react";
import React from "react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LearningMiniPlayerSession } from "../../src/learning/player/learningMiniPlayerTypes.ts";

const miniPlayerModule = vi.hoisted(() => {
  let release: (() => void) | undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });

  return {
    gate,
    loaded: vi.fn(),
    release: () => release?.(),
  };
});

vi.mock("../../src/CoursesPage.tsx", () => ({
  CoursesPage: () => <main>Academy content</main>,
}));

vi.mock("../../src/services/auth", () => ({
  useCurrentUser: () => ({ data: null }),
  useLogout: () => ({ mutateAsync: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock("../../src/routing/RouteGuards.tsx", () => ({
  AcademyRouteGuard: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("../../src/learning/player/LearningMiniPlayer.tsx", async () => {
  miniPlayerModule.loaded();
  await miniPlayerModule.gate;

  return {
    LearningMiniPlayer: ({
      session,
    }: {
      session: LearningMiniPlayerSession;
    }) => (
      <aside aria-label={`Mini player for ${session.lessonTitle}`}>
        Loaded mini player
      </aside>
    ),
  };
});

import {
  closeLearningMiniPlayerSession,
  openLearningMiniPlayerSession,
} from "../../src/learning/player/learningMiniPlayerStore.ts";
import AcademyLayout from "../../src/routes/academy-layout.tsx";

const session: LearningMiniPlayerSession = {
  currentTime: 42,
  lessonPath: "/learn/course-1/lesson-1",
  lessonTitle: "Lazy loading fundamentals",
  mediaKey: "course-1:lesson-1",
  muted: false,
  playbackRate: 1,
  playing: true,
  returnPath: "/courses",
  source: { src: "/media/lesson-1.m3u8" },
};

afterEach(() => {
  closeLearningMiniPlayerSession();
});

describe("AcademyLayout mini player", () => {
  it("loads the player only after a session exists and reserves its layout while loading", async () => {
    closeLearningMiniPlayerSession();
    const router = createMemoryRouter(
      [{ id: "academy-layout", path: "*", Component: AcademyLayout }],
      { initialEntries: ["/"] },
    );

    render(<RouterProvider router={router} />);

    expect(screen.getByText("Academy content")).toBeInTheDocument();
    expect(miniPlayerModule.loaded).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    act(() => openLearningMiniPlayerSession(session));

    await waitFor(() => expect(miniPlayerModule.loaded).toHaveBeenCalledOnce());
    const fallback = screen.getByRole("status", {
      name: "Loading mini player for Lazy loading fundamentals",
    });
    expect(fallback).toHaveAttribute("aria-busy", "true");
    expect(fallback).toHaveClass("aspect-video");
    expect(fallback).toHaveStyle({
      bottom: "calc(5.25rem + env(safe-area-inset-bottom))",
    });

    await act(async () => miniPlayerModule.release());

    expect(
      await screen.findByRole("complementary", {
        name: "Mini player for Lazy loading fundamentals",
      }),
    ).toHaveTextContent("Loaded mini player");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
