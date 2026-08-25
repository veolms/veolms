import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VideoPlayer } from "../../src/VideoPlayer.js";

describe("video playback consent", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("waits for an explicit play action even after media becomes ready", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const { container } = render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Consent-first lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video).toHaveAttribute("preload", "auto");
    expect(video).not.toHaveAttribute("poster");

    fireEvent.canPlay(video!);
    fireEvent.ended(video!);
    expect(play).not.toHaveBeenCalled();
    expect(screen.queryByRole("switch", { name: /Autoplay/ })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledTimes(1);
  });

  it("uses safe playback defaults when browser storage reads are blocked", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });

    expect(() =>
      render(
        <VideoPlayer
          media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
          lessonTitle="Storage-safe lesson"
          theaterMode={false}
          onTheaterToggle={() => {}}
        />,
      ),
    ).not.toThrow();
    expect(screen.getByRole("button", { name: "Mute" })).toBeVisible();
  });

  it("autoplays a newly selected lecture while keeping the initial lecture paused", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    const { rerender } = render(
      <VideoPlayer
        media={{ fileName: "lesson-1.mp4", duration: 90, src: "/lesson-1.mp4" }}
        lessonTitle="Initial lecture"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    expect(play).not.toHaveBeenCalled();

    rerender(
      <VideoPlayer
        media={{
          fileName: "lesson-2.mp4",
          duration: 120,
          src: "/lesson-2.mp4",
        }}
        lessonTitle="Selected lecture"
        theaterMode={false}
        onTheaterToggle={() => {}}
        autoPlayOnMediaChange
      />,
    );

    expect(play).toHaveBeenCalledTimes(1);
  });

  it("keeps shortcuts active on the player surface without stealing control navigation", () => {
    const play = vi
      .spyOn(HTMLMediaElement.prototype, "play")
      .mockResolvedValue(undefined);
    render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Keyboard-scoped lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    const player = screen.getByRole("region", {
      name: "Lesson video player for Keyboard-scoped lesson",
    });
    expect(player).toHaveAttribute("tabindex", "0");

    fireEvent.keyDown(player, { key: " ", code: "Space" });
    fireEvent.keyUp(player, { key: " ", code: "Space" });
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("button", { name: "Mute" }), {
      key: " ",
      code: "Space",
    });
    fireEvent.keyUp(screen.getByRole("button", { name: "Mute" }), {
      key: " ",
      code: "Space",
    });
    expect(play).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(screen.getByRole("slider", { name: "Volume" }), {
      key: " ",
      code: "Space",
    });
    fireEvent.keyUp(screen.getByRole("slider", { name: "Volume" }), {
      key: " ",
      code: "Space",
    });
    expect(play).toHaveBeenCalledTimes(1);

    const separator = document.createElement("div");
    separator.setAttribute("role", "separator");
    separator.tabIndex = 0;
    document.body.append(separator);
    const video = document.querySelector("video")!;
    fireEvent.keyDown(separator, { key: "End", code: "End" });
    expect(video.currentTime).toBe(0);
    separator.remove();
  });

  it("returns focus to the player before hiding the central play control", () => {
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Focus-safe lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    const player = screen.getByRole("region", {
      name: "Lesson video player for Focus-safe lesson",
    });
    const centralPlay = screen.getByRole("button", { name: "Play video" });
    centralPlay.focus();

    fireEvent.click(centralPlay);

    expect(player).toHaveFocus();
  });

  it("uses ordinary pressed buttons inside a labelled settings group", () => {
    render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Settings semantics lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Player settings" }));
    expect(
      screen.getByRole("group", { name: "Player settings" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Ambient mode" }),
    ).toHaveAttribute("aria-pressed");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("defaults ambient mode off on reduced-motion or coarse-pointer devices", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Constrained device lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Player settings" }));
    expect(
      screen.getByRole("button", { name: "Ambient mode" }),
    ).toHaveAttribute("aria-pressed", "false");
  });

  it("releases a pending orientation lock if fullscreen already ended", async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    const lock = vi.fn().mockResolvedValue(undefined);
    const unlock = vi.fn();
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    const originalOrientation = Object.getOwnPropertyDescriptor(
      window.screen,
      "orientation",
    );

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 844,
    });
    Object.defineProperty(window.screen, "orientation", {
      configurable: true,
      value: { type: "portrait-primary", lock, unlock },
    });

    try {
      const { container } = render(
        <VideoPlayer
          media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
          lessonTitle="Portrait fullscreen lesson"
          theaterMode={false}
          onTheaterToggle={() => {}}
        />,
      );
      const shell = container.querySelector<HTMLElement>(".video-shell");
      if (!shell) throw new Error("Expected a video shell");
      Object.defineProperty(shell, "requestFullscreen", {
        configurable: true,
        value: requestFullscreen,
      });

      fireEvent.click(
        screen.getByRole("button", { name: "Toggle fullscreen" }),
      );

      await waitFor(() => {
        expect(requestFullscreen).toHaveBeenCalledOnce();
        expect(lock).toHaveBeenCalledWith("landscape");
        expect(unlock).toHaveBeenCalledOnce();
      });
    } finally {
      Object.defineProperty(window, "innerWidth", {
        configurable: true,
        value: originalInnerWidth,
      });
      Object.defineProperty(window, "innerHeight", {
        configurable: true,
        value: originalInnerHeight,
      });
      if (originalOrientation) {
        Object.defineProperty(
          window.screen,
          "orientation",
          originalOrientation,
        );
      } else {
        Reflect.deleteProperty(window.screen, "orientation");
      }
    }
  });

  it("throttles resume persistence and flushes it on pause and unmount", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    const { container, unmount } = render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 90, src: "/lesson.mp4" }}
        lessonTitle="Resume lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) throw new Error("Expected a video element");

    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 12,
    });
    fireEvent.timeUpdate(video);

    clock.mockReturnValue(2_000);
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 14,
    });
    fireEvent.timeUpdate(video);

    clock.mockReturnValue(6_100);
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 18,
    });
    fireEvent.timeUpdate(video);

    const resumeWrites = () =>
      setItem.mock.calls.filter(([key]) => key === "veolms-watch-lesson.mp4");
    expect(resumeWrites()).toHaveLength(2);

    fireEvent.pause(video);
    expect(resumeWrites()).toHaveLength(3);

    unmount();
    expect(resumeWrites()).toHaveLength(4);
  });

  it("uses a caller-provided resume key to isolate otherwise shared media", () => {
    window.localStorage.setItem("veolms-watch-course-a-lesson-7", "42");
    window.localStorage.setItem("veolms-watch-shared.mp4", "17");
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const { container } = render(
      <VideoPlayer
        media={{ fileName: "shared.mp4", duration: 90, src: "/shared.mp4" }}
        lessonTitle="Course-scoped resume lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
        resumePersistenceKey="course-a-lesson-7"
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) throw new Error("Expected a video element");

    Object.defineProperty(video, "duration", {
      configurable: true,
      value: 90,
    });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);

    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 48,
    });
    fireEvent.pause(video);
    expect(setItem).toHaveBeenCalledWith(
      "veolms-watch-course-a-lesson-7",
      "48",
    );
    expect(setItem).not.toHaveBeenCalledWith("veolms-watch-shared.mp4", "48");
  });

  it("reports lecture progress while watching and completion when playback ends", () => {
    const onProgressChange = vi.fn();
    const { container } = render(
      <VideoPlayer
        media={{ fileName: "lesson.mp4", duration: 100, src: "/lesson.mp4" }}
        lessonTitle="Progress lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
        onProgressChange={onProgressChange}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) throw new Error("Expected a video element");

    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 50 },
      duration: { configurable: true, value: 100 },
    });
    fireEvent.timeUpdate(video);
    expect(onProgressChange).toHaveBeenLastCalledWith(50);

    fireEvent.ended(video);
    expect(onProgressChange).toHaveBeenLastCalledWith(100);
  });

  it("preserves reported lecture progress while the next media loads", () => {
    const onProgressChange = vi.fn();
    const { container, rerender } = render(
      <VideoPlayer
        media={{ fileName: "first.mp4", duration: 100, src: "/first.mp4" }}
        lessonTitle="First lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
        onProgressChange={onProgressChange}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) throw new Error("Expected a video element");

    Object.defineProperties(video, {
      currentTime: { configurable: true, value: 50 },
      duration: { configurable: true, value: 100 },
    });
    fireEvent.timeUpdate(video);
    expect(onProgressChange).toHaveBeenLastCalledWith(50);
    onProgressChange.mockClear();

    rerender(
      <VideoPlayer
        media={{ fileName: "second.mp4", duration: 100, src: "/second.mp4" }}
        lessonTitle="Second lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
        onProgressChange={onProgressChange}
      />,
    );

    expect(onProgressChange).not.toHaveBeenCalled();
  });

  it("flushes the latest resume position before a media switch", () => {
    const setItem = vi.spyOn(Storage.prototype, "setItem");
    const clock = vi.spyOn(Date, "now");
    clock.mockReturnValue(1_000);
    const { container, rerender } = render(
      <VideoPlayer
        media={{ fileName: "first.mp4", duration: 90, src: "/first.mp4" }}
        lessonTitle="First lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    if (!video) throw new Error("Expected a video element");

    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 12,
    });
    fireEvent.timeUpdate(video);

    clock.mockReturnValue(2_000);
    Object.defineProperty(video, "currentTime", {
      configurable: true,
      value: 14,
    });
    fireEvent.timeUpdate(video);

    rerender(
      <VideoPlayer
        media={{ fileName: "second.mp4", duration: 60, src: "/second.mp4" }}
        lessonTitle="Second lesson"
        theaterMode={false}
        onTheaterToggle={() => {}}
      />,
    );

    expect(
      setItem.mock.calls.filter(
        ([key, value]) => key === "veolms-watch-first.mp4" && value === "14",
      ),
    ).toHaveLength(1);
  });
});
