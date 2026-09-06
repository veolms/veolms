import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import {
    BUILT_IN_PLAYER_THEME_IDS,
  BUILT_IN_PLAYER_THEMES,
} from "@veolms/video-player";
import type {
  VideoEngineEventMap,
  VideoLoadOptions,
  VideoSource,
  VideoTextTrack,
} from "@veolms/video-player";
import { FakeVideoEngine } from "@veolms/video-player/testing";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CourseVideo } from "../../src/learning/courseContent.js";
import { LessonVideoPlayer } from "../../src/learning/player/LessonVideoPlayer.js";
import { getDefaultLearningMiniPlayerLayout } from "../../src/learning/player/learningPlayerMotion.js";
import { registerLearningMiniPlayerRuntime } from "../../src/learning/player/learningMiniPlayerStore.js";
import {
  lessonPlayerStorageKeys,
  writeMiniPlayerRestore,
} from "../../src/learning/player/lessonPlayerPersistence.js";
import { LEARNING_PREFERENCES_KEY } from "../../src/settings/settingsPreferences.js";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
  sessionStorage.clear();
  delete window.__VEO_BOOTSTRAP__;
  delete document.documentElement.dataset.playerAutoplay;
  delete document.documentElement.dataset.playerMuted;
});

const englishCaptions: VideoTextTrack = {
  id: "captions-en",
  label: "English",
  language: "en",
  active: false,
  kind: "captions",
  roles: [],
};

class RecordingFakeVideoEngine extends FakeVideoEngine {
  readonly loadCalls: Array<{
    source: VideoSource;
    options: VideoLoadOptions | undefined;
  }> = [];

  readonly selectedTextTrackIds: Array<string | null> = [];

  readonly #textTrackListeners = new Set<
    (detail: VideoEngineEventMap["texttrackchange"]) => void
  >();

  override async load(
    source: VideoSource,
    options?: VideoLoadOptions,
  ): Promise<void> {
    this.loadCalls.push({ source, options });
    await super.load(source, options);
  }

  override selectTextTrack(id: string | null): void {
    this.selectedTextTrackIds.push(id);
    super.selectTextTrack(id);
    const track =
      id === null
        ? null
        : (this.getSnapshot().textTracks.find((item) => item.id === id) ??
          null);
    for (const listener of this.#textTrackListeners) listener({ track });
  }

  override on<Type extends keyof VideoEngineEventMap>(
    type: Type,
    listener: (event: VideoEngineEventMap[Type]) => void,
  ): () => void {
    const unsubscribeFromEngine = super.on(type, listener);
    if (type !== "texttrackchange") return unsubscribeFromEngine;

    const textTrackListener = listener as (
      detail: VideoEngineEventMap["texttrackchange"],
    ) => void;
    this.#textTrackListeners.add(textTrackListener);
    return () => {
      unsubscribeFromEngine();
      this.#textTrackListeners.delete(textTrackListener);
    };
  }
}

class DeferredLoadFakeVideoEngine extends RecordingFakeVideoEngine {
  #finishLoad: (() => void) | null = null;

  override async load(
    source: VideoSource,
    options?: VideoLoadOptions,
  ): Promise<void> {
    this.loadCalls.push({ source, options });
    this.setSnapshot({
      lifecycle: "loading",
      source,
      currentTime: options?.startTime ?? source.startTime ?? 0,
      error: null,
    });
    await new Promise<void>((resolve) => {
      this.#finishLoad = resolve;
    });
  }

  finishLoad(): void {
    this.setSnapshot({ lifecycle: "ready" });
    this.#finishLoad?.();
    this.#finishLoad = null;
  }
}

const firstMedia: CourseVideo = {
  fileName: "lesson-one.mp4",
  duration: 90,
  src: "/course-hls/lesson-one/master.m3u8",
  thumbnailSrc: "/course-hls/thumbnails/lesson-one.webp",
};

const secondMedia: CourseVideo = {
  fileName: "lesson-two.mp4",
  duration: 150,
  src: "/course-hls/lesson-two/master.m3u8",
  thumbnailSrc: "/course-hls/thumbnails/lesson-two.webp",
};

function playerProps(media: CourseVideo, engine: RecordingFakeVideoEngine) {
  return {
    media,
    lessonTitle: "Designing for real users",
    theaterMode: false,
    onTheaterToggle: vi.fn(),
    engineFactory: () => engine,
  };
}

describe("LessonVideoPlayer adapter", () => {
  it("keeps one live media element when switching between full and mini presentation", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const pause = vi.spyOn(engine, "pause");
    const destroy = vi.spyOn(engine, "destroy");
    const props = playerProps(firstMedia, engine);
    const { container, rerender } = render(
      <LessonVideoPlayer {...props} presentation="full" />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    const mediaElement = container.querySelector("video");
    expect(mediaElement).not.toBeNull();

    rerender(
      <LessonVideoPlayer
        {...props}
        presentation="mini"
        onMiniClose={vi.fn()}
        onMiniRestore={vi.fn()}
      />,
    );

    expect(container.querySelector("video")).toBe(mediaElement);
    expect(engine.loadCalls).toHaveLength(1);
    expect(pause).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();

    rerender(<LessonVideoPlayer {...props} presentation="full" />);

    expect(container.querySelector("video")).toBe(mediaElement);
    expect(engine.loadCalls).toHaveLength(1);
    expect(pause).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
  });

  it("applies the saved video-player theme to the package root", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({ videoPlayerTheme: "minimal" }),
    );

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    await waitFor(() =>
      expect(player).toHaveAttribute("data-player-theme", "minimal"),
    );
    expect(player.style.getPropertyValue("--video-player-accent")).toBe(
      "var(--accent)",
    );
    expect(player.style.getPropertyValue("--video-player-menu-surface")).toBe(
      "color-mix(in srgb, var(--surface) 46%, transparent)",
    );
    expect(player.style.getPropertyValue("--video-player-menu-text")).toBe(
      "var(--text)",
    );
  });

