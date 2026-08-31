import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { LessonVideoPlayerProps } from "../../src/learning/player/LessonVideoPlayer.js";

vi.mock("../../src/learning/player/LessonVideoPlayer.js", () => ({
  LessonVideoPlayer: ({
    autoPlayOnMediaChange,
    lessonTitle,
  }: LessonVideoPlayerProps) => (
    <div
      data-testid="loaded-lesson-player"
      data-autoplay={String(autoPlayOnMediaChange)}
      data-video-player-root=""
      tabIndex={0}
    >
      {lessonTitle}
    </div>
  ),
}));

import { DeferredLessonVideoPlayer } from "../../src/learning/player/DeferredLessonVideoPlayer.js";

const props: React.ComponentProps<typeof DeferredLessonVideoPlayer> = {
  media: {
    duration: 90,
    fileName: "lesson.mp4",
    src: "/course-hls/lesson/master.m3u8",
  },
  lessonTitle: "A faster first lesson",
  poster: "/assets/poster.webp",
  theaterMode: false,
  onTheaterToggle: vi.fn(),
};

describe("DeferredLessonVideoPlayer", () => {
  it("keeps the player runtime unmounted until play is requested", async () => {
    render(<DeferredLessonVideoPlayer {...props} />);

    expect(
      screen.queryByTestId("loaded-lesson-player"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Play A faster first lesson" }),
    ).toBeInTheDocument();

    const playButton = screen.getByRole("button", {
      name: "Play A faster first lesson",
    });
    playButton.focus();
    fireEvent.click(playButton);

    await waitFor(() =>
      expect(screen.getByTestId("loaded-lesson-player")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("loaded-lesson-player")).toHaveAttribute(
      "data-autoplay",
      "true",
    );
    expect(screen.getByTestId("loaded-lesson-player")).toHaveFocus();
  });

  it("activates when a curriculum selection requests autoplay", async () => {
    const { rerender } = render(
      <DeferredLessonVideoPlayer {...props} autoPlayOnMediaChange={false} />,
    );

    rerender(<DeferredLessonVideoPlayer {...props} autoPlayOnMediaChange />);

    await waitFor(() =>
      expect(screen.getByTestId("loaded-lesson-player")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("loaded-lesson-player")).toHaveAttribute(
      "data-autoplay",
      "true",
    );
  });

  it("mounts for a paused mini-player restore without forcing autoplay", async () => {
    window.sessionStorage.setItem(
      "veolms-player-mini-restore",
      JSON.stringify({ autoplay: false, mediaKey: "lesson.mp4" }),
    );

    render(<DeferredLessonVideoPlayer {...props} />);

    await waitFor(() =>
      expect(screen.getByTestId("loaded-lesson-player")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("loaded-lesson-player")).toHaveAttribute(
      "data-autoplay",
      "false",
    );
  });
});
