import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseVideo } from "../../src/learning/courseContent.js";
import { LessonPlayerChromePlaceholder } from "../../src/learning/player/LessonPlayerChromePlaceholder.js";

afterEach(() => {
  cleanup();
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
    expect(document.querySelector("video")).toBeNull();
  });
});