  it.each(BUILT_IN_PLAYER_THEME_IDS)(
    "keeps autoplay visible and functional in the %s theme",
    async (themeId) => {
      const engine = new RecordingFakeVideoEngine(90);
      const onAutoplayEnabledChange = vi.fn();
      localStorage.setItem(
        LEARNING_PREFERENCES_KEY,
        JSON.stringify({ videoPlayerTheme: themeId }),
      );

      render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          autoplayEnabled
          onAutoplayEnabledChange={onAutoplayEnabledChange}
        />,
      );

      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const autoplaySwitch = await screen.findByRole("switch", {
        name: "Autoplay next lesson",
      });
      const track = autoplaySwitch.querySelector("[data-autoplay-track]");

      await waitFor(() =>
        expect(player).toHaveAttribute("data-player-theme", themeId),
      );
      expect(track).toHaveAttribute("data-autoplay-track-state", "on");
      expect(player.style.getPropertyValue("--video-player-accent")).toBe(
        "var(--accent)",
      );
      expect(player.style.getPropertyValue("--video-player-control-text")).toBe(
        BUILT_IN_PLAYER_THEMES[themeId].tokens.controlText,
      );

      fireEvent.click(autoplaySwitch);
      expect(onAutoplayEnabledChange).toHaveBeenCalledWith(false);
    },
  );

  it.each(BUILT_IN_PLAYER_THEME_IDS)(
    "toggles the mobile lessons control in the %s theme",
    async (themeId) => {
      const engine = new RecordingFakeVideoEngine(90);
      const onCourseLessonsToggle = vi.fn();
      localStorage.setItem(
        LEARNING_PREFERENCES_KEY,
        JSON.stringify({ videoPlayerTheme: themeId }),
      );
      const { rerender } = render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          courseLessonsOpen={false}
          onCourseLessonsToggle={onCourseLessonsToggle}
        />,
      );

      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      const openButton = screen.getByRole("button", { name: "Open lessons" });
      expect(openButton).toHaveAttribute("aria-expanded", "false");
      expect(openButton).toHaveAttribute(
        "aria-controls",
        "lesson-drawer-curriculum-scrollport",
      );
      expect(openButton).toHaveAttribute(
        "data-player-control-hit-area",
        "course-lessons",
      );
      expect(openButton).toHaveClass(
        "h-11",
        "px-4",
        "py-0",
        "!text-xs",
        "leading-none",
        "before:inset-x-0.5",
        "before:inset-y-1.5",
        "before:backdrop-blur-sm",
      );
      const arrow = openButton.querySelector<HTMLElement>(
        ".learning-curriculum__section-arrow",
      );
      expect(arrow).not.toHaveClass("is-open");
      expect(arrow?.querySelector("svg")).toHaveAttribute("width", "15");
      expect(arrow?.querySelector("svg")).toHaveAttribute("height", "15");
      expect(
        openButton.closest('[data-mobile-player-corner="fullscreen"]'),
      ).toHaveClass("z-60");

      fireEvent.click(openButton);
      expect(onCourseLessonsToggle).toHaveBeenCalledTimes(1);

      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          courseLessonsOpen
          courseLessonsDrawerOpen
          onCourseLessonsToggle={onCourseLessonsToggle}
        />,
      );
      const closeButton = screen.getByRole("button", {
        name: "Close lessons",
      });
      expect(closeButton).toHaveAttribute("aria-expanded", "true");
      expect(
        closeButton.querySelector(".learning-curriculum__section-arrow"),
      ).toBe(arrow);
      expect(arrow).toHaveClass("is-open");

      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          courseLessonsOpen={false}
          courseLessonsDrawerOpen={false}
          onCourseLessonsToggle={onCourseLessonsToggle}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Open lessons" }),
      ).toContainElement(arrow);
      expect(arrow).not.toHaveClass("is-open");
    },
  );

  it("keeps the mobile drawer chevron closed when side-panel open state is stale", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        courseLessonsOpen
        courseLessonsDrawerOpen={false}
        onCourseLessonsToggle={vi.fn()}
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    const openButton = screen.getByRole("button", { name: "Open lessons" });
    const arrow = openButton.querySelector<HTMLElement>(
      ".learning-curriculum__section-arrow",
    );

    expect(openButton).toHaveAttribute("aria-expanded", "false");
    expect(arrow).not.toHaveClass("is-open");
    expect(openButton).toHaveAttribute(
      "data-course-lessons-presentation",
      "drawer",
    );
  });

  it("shows the desktop lessons control beside circular fullscreen with side-panel styling", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onCourseLessonsToggle = vi.fn();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query !== "(max-width: 640px)",
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

    try {
      render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          courseLessonsOpen={false}
          courseLessonsSidePanel
          onCourseLessonsToggle={onCourseLessonsToggle}
        />,
      );

      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      const playerActions = document.querySelector(
        '[data-player-control-cluster="player-actions"]',
      );
      const desktopEndControls = document.querySelector(
        "[data-player-desktop-end-controls]",
      );
      expect(playerActions).not.toBeNull();
      expect(desktopEndControls).not.toBeNull();
      expect(playerActions!.parentElement).toHaveClass("right-2", "top-2");
      expect(playerActions!.parentElement).not.toHaveClass("sm:bottom-2.5");
      expect(desktopEndControls).toHaveClass("right-2", "bottom-2.5");
      const openButton = desktopEndControls!.querySelector(
        '[data-player-control-hit-area="course-lessons"]',
      );
      expect(openButton).not.toBeNull();
      expect(openButton).toHaveAttribute(
        "aria-controls",
        "learning-course-curriculum-scrollport",
      );
      expect(openButton).toHaveAttribute(
        "data-course-lessons-presentation",
        "side",
      );
      expect(openButton).toHaveClass(
        "h-9.5",
        "px-3.5",
        "py-[3px]",
        "!text-sm",
        "leading-none",
        "before:inset-0",
        "before:backdrop-blur-sm",
      );
      expect(playerActions).toHaveClass("relative", "isolate");
      expect(openButton).not.toBe(playerActions);
      expect(playerActions!.contains(openButton)).toBe(false);
      expect(desktopEndControls).toContainElement(openButton as HTMLElement);
      expect(
        within(desktopEndControls as HTMLElement).getByRole("button", {
          name: "Toggle fullscreen",
        }),
      ).toHaveClass("!size-11", "!rounded-full");
      expect(
        within(playerActions as HTMLElement).queryByRole("button", {
          name: "Toggle fullscreen",
        }),
      ).toBeNull();

      fireEvent.click(
        within(playerActions as HTMLElement).getByRole("button", {
          name: "Settings",
        }),
      );
      const settingsMenu = screen.getByRole("menu", { name: "Video settings" });
      expect(settingsMenu).toHaveClass("z-200", "overflow-y-auto");
      expect(settingsMenu).toHaveAttribute("data-video-player-menu-panel");
      expect(settingsMenu.closest(".video-shell")).not.toBeNull();
      expect(settingsMenu.style.maxHeight).toBeTruthy();

      fireEvent.click(openButton!);
      expect(onCourseLessonsToggle).toHaveBeenCalledWith("side");
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("toggles every lesson control overlay when empty video space is tapped", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const play = vi.spyOn(engine, "play");
    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    vi.useFakeTimers();
    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    const gestureSurface = screen.getByRole("button", {
      name: "Play or pause video; tap to show controls",
    });
    const controls = document.querySelector<HTMLElement>(
      '[data-lesson-player-controls=""]',
    );
    const centralControls = document.querySelector<HTMLElement>(
      '[data-lesson-central-controls=""]',
    );
    const timelineLayer = document.querySelector<HTMLElement>(
      '[data-player-timeline-layer=""]',
    );
    const timeline = screen.getByRole("slider", { name: "Video timeline" });
    const timelineRoot = timeline.closest<HTMLElement>(
      "[data-controls-visible]",
    );
    const timelineThumb = document.querySelector<HTMLElement>(
      '[data-timeline-thumb=""]',
    );
    const bottomCornerControlsLayer = document.querySelector<HTMLElement>(
      '[data-player-bottom-corner-controls-layer=""]',
    );
    const centralPlay = document.querySelector<HTMLElement>(
      '[data-player-control-cluster="mobile-play"] [data-player-control]',
    );
    const tapEmptySpace = () => {
      fireEvent.pointerDown(gestureSurface, {
        clientX: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerUp(gestureSurface, {
        clientX: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(301));
    };

    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(timelineLayer).not.toHaveAttribute("inert");
    expect(bottomCornerControlsLayer).not.toHaveAttribute("inert");
    expect(bottomCornerControlsLayer).toHaveClass(
      "pointer-events-none",
      "absolute",
      "inset-0",
      "z-180",
    );
    expect(bottomCornerControlsLayer?.closest(".video-shell")).not.toBeNull();
    expect(
      bottomCornerControlsLayer?.closest("[data-video-player-root]"),
    ).toBeNull();
    expect(controls).not.toHaveClass("[&_*]:!pointer-events-none");
    expect(centralControls).not.toHaveClass("[&_*]:!pointer-events-none");

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(play).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(centralPlay!, { detail: 1 });
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledOnce();
    expect(player).toHaveAttribute("data-controls-visible", "false");
    expect(controls).toHaveAttribute("inert");
    expect(centralControls).toHaveAttribute("inert");
    expect(timelineLayer).toHaveAttribute("inert");
    expect(bottomCornerControlsLayer).toHaveAttribute("inert");
    expect(timelineLayer).toHaveClass(
      "visible",
      "opacity-100",
      "pointer-events-none",
      "[&_*]:!pointer-events-none",
    );
    expect(timelineRoot).toHaveAttribute("data-controls-visible", "false");
    expect(timelineThumb).toHaveClass("opacity-0");
    expect(controls).toHaveClass("invisible", "[&_*]:!pointer-events-none");
    expect(centralControls).toHaveClass(
      "invisible",
      "[&_*]:!pointer-events-none",
    );

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(timelineLayer).not.toHaveAttribute("inert");
    expect(timelineLayer).toHaveClass("visible", "pointer-events-none");
    expect(timelineRoot).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveClass("[&_*]:!pointer-events-none");
    expect(centralControls).not.toHaveClass("[&_*]:!pointer-events-none");

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "false");
  });

  it("delays the buffering spinner while central controls remain inert", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const { container } = render(
      <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
    );
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    vi.useFakeTimers();
    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    const gestureSurface = screen.getByRole("button", {
      name: "Play or pause video; tap to show controls",
    });
    const centralControls = container.querySelector<HTMLElement>(
      '[data-lesson-central-controls=""]',
    )!;

    expect(centralControls).not.toHaveAttribute("inert");
    expect(
      within(centralControls).getByRole("button", { name: "Play" }),
    ).toBeVisible();

    act(() => engine.setSnapshot({ buffering: true }));
    expect(centralControls).toHaveAttribute("data-player-loading", "true");
    expect(centralControls).toHaveAttribute("inert");
    expect(centralControls).toHaveClass("invisible", "opacity-0");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();

    await act(async () => vi.advanceTimersByTime(999));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await act(async () => vi.advanceTimersByTime(1));
    const bufferingIndicator = screen.getByRole("status", {
      name: "Buffering video",
    });

    fireEvent.pointerDown(gestureSurface, {
      clientX: 100,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerUp(gestureSurface, {
      clientX: 100,
      pointerId: 1,
      pointerType: "touch",
    });
    act(() => vi.advanceTimersByTime(301));

    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(screen.getByRole("status", { name: "Buffering video" })).toBe(
      bufferingIndicator,
    );

    act(() => engine.setSnapshot({ buffering: false }));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(centralControls).not.toHaveAttribute("data-player-loading");
  });

  it("shows chrome and the loader until the lesson video is ready", async () => {
    const engine = new DeferredLoadFakeVideoEngine(90);
    const { container } = render(
      <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(screen.getByRole("status", { name: "Loading video" })).toBeVisible();
    expect(
      screen.getAllByRole("button", {
        name: "0:00 elapsed of 0:00. Show remaining time",
      }).length,
    ).toBeGreaterThan(0);

    const mediaPlane = container.querySelector<HTMLElement>(
      '[data-player-zoom-media-plane=""]',
    );
    expect(
      container.querySelector('[data-video-player-poster-overlay=""]'),
    ).not.toBeInTheDocument();
    expect(mediaPlane?.parentElement).toHaveAttribute(
      "data-player-zoom-viewport",
      "",
    );
    expect(mediaPlane?.parentElement).toHaveClass("z-0", "isolate");
    expect(container.querySelector("video")).not.toHaveAttribute("poster");

    const controls = container.querySelector<HTMLElement>(
      '[data-lesson-player-controls=""]',
    )!;
    const centralControls = container.querySelector<HTMLElement>(
      '[data-lesson-central-controls=""]',
    )!;
    const gestureSurface = container.querySelector<HTMLButtonElement>(
      '[data-player-shortcut-surface=""]',
    )!;
    expect(controls).not.toHaveAttribute("inert");
    expect(controls).not.toHaveAttribute("aria-hidden");
    expect(centralControls).toHaveAttribute("inert");
    expect(centralControls).toHaveAttribute("data-player-loading", "true");
    expect(centralControls).toHaveClass("invisible", "opacity-0");
    expect(gestureSurface).toBeDisabled();
    expect(gestureSurface).toHaveAttribute("aria-hidden", "true");

    act(() => engine.finishLoad());

    await waitFor(() =>
      expect(
        screen.queryByRole("status", { name: "Loading video" }),
      ).not.toBeInTheDocument(),
    );
    expect(controls).not.toHaveAttribute("inert");
    expect(controls).not.toHaveAttribute("aria-hidden");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("data-player-loading");
    expect(gestureSurface).toBeEnabled();
    expect(gestureSurface).not.toHaveAttribute("aria-hidden");
    expect(
      within(centralControls).getByRole("button", { name: "Play" }),
    ).toBeVisible();
    expect(centralControls).toHaveClass("z-20");
    expect(controls).toHaveClass("z-30");

    await act(async () => engine.play());
    expect(
      container.querySelector('[data-video-player-poster-overlay=""]'),
    ).not.toBeInTheDocument();
    expect(container.querySelector("video")).not.toHaveClass("invisible");
  });

  it("hides touch controls after center play and reveals them before pause", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const play = vi.spyOn(engine, "play");
    const pause = vi.spyOn(engine, "pause");
    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    vi.useFakeTimers();
    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    const gestureSurface = screen.getByRole("button", {
      name: "Play or pause video; tap to show controls",
    });
    const centralControls = document.querySelector<HTMLElement>(
      '[data-lesson-central-controls=""]',
    )!;
    const tapEmptySpace = () => {
      fireEvent.pointerDown(gestureSurface, {
        clientX: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerUp(gestureSurface, {
        clientX: 100,
        pointerId: 1,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(301));
    };

    await act(async () => {
      fireEvent.click(
        within(centralControls).getByRole("button", { name: "Play" }),
      );
      await Promise.resolve();
    });
    expect(play).toHaveBeenCalledOnce();
    expect(player).toHaveAttribute("data-controls-visible", "false");

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");

    await act(async () => {
      fireEvent.click(
        within(centralControls).getByRole("button", { name: "Pause" }),
      );
      await Promise.resolve();
    });
    expect(pause).toHaveBeenCalledOnce();
    expect(player).toHaveAttribute("data-controls-visible", "true");

    act(() => vi.advanceTimersByTime(5_100));
    expect(player).toHaveAttribute("data-controls-visible", "true");

    await act(async () => {
      fireEvent.click(
        within(centralControls).getByRole("button", { name: "Play" }),
      );
      await Promise.resolve();
    });
    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(4_698));
    expect(player).toHaveAttribute("data-controls-visible", "true");
    act(() => vi.advanceTimersByTime(1));
    expect(player).toHaveAttribute("data-controls-visible", "false");
  });

  it("moves captions into settings and selects a caption track", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    engine.setSnapshot({ textTracks: [englishCaptions] });

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    expect(
      screen.queryByRole("button", { name: "Turn captions on" }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      document.querySelector('[data-lesson-player-controls=""]'),
    ).toHaveClass("z-180");
    const captionsItem = screen.getByRole("menuitem", {
      name: "Captions Off",
    });
    expect(
      captionsItem.querySelector('[data-caption-icon-state="outline"]'),
    ).not.toBeNull();

    fireEvent.click(captionsItem);
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English en" }));

    await waitFor(() =>
      expect(engine.getSnapshot().selectedTextTrackId).toBe(englishCaptions.id),
    );

    expect(
      screen.getByRole("dialog", { name: "Video settings" }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("menuitemradio", { name: "English en" }),
      ).toHaveAttribute("aria-checked", "true"),
    );
    fireEvent.click(screen.getByRole("menuitem", { name: "Captions" }));
    expect(
      screen
        .getByRole("menuitem", { name: "Captions English" })
        .querySelector('[data-caption-icon-state="filled"]'),
    ).not.toBeNull();
  });

  it("keeps desktop settings and every control visible after pointer leave", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches:
        query === "(hover: hover) and (pointer: fine)" ||
        query === "(min-width: 40rem)",
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

    try {
      const { container } = render(
        <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = container.querySelector<HTMLElement>(".video-shell")!;
      const gestureSurface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const controlLayer = container.querySelector<HTMLElement>(
        '[data-lesson-player-controls=""]',
      );
      const centralControls = container.querySelector<HTMLElement>(
        '[data-lesson-central-controls=""]',
      );

      fireEvent.pointerEnter(shell, { pointerType: "mouse" });
      const settingsButton = within(player).getByRole("button", {
        name: "Settings",
      });
      fireEvent.click(settingsButton);
      expect(
        screen.getByRole("menu", { name: "Video settings" }),
      ).toBeVisible();

      fireEvent.pointerLeave(shell, { pointerType: "mouse" });

      expect(
        screen.getByRole("menu", { name: "Video settings" }),
      ).toBeVisible();
      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(controlLayer).not.toHaveAttribute("inert");
      expect(centralControls).not.toHaveAttribute("inert");

      fireEvent.click(settingsButton);
      expect(
        screen.queryByRole("menu", { name: "Video settings" }),
      ).not.toBeInTheDocument();

      fireEvent.pointerEnter(shell, { pointerType: "mouse" });
      fireEvent.click(within(player).getByRole("button", { name: "Settings" }));
      expect(
        screen.getByRole("menu", { name: "Video settings" }),
      ).toBeVisible();

      fireEvent.pointerDown(gestureSurface, { pointerType: "mouse" });
      expect(
        screen.queryByRole("menu", { name: "Video settings" }),
      ).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps autoplay in the player and ambient mode inside settings", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onAutoplayEnabledChange = vi.fn();

    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        autoplayEnabled
        onAutoplayEnabledChange={onAutoplayEnabledChange}
      />,
    );

    const autoplaySwitch = await screen.findByRole("switch", {
      name: "Autoplay next lesson",
    });
    const autoplayTrack = autoplaySwitch.querySelector<HTMLElement>(
      "[data-autoplay-track]",
    );
    const autoplayKnob = autoplaySwitch.querySelector<HTMLElement>(
      "[data-autoplay-knob]",
    );
    expect(autoplaySwitch).toHaveClass("h-8", "px-2", "sm:h-9", "sm:px-3");
    expect(autoplaySwitch).toHaveClass("!shadow-none", "drop-shadow-none");
    expect(autoplayTrack).toHaveClass(
      "h-3.5",
      "w-8",
      "sm:h-4",
      "sm:w-9",
      "border-0",
      "bg-black/40",
    );
    expect(autoplayTrack).toHaveAttribute("data-autoplay-track-state", "on");
    expect(autoplayKnob).toHaveClass(
      "size-4.5",
      "left-3.5",
      "sm:size-5",
      "sm:left-4.5",
    );
    expect(autoplayKnob?.querySelector("svg")).toHaveAttribute("width", "11");

    fireEvent.click(autoplaySwitch);
    expect(onAutoplayEnabledChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(
      screen.queryByRole("menuitem", { name: /^Captions\b/ }),
    ).not.toBeInTheDocument();
    const ambientSetting = screen.getByRole("menuitemcheckbox", {
      name: /Ambient mode/i,
    });
    const ambientToggle = ambientSetting.querySelector<HTMLElement>(
      "[data-player-menu-toggle]",
    );
    const ambientKnob = ambientToggle?.firstElementChild;
    const initialAmbientState = ambientSetting.getAttribute("aria-checked");
    expect(ambientToggle).toHaveAttribute(
      "data-player-menu-toggle-state",
      initialAmbientState === "true" ? "on" : "off",
    );
    expect(ambientToggle).toHaveClass(
      initialAmbientState === "true"
        ? "bg-[color-mix(in_srgb,var(--video-player-accent)_78%,var(--video-player-menu-surface))]"
        : "bg-[color-mix(in_srgb,var(--video-player-menu-text)_22%,transparent)]",
    );
    expect(ambientKnob).toHaveClass("bg-(--video-player-menu-text)");
    expect(ambientSetting).not.toHaveClass(
      "bg-[color-mix(in_srgb,var(--video-player-accent)_14%,transparent)]",
    );
    const ambientIcon = ambientSetting.querySelector<HTMLElement>(
      "[data-ambient-mode-icon]",
    );
    expect(ambientIcon).toHaveAttribute(
      "data-ambient-mode-icon-state",
      initialAmbientState === "true" ? "on" : "off",
    );
    expect(ambientIcon).toHaveClass(
      "h-3",
      "w-4.5",
      "border",
      "border-current",
      "text-white",
      initialAmbientState === "true"
        ? "shadow-[0_0_10.5px_rgba(255,255,255,0.72)]"
        : "shadow-none",
    );
    expect(ambientIcon?.querySelector("svg")).toBeNull();
    expect(ambientIcon).toBeEmptyDOMElement();
    fireEvent.click(ambientSetting);
    expect(ambientSetting).toHaveAttribute(
      "aria-checked",
      initialAmbientState === "true" ? "false" : "true",
    );
    expect(ambientIcon).toHaveAttribute(
      "data-ambient-mode-icon-state",
      initialAmbientState === "true" ? "off" : "on",
    );
    expect(ambientIcon).toHaveClass("border-current", "text-white");
    expect(ambientIcon).toHaveClass(
      initialAmbientState === "true"
        ? "shadow-none"
        : "shadow-[0_0_10.5px_rgba(255,255,255,0.72)]",
    );
    expect(ambientSetting).not.toHaveTextContent(/\b(?:On|Off)\b/);
  });

  it("minimizes from a downward touch swipe on phones", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const play = vi.spyOn(engine, "play");
    const onMinimize = vi.fn();
    const onMinimizeGestureChange = vi.fn();
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 640px)",
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
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 915 },
      innerWidth: { configurable: true, value: 412 },
    });

    try {
      const { container, rerender } = render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
          onMinimizeGestureChange={onMinimizeGestureChange}
        />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      expect(
        screen.getByRole("button", { name: "Minimize" }),
      ).toHaveClass(
        "!size-9",
        "!bg-transparent",
        "[&&&]:!bg-transparent",
        "[&&&:hover]:!bg-transparent",
        "[&&&:active]:!bg-transparent",
        "[&&&:focus-visible]:!bg-transparent",
      );
      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = player.parentElement!;
      const centralPlay = container.querySelector<HTMLElement>(
        '[data-player-control-cluster="mobile-play"] [data-player-control]',
      );
      const playerControls = container.querySelector<HTMLElement>(
        "[data-lesson-player-controls]",
      );
      const centralControls = container.querySelector<HTMLElement>(
        "[data-lesson-central-controls]",
      );
      expect(centralPlay).not.toBeNull();
      expect(playerControls).not.toBeNull();
      expect(centralControls).not.toBeNull();
      expect(shell).toHaveClass(
        "touch-pan-x",
        "touch-pinch-zoom",
        "min-[641px]:touch-pan-y",
      );
      Object.defineProperties(shell, {
        hasPointerCapture: { value: () => true },
        releasePointerCapture: { value: vi.fn() },
        setPointerCapture: { value: vi.fn() },
      });
      vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
        bottom: 232,
        height: 232,
        left: 0,
        right: 412,
        top: 0,
        width: 412,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });
      vi.useFakeTimers();

      fireEvent.pointerDown(centralPlay!, {
        clientX: 180,
        clientY: 30,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.pointerMove(centralPlay!, {
        clientX: 184,
        clientY: 330,
        pointerId: 7,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(16));
      const forwardTransform = shell.style.transform;
      expect(forwardTransform).toMatch(/translate3d\(.+px, .+px, 0\) scale\(/);
      expect(shell).toHaveAttribute("data-learning-player-controls-suppressed");
      expect(playerControls).toHaveAttribute("aria-hidden", "true");
      expect(playerControls).toHaveAttribute("inert");
      expect(playerControls).toHaveClass(
        "invisible",
        "opacity-0",
        "transition-none",
      );
      expect(centralControls).toHaveAttribute("aria-hidden", "true");
      expect(centralControls).toHaveAttribute("inert");
      expect(centralControls).toHaveClass(
        "invisible",
        "opacity-0",
        "transition-none",
      );
      const forwardGesture = onMinimizeGestureChange.mock.lastCall?.[0];
      expect(forwardGesture).toEqual(
        expect.objectContaining({ offsetY: 300, phase: "dragging" }),
      );
      expect(onMinimize).not.toHaveBeenCalled();

      fireEvent.pointerMove(centralPlay!, {
        clientX: 182,
        clientY: 130,
        pointerId: 7,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(16));
      const reversedTransform = shell.style.transform;
      const readTranslateY = (transform: string) =>
        Number(/translate3d\([^,]+,\s*([\d.]+)px/.exec(transform)?.[1] ?? 0);
      expect(readTranslateY(reversedTransform)).toBeLessThan(
        readTranslateY(forwardTransform),
      );
      expect(onMinimizeGestureChange.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({ offsetY: 100, phase: "dragging" }),
      );
      expect(onMinimize).not.toHaveBeenCalled();

      fireEvent.pointerMove(centralPlay!, {
        clientX: 184,
        clientY: 460,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.pointerUp(centralPlay!, {
        clientX: 184,
        clientY: 460,
        pointerId: 7,
        pointerType: "touch",
      });
      const playCallsBeforeCompatibilityClick = play.mock.calls.length;
      fireEvent.click(centralPlay!);
      expect(play).toHaveBeenCalledTimes(playCallsBeforeCompatibilityClick);
      act(() => vi.advanceTimersByTime(16));

      const expectedMiniScale = (
        getDefaultLearningMiniPlayerLayout().width / 412
      ).toFixed(5);
      expect(shell.style.transform).toContain(`scale(${expectedMiniScale})`);
      expect(playerControls).toHaveAttribute("aria-hidden", "true");
      expect(centralControls).toHaveAttribute("aria-hidden", "true");
      expect(onMinimize).not.toHaveBeenCalled();
      fireEvent.transitionEnd(shell, { propertyName: "transform" });
      expect(onMinimize).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonTitle: "Designing for real users",
          mediaKey: "lesson-one.mp4",
          source: expect.objectContaining({
            src: "/course-hls/lesson-one/master.m3u8",
          }),
        }),
      );

      const gestureCallsAfterMiniSettled =
        onMinimizeGestureChange.mock.calls.length;
      const terminalGesture = onMinimizeGestureChange.mock.lastCall?.[0];
      expect(terminalGesture).toEqual(
        expect.objectContaining({
          phase: "settling-mini",
          progress: 1,
        }),
      );
      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
          onMinimizeGestureChange={onMinimizeGestureChange}
          presentation="mini"
        />,
      );
      expect(onMinimizeGestureChange).toHaveBeenCalledTimes(
        gestureCallsAfterMiniSettled,
      );
      expect(
        container.querySelector("[data-lesson-player-controls]"),
      ).toBeNull();
      expect(
        container.querySelector("[data-lesson-central-controls]"),
      ).toBeNull();
      expect(
        screen.getByRole("button", {
          name: "Expand",
        }),
      ).toBeInTheDocument();
      expect(
        screen.getByRole("button", { name: "Close mini player" }),
      ).toBeInTheDocument();
      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
          onMinimizeGestureChange={onMinimizeGestureChange}
          presentation="full"
        />,
      );

      expect(shell.style.transform).toBe("");
      expect(shell).not.toHaveAttribute(
        "data-learning-player-controls-suppressed",
      );
      expect(onMinimizeGestureChange.mock.lastCall?.[0]).toBe(terminalGesture);
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperties(window, {
        innerHeight: { configurable: true, value: originalInnerHeight },
        innerWidth: { configurable: true, value: originalInnerWidth },
      });
    }
  });

  it("restores immediately when the mini endpoint is pressed before settle completes", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onMinimize = vi.fn();
    const onMiniRestore = vi.fn();
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 640px)",
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
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 915 },
      innerWidth: { configurable: true, value: 412 },
    });

    try {
      function ImmediateRestoreHarness() {
        const [presentation, setPresentation] = useState<"full" | "mini">(
          "full",
        );
        return (
          <LessonVideoPlayer
            {...playerProps(firstMedia, engine)}
            onMinimize={(request) => {
              onMinimize(request);
              setPresentation("mini");
            }}
            onMiniRestore={() => {
              onMiniRestore();
              setPresentation("full");
            }}
            presentation={presentation}
          />
        );
      }

      render(<ImmediateRestoreHarness />);
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      vi.useFakeTimers();

      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = player.parentElement!;
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      Object.defineProperties(shell, {
        hasPointerCapture: { value: () => true },
        releasePointerCapture: { value: vi.fn() },
        setPointerCapture: { value: vi.fn() },
      });
      vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
        bottom: 232,
        height: 232,
        left: 0,
        right: 412,
        top: 0,
        width: 412,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });

      fireEvent.pointerDown(surface, {
        clientX: 190,
        clientY: 30,
        isPrimary: true,
        pointerId: 21,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 192,
        clientY: 460,
        isPrimary: true,
        pointerId: 21,
        pointerType: "touch",
      });
      fireEvent.pointerUp(surface, {
        clientX: 192,
        clientY: 460,
        isPrimary: true,
        pointerId: 21,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(16));

      const expectedMiniScale = (
        getDefaultLearningMiniPlayerLayout().width / 412
      ).toFixed(5);
      expect(shell.style.transform).toContain(`scale(${expectedMiniScale})`);
      expect(onMinimize).not.toHaveBeenCalled();
      expect(onMiniRestore).not.toHaveBeenCalled();

      fireEvent.pointerDown(surface, {
        clientX: 250,
        clientY: 730,
        isPrimary: true,
        pointerId: 22,
        pointerType: "touch",
      });

      expect(onMinimize).toHaveBeenCalledTimes(1);
      expect(onMiniRestore).not.toHaveBeenCalled();
      expect(
        screen.getByRole("button", {
          name: "Expand",
        }),
      ).toBeInTheDocument();

      act(() => vi.advanceTimersByTime(0));

      expect(onMiniRestore).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("button", { name: "Minimize" }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("button", {
          name: "Expand",
        }),
      ).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperties(window, {
        innerHeight: { configurable: true, value: originalInnerHeight },
        innerWidth: { configurable: true, value: originalInnerWidth },
      });
    }
  });

  it("keeps repeated partial minimize swipes from becoming a one-finger pinch", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onMinimize = vi.fn();
    const originalMatchMedia = window.matchMedia;
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 640px)",
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
    Object.defineProperties(window, {
      innerHeight: { configurable: true, value: 915 },
      innerWidth: { configurable: true, value: 412 },
    });

    try {
      const { container } = render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
        />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      vi.useFakeTimers();

      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = player.parentElement!;
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const media = container.querySelector("video")!;
      let captureTarget: HTMLElement | null = null;
      const installPointerCapture = (element: HTMLElement) => {
        Object.assign(element, {
          hasPointerCapture: vi.fn(() => captureTarget === element),
          releasePointerCapture: vi.fn(() => {
            if (captureTarget === element) captureTarget = null;
          }),
          setPointerCapture: vi.fn(() => {
            captureTarget = element;
          }),
        });
      };
      installPointerCapture(shell);
      installPointerCapture(surface);
      vi.spyOn(shell, "getBoundingClientRect").mockReturnValue({
        bottom: 232,
        height: 232,
        left: 0,
        right: 412,
        top: 0,
        width: 412,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });

      fireEvent.pointerDown(surface, {
        clientX: 180,
        clientY: 30,
        isPrimary: true,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 180,
        clientY: 100,
        isPrimary: true,
        pointerId: 7,
        pointerType: "touch",
      });
      expect(captureTarget).toBe(shell);
      fireEvent.pointerUp(captureTarget!, {
        clientX: 180,
        clientY: 100,
        isPrimary: true,
        pointerId: 7,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(220));
      expect(onMinimize).not.toHaveBeenCalled();

      fireEvent.pointerDown(surface, {
        clientX: 180,
        clientY: 130,
        isPrimary: true,
        pointerId: 8,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 180,
        clientY: 230,
        isPrimary: true,
        pointerId: 8,
        pointerType: "touch",
      });

      expect(captureTarget).toBe(shell);
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.000");
      expect(media).toHaveAttribute("data-player-zoom-active", "false");
      expect(
        screen.queryByRole("button", { name: /Reset video zoom/ }),
      ).not.toBeInTheDocument();
      expect(onMinimize).not.toHaveBeenCalled();

      fireEvent.pointerCancel(surface, {
        clientX: 180,
        clientY: 230,
        isPrimary: true,
        pointerId: 8,
        pointerType: "touch",
      });
    } finally {
      window.matchMedia = originalMatchMedia;
      Object.defineProperties(window, {
        innerHeight: { configurable: true, value: originalInnerHeight },
        innerWidth: { configurable: true, value: originalInnerWidth },
      });
    }
  });

  it("does not persist internal handoff muting when the media element echoes the change", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onMinimize = vi.fn();
    const { container } = render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        onMinimize={onMinimize}
      />,
    );
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    const mutedPreferenceBeforeHandoff = localStorage.getItem(
      lessonPlayerStorageKeys.muted,
    );

    fireEvent.click(screen.getByRole("button", { name: "Minimize" }));
    const request = onMinimize.mock.calls[0]?.[0] as
      { preparePlaybackHandoff?: () => void } | undefined;
    expect(request?.preparePlaybackHandoff).toBeTypeOf("function");

    act(() => {
      request?.preparePlaybackHandoff?.();
      // Browsers echo the programmatic muted assignment with a native
      // volumechange after the engine's synchronous notification.
      engine.setMuted(true);
    });

    expect(localStorage.getItem(lessonPlayerStorageKeys.muted)).toBe(
      mutedPreferenceBeforeHandoff,
    );
    expect(localStorage.getItem(lessonPlayerStorageKeys.muted)).not.toBe(
      "true",
    );
    expect(container.querySelector("video")).toBeInTheDocument();
  });

  it("exposes a mobile mute control so a saved muted state is recoverable", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    localStorage.setItem(lessonPlayerStorageKeys.muted, "true");
    const { container } = render(
      <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
    );
    await waitFor(() => expect(engine.getSnapshot().muted).toBe(true));

    const mobileVolumeControl = container.querySelector<HTMLElement>(
      "[data-mobile-volume-control]",
    );
    expect(mobileVolumeControl).toHaveClass("sm:hidden");
    fireEvent.click(
      within(mobileVolumeControl!).getByRole("button", { name: "Unmute" }),
    );

    await waitFor(() => expect(engine.getSnapshot().muted).toBe(false));
    expect(localStorage.getItem(lessonPlayerStorageKeys.muted)).toBe("false");
  });

  it("keeps pinch zoom inside the video instead of triggering mobile minimize", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onMinimize = vi.fn();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(max-width: 640px)",
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

    try {
      const { container } = render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          canGoNext
          onMinimize={onMinimize}
        />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      vi.useFakeTimers();
      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = container.querySelector<HTMLElement>(".video-shell");
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const centralPlay = container.querySelector<HTMLElement>(
        '[data-player-control-cluster="mobile-play"] [data-player-control]',
      );
      const centralNext = container.querySelector<HTMLElement>(
        '[data-player-control-cluster="mobile-next"] [data-player-control]',
      );
      const media = container.querySelector("video");
      expect(centralPlay).not.toBeNull();
      expect(centralNext).not.toBeNull();
      Object.assign(shell!, {
        hasPointerCapture: vi.fn(() => false),
      });
      vi.spyOn(player, "getBoundingClientRect").mockReturnValue({
        bottom: 225,
        height: 225,
        left: 0,
        right: 400,
        top: 0,
        width: 400,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });
      Object.defineProperties(media!, {
        videoHeight: { configurable: true, value: 900 },
        videoWidth: { configurable: true, value: 1_600 },
      });

      fireEvent.pointerDown(centralPlay!, {
        clientX: 150,
        clientY: 110,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerDown(centralNext!, {
        clientX: 250,
        clientY: 110,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerMove(centralNext!, {
        clientX: 350,
        clientY: 110,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerUp(centralNext!, {
        clientX: 350,
        clientY: 110,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerUp(centralPlay!, {
        clientX: 150,
        clientY: 110,
        pointerId: 1,
        pointerType: "touch",
      });

      expect(media).toHaveAttribute("data-player-zoom-scale", "2.000");
      expect(onMinimize).not.toHaveBeenCalled();

      fireEvent.pointerDown(surface, {
        clientX: 200,
        clientY: 110,
        pointerId: 3,
        pointerType: "touch",
      });
      fireEvent.pointerUp(surface, {
        clientX: 200,
        clientY: 110,
        pointerId: 3,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(301));

      const playerActions = container.querySelector<HTMLElement>(
        '[data-player-control-cluster="player-actions"]',
      );
      const resetZoom = within(playerActions!).getByRole("button", {
        name: "Reset video zoom from 2× to 1×",
      });
      const autoplay = within(playerActions!).getByRole("switch", {
        name: "Autoplay next lesson",
      });
      expect(playerActions?.firstElementChild).toBe(resetZoom);
      expect(resetZoom.nextElementSibling).toBe(autoplay);
      expect(resetZoom).toHaveClass(
        "mr-0.5",
        "!size-[34px]",
        "text-[13px]",
        "leading-none",
      );
    } finally {
      vi.useRealTimers();
      window.matchMedia = originalMatchMedia;
    }
  });

  it("omits the theater control and disables its keyboard shortcut", () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onTheaterToggle = vi.fn();

    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        onTheaterToggle={onTheaterToggle}
      />,
    );

    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    expect(
      screen.queryByRole("button", { name: /theater mode/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Seek (?:backward|forward)/ }),
    ).not.toBeInTheDocument();

    fireEvent.focusIn(player);
    fireEvent.keyDown(window, { key: "t", code: "KeyT" });
    expect(onTheaterToggle).not.toHaveBeenCalled();
  });

  it("uses the saved interval for arrow seeking and disables J/L seeking", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    window.localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({ seekIntervalSeconds: 30 }),
    );

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    fireEvent.focusIn(player);
    fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    expect(engine.getSnapshot().currentTime).toBe(30);

    fireEvent.keyDown(window, { key: "l", code: "KeyL" });
    expect(engine.getSnapshot().currentTime).toBe(30);

    fireEvent.keyDown(window, { key: "ArrowLeft", code: "ArrowLeft" });
    expect(engine.getSnapshot().currentTime).toBe(0);
  });

  it("keeps the ambient projection behind the foreground player", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const { container } = render(
      <LessonVideoPlayer {...playerProps(firstMedia, engine)} />,
    );

    const shell = container.querySelector<HTMLElement>(".video-shell");
    const player = container.querySelector<HTMLElement>(".youtube-player");
    expect(shell).not.toBeNull();
    expect(player).not.toBeNull();
    expect(player).toHaveClass("!rounded-none");
    expect(player).not.toHaveClass("max-sm:overflow-visible");

    await waitFor(() => {
      const projection = container.querySelector<HTMLCanvasElement>(
        "[data-ambient-inline-projection]",
      );
      const overlayHost = container.querySelector(
        '[data-video-player-shell-overlay-host=""]',
      );
      expect(projection).not.toBeNull();
      expect(projection?.parentElement).toBe(overlayHost);
      expect(overlayHost?.parentElement).toBe(shell);
      expect(player?.contains(projection)).toBe(false);
      expect(projection).toHaveAttribute("aria-hidden", "true");
      expect(projection).not.toHaveClass("max-[820px]:transform-none!");
    });
  });

  it("maps lesson media into the package source contract and loads it", async () => {
    const engine = new RecordingFakeVideoEngine(90);

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]).toEqual({
      source: {
        id: "lesson-one.mp4",
        src: "/course-hls/lesson-one/master.m3u8",
        type: "application/x-mpegurl",
        kind: "hls",
        startTime: 0,
        metadata: {
          duration: 90,
          title: "Designing for real users",
        },
        streaming: { abrEnabled: true, bufferBehind: 600 },
        textTracks: [
          {
            src: "/assets/designing-users.vtt",
            language: "en",
            label: "English",
            kind: "captions",
            mimeType: "text/vtt",
          },
        ],
      },
      options: undefined,
    });
    expect(engine.getSnapshot().lifecycle).toBe("ready");
  });

  it("restores and persists the last selected playback speed", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    localStorage.setItem(lessonPlayerStorageKeys.playbackRate, "1.75");

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.getSnapshot().playbackRate).toBe(1.75));

    act(() => engine.setPlaybackRate(1.5));
    expect(localStorage.getItem(lessonPlayerStorageKeys.playbackRate)).toBe(
      "1.5",
    );
  });

  it("restores and persists the last selected volume", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    localStorage.setItem(lessonPlayerStorageKeys.volume, "0.4");

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.getSnapshot().volume).toBe(0.4));

    act(() => engine.setVolume(0.25));
    expect(localStorage.getItem(lessonPlayerStorageKeys.volume)).toBe("0.25");
  });

  it("groups transport controls and toggles the time pill to remaining time", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const { container } = render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        canGoNext
        canGoPrevious
      />,
    );
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    const player = screen.getByRole("region", {
      name: "Lesson video player for Designing for real users",
    });
    expect(player.style.getPropertyValue("--video-player-accent")).toBe(
      "var(--accent)",
    );

    const navigationCluster = container.querySelector<HTMLElement>(
      '[data-player-control-cluster="lesson-navigation"]',
    );
    expect(navigationCluster).not.toBeNull();
    expect(navigationCluster).toHaveClass(
      "h-10.5",
      "p-[3px]",
      "backdrop-blur-sm",
    );
    const previousButton = within(navigationCluster!).getByRole("button", {
      name: "Previous lesson",
    });
    const nextButton = within(navigationCluster!).getByRole("button", {
      name: "Next lesson",
    });
    expect(previousButton).toBeEnabled();
    expect(previousButton).toHaveAttribute("aria-keyshortcuts", "Shift+P");
    expect(previousButton).toHaveAttribute(
      "title",
      "Previous lesson (Shift+P)",
    );
    expect(nextButton).toBeEnabled();
    expect(nextButton).toHaveAttribute("aria-keyshortcuts", "Shift+N");
    expect(nextButton).toHaveAttribute("title", "Next lesson (Shift+N)");
    const volumeGroup = container.querySelector<HTMLElement>(
      ".player-volume-group",
    );
    expect(volumeGroup).not.toBeNull();
    expect(volumeGroup).toHaveClass(
      "relative",
      "isolate",
      "h-10.5",
      "!w-10.5",
      "p-1",
      "backdrop-blur-sm",
      "before:bg-transparent",
      "hover:!w-31.5",
      "hover:before:bg-(--video-player-control-surface-hover)",
      "focus-within:!w-31.5",
      "focus-within:before:bg-(--video-player-control-surface-hover)",
      "[&>*]:relative",
      "[&>*]:z-10",
    );
    expect(volumeGroup).not.toHaveClass(
      "hover:bg-(--video-player-control-surface-hover)",
      "focus-within:bg-(--video-player-control-surface-hover)",
    );
    expect(
      within(volumeGroup!).getByRole("slider", { name: "Volume" }),
    ).toHaveClass(
      "focus-visible:outline-(--video-player-control-text)",
      "player-volume-slider",
    );
    expect(
      within(volumeGroup!).getByRole("button", { name: "Mute" }),
    ).toHaveClass(
      "!size-8.5",
      "hover:!bg-(--video-player-control-surface-hover)",
      "active:!bg-(--video-player-control-surface-active)",
      "[&&&:hover]:!bg-transparent",
      "[&&&:active]:!bg-transparent",
      "[&&&:focus-visible]:!bg-transparent",
      "[&&&[aria-pressed=true]]:!bg-transparent",
    );

    const playerActions = container.querySelector<HTMLElement>(
      '[data-player-control-cluster="player-actions"]',
    );
    const topVignette = container.querySelector<HTMLElement>(
      '[data-mobile-player-vignette="top"]',
    );
    const bottomVignette = container.querySelector<HTMLElement>(
      '[data-mobile-player-vignette="bottom"]',
    );
    expect(topVignette).toHaveClass("top-0", "h-16", "sm:hidden");
    expect(topVignette?.className).toContain(
      "bg-[linear-gradient(180deg,color-mix(in_srgb,#05070b_50%,var(--accent)_4%)",
    );
    expect(bottomVignette).toHaveClass("bottom-0", "h-18", "sm:hidden");
    expect(bottomVignette?.className).toContain(
      "color-mix(in_srgb,#05070b_54%,var(--accent)_4%)_100%",
    );
    expect(playerActions).toHaveClass(
      "h-8",
      "gap-1",
      "p-0",
      "!bg-transparent",
      "!shadow-none",
      "before:bg-(--video-player-control-surface)",
      "before:shadow-(--video-player-control-shadow)",
      "before:backdrop-blur-sm",
      "max-sm:before:hidden",
      "[&>*]:relative",
      "[&>*]:z-10",
      "sm:h-10.5",
      "sm:p-[3px]",
    );
    expect(playerActions).not.toHaveClass("backdrop-blur-sm");
    expect(
      within(playerActions!).getByRole("switch", {
        name: "Autoplay next lesson",
      }),
    ).toHaveClass(
      "w-auto",
      "px-2",
      "max-sm:hover:!bg-transparent",
      "max-sm:active:!bg-white/14",
      "sm:px-3",
    );
    expect(
      within(playerActions!).getByRole("button", { name: "Settings" }),
    ).toHaveClass(
      "!h-8",
      "!w-auto",
      "!rounded-full",
      "!bg-transparent",
      "!px-2",
      "!shadow-none",
      "drop-shadow-none",
      "hover:!bg-transparent",
      "active:!bg-(--video-player-control-surface-active)",
      "focus-visible:outline-(--video-player-control-text)",
      "sm:!h-9",
      "sm:!bg-transparent",
      "sm:!px-3",
      "sm:hover:!bg-(--video-player-control-surface-hover)",
    );
    expect(
      within(playerActions!).getByRole("button", { name: "Settings" }),
    ).not.toHaveClass(
      "sm:!bg-[color-mix(in_srgb,var(--video-player-control-text)_4%,transparent)]",
    );
    expect(
      within(playerActions!).queryByRole("button", {
        name: "Toggle fullscreen",
      }),
    ).toBeNull();
    const circularFullscreen = container.querySelector(
      '[data-player-control-hit-area="fullscreen"] button',
    );
    expect(circularFullscreen).toHaveClass(
      "!size-11",
      "!rounded-full",
      "!bg-transparent",
      "!p-0",
      "group/fullscreen",
    );
    const timeline = screen.getByRole("slider", {
      name: "Video timeline",
    });
    expect(timeline.closest(".video-shell")).not.toBeNull();
    expect(timeline.closest("[data-video-player-root]")).toBeNull();
    expect(timeline.parentElement).toHaveClass(
      "pointer-events-none",
      "[&_[role=slider]]:pointer-events-auto",
      "max-sm:[&_[role=slider]]:h-7",
      "max-sm:[&_[data-timeline-buffered-range]]:rounded-none",
      "max-sm:[&_[data-timeline-progress]]:rounded-none",
      "max-sm:[&_[data-timeline-track]]:rounded-none",
      "max-sm:[&_[data-timeline-track]]:!h-0.5",
    );
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 28,
      height: 28,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.assign(timeline, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });
    fireEvent.pointerDown(timeline, {
      clientX: 0,
      pointerId: 9,
      pointerType: "touch",
    });
    expect(timeline.parentElement).toHaveClass(
      "max-sm:[&_[data-timeline-track]]:!h-0.75",
    );
    expect(timeline.parentElement).toHaveClass(
      "max-sm:[&_[data-video-player-preview]]:!bottom-3",
      "max-sm:[&_[data-video-player-preview]]:!mb-0",
    );
    expect(
      container.querySelector('[data-video-player-preview=""]'),
    ).toBeInTheDocument();
    expect(
      container.querySelector('[data-mobile-player-corner="time"]'),
    ).toHaveClass(
      "transition-opacity",
      "duration-150",
      "max-sm:pointer-events-none",
      "max-sm:opacity-0",
    );
    expect(
      container.querySelector('[data-mobile-player-corner="fullscreen"]'),
    ).toHaveClass(
      "transition-opacity",
      "duration-150",
      "max-sm:pointer-events-none",
      "max-sm:opacity-0",
    );
    fireEvent.pointerUp(timeline, {
      clientX: 0,
      pointerId: 9,
      pointerType: "touch",
    });
    expect(
      container.querySelector('[data-video-player-preview=""]'),
    ).not.toBeInTheDocument();
    expect(
      container.querySelector('[data-player-timeline-wrap=""]'),
    ).toHaveClass(
      "inset-x-0",
      "bottom-0",
      "translate-y-1/2",
      "z-80",
      "overflow-visible",
      "max-sm:z-170",
      "pointer-events-none",
      "sm:inset-x-3",
      "sm:bottom-14",
      "sm:translate-y-0",
    );
    expect(
      container.querySelector('[data-mobile-player-corner="time"]'),
    ).toHaveClass(
      "bottom-2.5",
      "left-2",
      "h-11",
      "items-center",
      "sm:h-auto",
      "max-sm:opacity-100",
    );
    const mobileFullscreenCorner = container.querySelector(
      '[data-mobile-player-corner="fullscreen"]',
    );
    expect(mobileFullscreenCorner).toHaveClass(
      "bottom-2.5",
      "right-2",
      "max-sm:opacity-100",
    );
    const mobileFullscreenHitArea = mobileFullscreenCorner?.querySelector(
      '[data-player-control-hit-area="fullscreen"]',
    );
    expect(mobileFullscreenHitArea).toHaveClass(
      "inline-flex",
      "size-11",
      "items-center",
      "justify-center",
    );
    expect(mobileFullscreenHitArea).not.toHaveAttribute(
      "data-player-control-cluster",
    );
    const mobileFullscreenButton = within(
      mobileFullscreenCorner as HTMLElement,
    ).getByRole("button", { name: "Toggle fullscreen" });
    expect(mobileFullscreenButton).toHaveClass(
      "!size-11",
      "!bg-transparent",
      "!p-0",
      "[&&&]:!bg-transparent",
      "[&&&:hover]:!bg-transparent",
      "[&&&:active]:!bg-transparent",
      "[&&&:focus-visible]:!bg-transparent",
      "[&&&[aria-pressed=true]]:!bg-transparent",
      "group/fullscreen",
    );
    const mobileFullscreenSurface = mobileFullscreenButton.querySelector(
      '[data-fullscreen-visual-surface=""]',
    );
    expect(mobileFullscreenSurface).toHaveClass(
      "size-8",
      "place-items-center",
      "relative",
      "z-10",
      "rounded-full",
      "bg-(--video-player-control-surface)",
      "shadow-(--video-player-control-shadow)",
      "backdrop-blur-sm",
      "group-hover/fullscreen:bg-(--video-player-control-surface-hover)",
      "group-active/fullscreen:bg-(--video-player-control-surface-active)",
      "group-focus-visible/fullscreen:bg-(--video-player-control-surface-hover)",
    );
    expect(mobileFullscreenSurface?.querySelector("svg")).toHaveAttribute(
      "width",
      "20",
    );
    const mobilePlayCluster = container.querySelector(
      '[data-player-control-cluster="mobile-play"]',
    );
    const mobilePreviousCluster = container.querySelector(
      '[data-player-control-cluster="mobile-previous"]',
    );
    const mobileNextCluster = container.querySelector(
      '[data-player-control-cluster="mobile-next"]',
    );
    expect(mobilePlayCluster).toHaveClass(
      "grid",
      "size-15.5",
      "place-items-center",
      "!border-0",
      "bg-(--video-player-control-surface)",
      "p-0",
      "shadow-(--video-player-control-shadow)",
      "backdrop-blur-none",
    );
    expect(mobilePreviousCluster).toHaveClass(
      "grid",
      "size-11.5",
      "place-items-center",
      "!border-0",
      "bg-(--video-player-control-surface)",
      "p-0",
      "shadow-(--video-player-control-shadow)",
      "backdrop-blur-none",
    );
    expect(mobileNextCluster).toHaveClass(
      "grid",
      "size-11.5",
      "place-items-center",
      "!border-0",
      "bg-(--video-player-control-surface)",
      "p-0",
      "shadow-(--video-player-control-shadow)",
      "backdrop-blur-none",
    );

    const mobilePlayButton = within(mobilePlayCluster as HTMLElement).getByRole(
      "button",
      { name: "Play" },
    );
    const mobilePreviousButton = within(
      mobilePreviousCluster as HTMLElement,
    ).getByRole("button", { name: "Previous lesson" });
    const mobileNextButton = within(mobileNextCluster as HTMLElement).getByRole(
      "button",
      { name: "Next lesson" },
    );
    for (const [button, sizeClass] of [
      [mobilePlayButton, "!size-15.5"],
      [mobilePreviousButton, "!size-11.5"],
      [mobileNextButton, "!size-11.5"],
    ] as const) {
      expect(button).toHaveClass(
        sizeClass,
        "p-0",
        "[&&&]:!bg-transparent",
        "[&&&:hover]:!bg-transparent",
        "[&&&:active]:!bg-transparent",
        "[&&&:focus-visible]:!bg-transparent",
      );
    }
    expect(mobilePlayButton.querySelector("svg")).toHaveAttribute(
      "width",
      "29",
    );
    expect(mobilePreviousButton.querySelector("svg")).toHaveAttribute(
      "width",
      "22",
    );
    expect(mobileNextButton.querySelector("svg")).toHaveAttribute(
      "width",
      "22",
    );
    for (const controlName of [
      "Play",
      "Previous lesson",
      "Next lesson",
      "Mute",
    ]) {
      for (const control of screen.getAllByRole("button", {
        name: controlName,
      })) {
        expect(control.className).not.toContain("active:scale");
      }
    }

    const timeButtons = screen.getAllByRole("button", {
      name: /0:00 elapsed of 1:30\. Show remaining time/,
    });
    expect(timeButtons).toHaveLength(2);
    const mobileTimeHitArea = document.querySelector<HTMLElement>(
      '[data-player-control-hit-area="time"]',
    );
    const desktopTimeCluster = document.querySelector<HTMLElement>(
      '[data-player-control-cluster="time"]',
    );

    const mobileTimeButton = within(mobileTimeHitArea!).getByRole("button");
    const desktopTimeButton = within(desktopTimeCluster!).getByRole("button");

    expect(mobileTimeHitArea).toHaveClass("h-11", "items-center");
    expect(mobileTimeButton).toHaveClass(
      "!h-11",
      "!px-4",
      "!py-0",
      "!text-xs",
      "!leading-4",
      "before:inset-x-0.5",
      "before:inset-y-1.5",
      "before:backdrop-blur-sm",
      "[&&&]:!bg-transparent",
      "[&&&:hover]:!bg-transparent",
      "[&&&:active]:!bg-transparent",
      "[&&&:focus-visible]:!bg-transparent",
      "[&&&[aria-pressed=true]]:!bg-transparent",
    );
    expect(mobilePreviousCluster).not.toHaveClass("backdrop-blur-sm");
    expect(mobileNextCluster).not.toHaveClass("backdrop-blur-sm");
    expect(desktopTimeCluster).toHaveClass(
      "h-9.5",
      "p-[3px]",
      "backdrop-blur-sm",
    );
    expect(desktopTimeButton).toHaveClass("!h-8", "!px-3.5", "!text-sm");

    fireEvent.click(mobileTimeButton);

    expect(mobileTimeButton).toHaveAttribute("aria-pressed", "true");
    expect(mobileTimeButton).toHaveTextContent("-1:30 / 1:30");
    expect(mobileTimeButton).toHaveAccessibleName(
      "1:30 remaining of 1:30. Show elapsed time",
    );
  });

  it("keeps the mobile control layout and settings sheet in phone landscape", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onCourseLessonsToggle = vi.fn();
    const onMobileLandscapeFullscreenChange = vi.fn();
    const fullscreenMinimizeSequence: string[] = [];
    const onMinimize = vi.fn(() => {
      fullscreenMinimizeSequence.push("minimize");
    });
    const originalMatchMedia = window.matchMedia;
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    const originalExitFullscreen = Object.getOwnPropertyDescriptor(
      document,
      "exitFullscreen",
    );
    const widthListeners = new Set<EventListenerOrEventListenerObject>();
    let narrowViewport = true;
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const exitFullscreen = vi.fn(async () => {
      fullscreenMinimizeSequence.push("exit-fullscreen");
      fullscreenElement = null;
      document.dispatchEvent(new Event("fullscreenchange"));
    });
    Object.defineProperty(document, "exitFullscreen", {
      configurable: true,
      value: exitFullscreen,
    });
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches:
        (query === "(max-width: 640px)" && narrowViewport) ||
        query === "(max-height: 40rem)" ||
        query === "(pointer: coarse)" ||
        query === "(orientation: landscape)",
      media: query,
      onchange: null,
      addEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        if (type === "change" && query === "(max-width: 640px)") {
          widthListeners.add(listener);
        }
      },
      removeEventListener(
        type: string,
        listener: EventListenerOrEventListenerObject,
      ) {
        if (type === "change" && query === "(max-width: 640px)") {
          widthListeners.delete(listener);
        }
      },
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    })) as typeof window.matchMedia;

    try {
      const { container, rerender } = render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          canGoNext
          canGoPrevious
          courseLessonsPanel={
            <aside data-testid="fullscreen-course-panel">Course lessons</aside>
          }
          courseLessonsVideoWidthPercent={60}
          onCourseLessonsToggle={onCourseLessonsToggle}
          onMinimize={onMinimize}
          onMobileLandscapeFullscreenChange={onMobileLandscapeFullscreenChange}
        />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      expect(player).toHaveAttribute("data-player-mobile-interaction", "true");
      expect(player).toHaveAttribute(
        "data-player-zoom-overflow-boundary",
        "player",
      );
      const mediaElement = container.querySelector("video");
      expect(
        container.querySelector('[data-lesson-central-controls=""]'),
      ).toHaveClass("sm:!grid");
      expect(
        container.querySelector('[data-mobile-player-vignette="top"]'),
      ).toHaveClass("sm:!block");
      expect(
        container.querySelector('[data-mobile-volume-control=""]'),
      ).toHaveClass("sm:!inline-flex");
      expect(
        container.querySelector('[data-mobile-player-corner="fullscreen"]'),
      ).toHaveClass("sm:!block");
      expect(
        container.querySelector(
          '[data-player-control-cluster="player-actions"]',
        ),
      ).toHaveClass("!bg-transparent", "!shadow-none", "sm:before:hidden");

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      expect(
        document.querySelector('[data-video-player-mobile-sheet=""]'),
      ).toBeInTheDocument();
      expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
      expect(screen.getByRole("dialog").parentElement).toBe(document.body);
      const phoneSheetBackdrop = document.querySelector(
        '[data-video-player-mobile-sheet-backdrop=""]',
      )!;
      fireEvent.pointerDown(phoneSheetBackdrop);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      fireEvent.click(phoneSheetBackdrop);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      const shell = container.querySelector<HTMLElement>(".video-shell");
      fullscreenElement = shell;
      act(() => document.dispatchEvent(new Event("fullscreenchange")));
      act(() => {
        narrowViewport = false;
        const event = new Event("change");
        for (const listener of widthListeners) {
          if (typeof listener === "function") listener(event);
          else listener.handleEvent(event);
        }
      });
      expect(player).toHaveAttribute("data-player-mobile-interaction", "true");
      await waitFor(() =>
        expect(player).toHaveAttribute(
          "data-player-zoom-overflow-boundary",
          "shell",
        ),
      );

      const fullscreenAmbientProjection = await waitFor(() => {
        const projection = shell?.querySelector<HTMLCanvasElement>(
          "[data-ambient-shell-projection]",
        );
        expect(projection).toBeInTheDocument();
        return projection!;
      });
      expect(fullscreenAmbientProjection.parentElement).toBe(
        shell?.querySelector('[data-video-player-shell-overlay-host=""]'),
      );
      expect(fullscreenAmbientProjection).toHaveAttribute(
        "data-ambient-projection-scope",
        "fullscreen",
      );
      expect(fullscreenAmbientProjection).toHaveClass(
        "ambient-canvas--fullscreen-shell",
      );

      const controlFrame = await waitFor(() => {
        const frame = container.querySelector<HTMLElement>(
          '[data-player-control-frame=""]',
        );
        expect(frame).toHaveAttribute(
          "data-player-mobile-fullscreen-frame",
          "true",
        );
        return frame!;
      });
      expect(controlFrame).toHaveClass(
        "left-1/2",
        "-translate-x-1/2",
        "w-[min(100%,calc(100dvh*16/9))]",
      );
      const fullscreenVignetteLayer = await waitFor(() => {
        const layer = shell?.querySelector<HTMLElement>(
          '[data-mobile-player-fullscreen-vignette-layer=""]',
        );
        expect(layer).toBeInTheDocument();
        return layer!;
      });
      expect(fullscreenVignetteLayer.parentElement).toBe(shell);
      expect(fullscreenVignetteLayer).toHaveClass(
        "pointer-events-none",
        "absolute",
        "inset-y-0",
        "left-0",
        "right-0",
        "z-20",
      );
      expect(
        controlFrame.querySelector('[data-mobile-player-vignette="top"]'),
      ).not.toBeInTheDocument();
      expect(
        fullscreenVignetteLayer.querySelector(
          '[data-mobile-player-vignette="top"]',
        ),
      ).toHaveClass("inset-x-0", "top-0");
      expect(
        fullscreenVignetteLayer.querySelector(
          '[data-mobile-player-vignette="bottom"]',
        ),
      ).toHaveClass("inset-x-0", "bottom-0");
      const settingsSheetHost = await waitFor(() => {
        const host = container.querySelector<HTMLDivElement>(
          '[data-learning-mobile-settings-sheet-host=""]',
        );
        expect(host).toBeInTheDocument();
        return host!;
      });
      expect(settingsSheetHost.parentElement).toBe(shell);
      expect(settingsSheetHost).toHaveClass(
        "absolute",
        "inset-0",
        "z-200",
        "overflow-hidden",
      );
      expect(settingsSheetHost).not.toBe(controlFrame);

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      const landscapeSettingsSheet = screen.getByRole("dialog", {
        name: "Video settings",
      });
      expect(landscapeSettingsSheet.parentElement).toBe(settingsSheetHost);
      expect(landscapeSettingsSheet).toHaveClass(
        "absolute",
        "bottom-0",
        "rounded-t-2xl",
        "[&&]:!rounded-b-none",
        "w-full",
        "mx-auto",
        "max-w-[100dvh]",
      );
      expect(
        settingsSheetHost.querySelector(
          '[data-video-player-mobile-sheet-backdrop=""]',
        ),
      ).toHaveClass("absolute");
      fireEvent.click(
        settingsSheetHost.querySelector(
          '[data-video-player-mobile-sheet-backdrop=""]',
        )!,
      );
      expect(
        container.querySelector('[data-player-timeline-wrap=""]'),
      ).toHaveClass(
        "!left-1/2",
        "!right-auto",
        "!bottom-0",
        "!w-[min(100%,calc(100dvh*16/9))]",
        "!-translate-x-1/2",
        "!translate-y-1/2",
        "!px-3",
        "sm:!left-1/2",
        "sm:!right-auto",
        "sm:!bottom-12",
        "sm:!w-[min(100%,calc(100dvh*16/9))]",
        "sm:!-translate-x-1/2",
        "sm:!translate-y-0",
        "sm:!px-3",
      );
      expect(
        container.querySelector(
          '[data-player-bottom-corner-controls-layer=""]',
        ),
      ).toHaveClass(
        "inset-y-0",
        "left-1/2",
        "right-auto",
        "w-[min(100%,calc(100dvh*16/9))]",
        "max-w-full",
        "-translate-x-1/2",
      );
      expect(
        container.querySelector('[data-mobile-player-corner="time"]'),
      ).toHaveClass("!bottom-15", "!left-3", "sm:!bottom-15", "sm:!left-3");
      expect(
        container.querySelector('[data-mobile-player-corner="fullscreen"]'),
      ).toHaveClass("!bottom-15", "!right-3", "sm:!bottom-15", "sm:!right-3");
      expect(
        screen.getByRole("button", {
          name: "Minimize",
        }).parentElement,
      ).toHaveClass("!left-3", "sm:!left-3");
      expect(
        container.querySelector(
          '[data-player-control-cluster="player-actions"]',
        )?.parentElement,
      ).toHaveClass("!right-3", "sm:!right-3");

      const lessonsButton = screen.getByRole("button", {
        name: "Open lessons",
      });
      expect(lessonsButton).toHaveAttribute(
        "aria-controls",
        "learning-fullscreen-course-curriculum-scrollport",
      );
      expect(lessonsButton).toHaveAttribute(
        "data-course-lessons-presentation",
        "side",
      );
      await waitFor(() =>
        expect(onMobileLandscapeFullscreenChange).toHaveBeenLastCalledWith(
          true,
        ),
      );

      fireEvent.click(lessonsButton);
      expect(onCourseLessonsToggle).toHaveBeenCalledWith("side");

      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          canGoNext
          canGoPrevious
          courseLessonsOpen
          courseLessonsPanel={
            <aside data-testid="fullscreen-course-panel">Course lessons</aside>
          }
          courseLessonsVideoWidthPercent={60}
          onCourseLessonsToggle={onCourseLessonsToggle}
          onMinimize={onMinimize}
          onMobileLandscapeFullscreenChange={onMobileLandscapeFullscreenChange}
        />,
      );

      await waitFor(() =>
        expect(
          screen.getByTestId("fullscreen-course-panel"),
        ).toBeInTheDocument(),
      );
      expect(shell).toHaveClass(
        "flex",
        "h-full",
        "items-center",
        "overflow-hidden",
      );
      expect(
        shell?.style.getPropertyValue("--learning-fullscreen-video-pane-width"),
      ).toBe("60dvw");
      expect(
        shell?.style.getPropertyValue("--learning-fullscreen-video-width"),
      ).toBe(
        "min(var(--learning-fullscreen-video-pane-width), calc(100dvh * 16 / 9))",
      );
      expect(
        shell?.style.getPropertyValue("--learning-fullscreen-panel-offset-x"),
      ).toBe(
        "max(0px, calc(var(--learning-fullscreen-video-pane-width) - var(--learning-fullscreen-video-width)))",
      );
      expect(
        shell?.style.getPropertyValue("--learning-fullscreen-video-offset-x"),
      ).toBe("calc(var(--learning-fullscreen-panel-offset-x) / 2)");
      expect(player).toHaveClass(
        "!w-(--learning-fullscreen-video-width)",
        "!max-w-none",
        "!max-h-full",
        "!translate-x-(--learning-fullscreen-video-offset-x)",
      );
      expect(controlFrame.closest("[data-video-player-root]")).toBe(player);
      expect(controlFrame).toHaveClass("absolute", "inset-0");
      expect(controlFrame).not.toHaveClass(
        "left-1/2",
        "w-(--learning-fullscreen-video-width)",
      );
      expect(fullscreenVignetteLayer).toHaveClass(
        "left-(--learning-fullscreen-video-offset-x)",
        "w-(--learning-fullscreen-video-width)",
      );
      expect(fullscreenVignetteLayer).not.toHaveClass("right-0");
      expect(
        container.querySelector(
          '[data-player-control-cluster="player-actions"]',
        )?.parentElement,
      ).toHaveClass(
        "right-2",
        "top-2",
        "!left-auto",
        "!right-3",
        "sm:!left-auto",
        "sm:!right-3",
      );
      expect(
        container.querySelector('[data-player-timeline-wrap=""]'),
      ).toHaveClass(
        "!left-(--learning-fullscreen-video-offset-x)",
        "!w-(--learning-fullscreen-video-width)",
        "!translate-x-0",
      );
      const fullscreenBottomControls = container.querySelector<HTMLElement>(
        '[data-player-fullscreen-bottom-controls=""]',
      );
      expect(fullscreenBottomControls).toHaveClass(
        "bottom-15",
        "left-(--learning-fullscreen-video-offset-x)",
        "h-11",
        "w-(--learning-fullscreen-video-width)",
        "justify-between",
        "px-3",
      );
      const fullscreenTimeCorner = container.querySelector<HTMLElement>(
        '[data-mobile-player-corner="time"]',
      );
      const fullscreenActionCorner = container.querySelector<HTMLElement>(
        '[data-mobile-player-corner="fullscreen"]',
      );
      expect(fullscreenTimeCorner?.parentElement).toBe(
        fullscreenBottomControls,
      );
      expect(fullscreenActionCorner?.parentElement).toBe(
        fullscreenBottomControls,
      );
      expect(fullscreenTimeCorner).toHaveClass("!static", "sm:!static");
      expect(fullscreenActionCorner).toHaveClass("!static", "sm:!static");

      const closeLessonsButton = screen.getByRole("button", {
        name: "Close lessons",
      });
      expect(closeLessonsButton).toHaveAttribute(
        "data-course-lessons-open",
        "true",
      );
      expect(closeLessonsButton).not.toHaveClass(
        "before:!bg-[color-mix(in_srgb,var(--video-player-control-text)_18%,var(--video-player-control-surface))]",
      );
      expect(closeLessonsButton).toHaveClass(
        "before:bg-(--video-player-control-surface)",
        "hover:before:bg-(--video-player-control-surface-hover)",
      );
      expect(
        closeLessonsButton.querySelector(".learning-curriculum__section-arrow"),
      ).not.toHaveClass("is-open");

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));
      const splitViewSettingsSheet = screen.getByRole("dialog", {
        name: "Video settings",
      });
      expect(splitViewSettingsSheet.parentElement).toBe(settingsSheetHost);
      expect(splitViewSettingsSheet).toHaveClass(
        "bottom-0",
        "rounded-t-2xl",
        "[&&]:!rounded-b-none",
        "!inset-x-auto",
        "!right-auto",
        "!left-[calc(var(--learning-fullscreen-video-offset-x)+var(--learning-fullscreen-video-width)/2)]",
        "!w-[min(100dvh,var(--learning-fullscreen-video-width))]",
        "!-translate-x-1/2",
      );
      fireEvent.click(
        settingsSheetHost.querySelector(
          '[data-video-player-mobile-sheet-backdrop=""]',
        )!,
      );
      fireEvent.click(
        screen.getByRole("button", {
          name: "Minimize",
        }),
      );
      await waitFor(() => expect(exitFullscreen).toHaveBeenCalledOnce());
      await waitFor(() => expect(onMinimize).toHaveBeenCalledOnce());
      expect(fullscreenMinimizeSequence).toEqual([
        "exit-fullscreen",
        "minimize",
      ]);
      expect(container.querySelector("video")).toBe(mediaElement);
      expect(engine.loadCalls).toHaveLength(1);
    } finally {
      window.matchMedia = originalMatchMedia;
      if (originalFullscreenElement) {
        Object.defineProperty(
          document,
          "fullscreenElement",
          originalFullscreenElement,
        );
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }
      if (originalExitFullscreen) {
        Object.defineProperty(
          document,
          "exitFullscreen",
          originalExitFullscreen,
        );
      } else {
        Reflect.deleteProperty(document, "exitFullscreen");
      }
    }
  });

  it("navigates lessons with Shift+N and Shift+P outside editing controls", () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onGoNext = vi.fn();
    const onGoPrevious = vi.fn();

    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        canGoNext
        canGoPrevious
        onGoNext={onGoNext}
        onGoPrevious={onGoPrevious}
      />,
    );

    fireEvent.keyDown(window, { key: "N", code: "KeyN", shiftKey: true });
    fireEvent.keyDown(window, { key: "P", code: "KeyP", shiftKey: true });
    expect(onGoNext).toHaveBeenCalledOnce();
    expect(onGoPrevious).toHaveBeenCalledOnce();

    fireEvent.keyDown(window, { key: "n", code: "KeyN" });
    fireEvent.keyDown(window, { key: "p", code: "KeyP" });
    expect(onGoNext).toHaveBeenCalledOnce();
    expect(onGoPrevious).toHaveBeenCalledOnce();

    const input = document.createElement("input");
    document.body.append(input);
    fireEvent.keyDown(input, { key: "N", code: "KeyN", shiftKey: true });
    expect(onGoNext).toHaveBeenCalledOnce();
    input.remove();
  });

  it("restores against the actual media duration and reports progress on load", async () => {
    const engine = new RecordingFakeVideoEngine(200);
    const onProgressChange = vi.fn();
    window.localStorage.setItem(
      lessonPlayerStorageKeys.resume(firstMedia.fileName),
      "50",
    );

    render(
      <LessonVideoPlayer
        {...playerProps({ ...firstMedia, duration: 10 }, engine)}
        onProgressChange={onProgressChange}
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]?.source.startTime).toBe(50);
    expect(engine.getSnapshot().currentTime).toBe(50);
    await waitFor(() => expect(onProgressChange).toHaveBeenCalledWith(25));
  });

  it("starts at 0:00 when the persisted start-from-beginning setting is enabled", async () => {
    const engine = new RecordingFakeVideoEngine(200);
    window.localStorage.setItem(
      lessonPlayerStorageKeys.resume(firstMedia.fileName),
      "50",
    );
    window.localStorage.setItem(
      LEARNING_PREFERENCES_KEY,
      JSON.stringify({ resumeFromLastPosition: false }),
    );

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]?.source.startTime).toBe(0);
    expect(engine.getSnapshot().currentTime).toBe(0);
    expect(
      window.localStorage.getItem(
        lessonPlayerStorageKeys.resume(firstMedia.fileName),
      ),
    ).toBe("50");
  });

  it("keeps the mini player live until restored playback is unbuffered and playing", async () => {
    const engine = new RecordingFakeVideoEngine(200);
    const setMuted = vi.spyOn(engine, "setMuted");
    const setVolume = vi.spyOn(engine, "setVolume");
    const preparePlaybackHandoff = vi.fn();
    const onMiniPlayerRestoreReady = vi.fn();
    const playback = {
      currentTime: 57,
      muted: false,
      playbackRate: 1.5,
      playing: true,
      volume: 0.65,
    };
    writeMiniPlayerRestore(firstMedia.fileName, true);
    const unregisterRuntime = registerLearningMiniPlayerRuntime({
      getPlaybackSnapshot: () => playback,
      mediaKey: firstMedia.fileName,
      preparePlaybackHandoff,
    });

    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        onMiniPlayerRestoreReady={onMiniPlayerRestoreReady}
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    await waitFor(() =>
      expect(onMiniPlayerRestoreReady).toHaveBeenCalledOnce(),
    );
    expect(engine.getSnapshot()).toMatchObject({
      buffering: false,
      currentTime: 57,
      playing: true,
    });
    expect(setVolume).toHaveBeenLastCalledWith(0.65);
    expect(setMuted).toHaveBeenLastCalledWith(false);
    expect(preparePlaybackHandoff).toHaveBeenCalledOnce();
    expect(setMuted.mock.invocationCallOrder.at(-1)).toBeLessThan(
      preparePlaybackHandoff.mock.invocationCallOrder[0]!,
    );

    unregisterRuntime();
  });

  it("restores an enabled caption preference after changing lessons", async () => {
    const engine = new RecordingFakeVideoEngine(180);
    engine.setSnapshot({ textTracks: [englishCaptions] });
    const engineFactory = vi.fn(() => engine);
    const props = {
      ...playerProps(firstMedia, engine),
      engineFactory,
    };
    const { container, rerender } = render(<LessonVideoPlayer {...props} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    const fullscreenShell = container.querySelector(".video-shell");

    act(() => engine.selectTextTrack(englishCaptions.id));
    expect(engine.selectedTextTrackIds).toEqual([englishCaptions.id]);

    rerender(
      <LessonVideoPlayer
        {...props}
        media={secondMedia}
        lessonTitle="The design mindset"
      />,
    );

    await waitFor(() => expect(engine.loadCalls).toHaveLength(2));
    await waitFor(() =>
      expect(engine.selectedTextTrackIds).toEqual([
        englishCaptions.id,
        englishCaptions.id,
      ]),
    );
    expect(engineFactory).toHaveBeenCalledTimes(1);
    expect(container.querySelector(".video-shell")).toBe(fullscreenShell);
    expect(engine.getSnapshot().lifecycle).not.toBe("destroyed");
    expect(engine.loadCalls[1]?.source).toMatchObject({
      id: "lesson-two.mp4",
      src: "/course-hls/lesson-two/master.m3u8",
      metadata: { title: "The design mindset" },
    });
  });
});
