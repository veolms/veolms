import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseVideo } from "../../src/learning/courseContent.js";
import { LessonPlayerChromePlaceholder } from "../../src/learning/player/LessonPlayerChromePlaceholder.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  delete window.__VEO_BOOTSTRAP__;
  delete document.documentElement.dataset.playerAutoplay;
  delete document.documentElement.dataset.playerMuted;
});

const media: CourseVideo = {
  fileName: "lesson-one.mp4",
  duration: 90,
  src: "/course-hls/lesson-one/master.m3u8",
  thumbnailSrc: "/course-hls/thumbnails/lesson-one.webp",
};

describe("LessonPlayerChromePlaceholder", () => {
  it("shows the real lesson chrome and loader without a video element", () => {
    render(
      <LessonPlayerChromePlaceholder
        media={media}
        lessonTitle="Designing for real users"
        theaterMode={false}
        onTheaterToggle={vi.fn()}
        canGoNext
        canGoPrevious
        onMinimize={vi.fn()}
      />,
    );

    expect(screen.getByRole("status", { name: "Loading video" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Settings" })).toBeTruthy();
    expect(
      screen.getAllByRole("button", {
        name: "0:00 elapsed of 0:00. Show remaining time",
      }).length,
    ).toBeGreaterThan(0);
    expect(
      document.querySelector("[data-lesson-player-controls]"),
    ).not.toBeNull();
    expect(
      document.querySelector("[data-video-player-chrome-preview]"),
    ).toHaveAttribute("data-video-player-root");
    expect(
      document.querySelector('[data-player-control-cluster="player-actions"]'),
    ).toHaveClass("box-border", "border", "border-transparent");
    expect(document.querySelector("video")).toBeNull();
  });

  it("paints stored mute and autoplay before the real player mounts", () => {
    window.__VEO_BOOTSTRAP__ = {
      player: {
        autoplay: false,
        muted: true,
        playbackRate: 1.5,
        volume: 0.4,
      },
    };
    document.documentElement.dataset.playerAutoplay = "off";
    document.documentElement.dataset.playerMuted = "true";

    render(
      <LessonPlayerChromePlaceholder
        media={media}
        lessonTitle="Designing for real users"
        theaterMode={false}
        onTheaterToggle={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("switch", { name: "Autoplay next lesson" }),
    ).toHaveAttribute("aria-checked", "false");
    expect(
      screen.getAllByRole("button", { name: "Unmute" }).length,
    ).toBeGreaterThan(0);
  });
});
