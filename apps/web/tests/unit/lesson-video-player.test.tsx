import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
import { lessonPlayerStorageKeys } from "../../src/learning/player/lessonPlayerPersistence.js";
import { LEARNING_PREFERENCES_KEY } from "../../src/settings/settingsPreferences.js";

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
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

const firstMedia: CourseVideo = {
  fileName: "lesson-one.mp4",
  duration: 90,
  src: "/course-videos/lesson-one.mp4",
};

const secondMedia: CourseVideo = {
  fileName: "lesson-two.mp4",
  duration: 150,
  src: "/course-videos/lesson-two.mp4",
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
      "#f8fafc",
    );
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
      name: "Show or hide video controls",
    });
    const controls = document.querySelector<HTMLElement>(
      '[data-lesson-player-controls=""]',
    );
    const centralControls = document.querySelector<HTMLElement>(
      '[data-lesson-central-controls=""]',
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

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "false");
    expect(controls).toHaveAttribute("inert");
    expect(centralControls).toHaveAttribute("inert");
    expect(play).not.toHaveBeenCalled();

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(play).not.toHaveBeenCalled();
  });

  it("fills the caption badge when captions are enabled", async () => {
    const engine = new RecordingFakeVideoEngine(90);
    engine.setSnapshot({ textTracks: [englishCaptions] });

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);
    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));

    const captionsButton = screen.getByRole("button", {
      name: "Turn captions on",
    });
    expect(captionsButton).toHaveAttribute("aria-pressed", "false");
    expect(
      captionsButton.querySelector('[data-caption-icon-state="outline"]'),
    ).toHaveClass("max-sm:size-5.5");

    fireEvent.click(captionsButton);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Turn captions off" }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
    expect(
      screen
        .getByRole("button", { name: "Turn captions off" })
        .querySelector('[data-caption-icon-state="filled"]'),
    ).not.toBeNull();
  });

  it("keeps autoplay in the player and ambient mode inside settings", () => {
    const engine = new RecordingFakeVideoEngine(90);
    const onAutoplayEnabledChange = vi.fn();

    render(
      <LessonVideoPlayer
        {...playerProps(firstMedia, engine)}
        autoplayEnabled
        onAutoplayEnabledChange={onAutoplayEnabledChange}
      />,
    );

    const autoplaySwitch = screen.getByRole("switch", {
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
    expect(autoplayTrack).toHaveClass("h-3.5", "w-8", "sm:h-4", "sm:w-9");
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
    const initialAmbientState = ambientSetting.getAttribute("aria-checked");
    expect(ambientToggle).toHaveAttribute(
      "data-player-menu-toggle-state",
      initialAmbientState === "true" ? "on" : "off",
    );
    fireEvent.click(ambientSetting);
    expect(ambientSetting).toHaveAttribute(
      "aria-checked",
      initialAmbientState === "true" ? "false" : "true",
    );
    expect(
      ambientSetting.querySelector("[data-ambient-mode-icon]"),
    ).not.toBeNull();
    expect(ambientSetting).not.toHaveTextContent(/\b(?:On|Off)\b/);
  });

  it("minimizes from a downward touch swipe on phones", async () => {
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
      render(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
        />,
      );
      await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
      expect(
        screen.getByRole("button", { name: "Minimize video" }),
      ).toHaveClass("!size-9", "!bg-transparent");
      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = player.parentElement!;
      Object.defineProperties(shell, {
        hasPointerCapture: { value: () => true },
        releasePointerCapture: { value: vi.fn() },
        setPointerCapture: { value: vi.fn() },
      });

      fireEvent.pointerDown(shell, {
        clientX: 180,
        clientY: 30,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.pointerMove(shell, {
        clientX: 184,
        clientY: 132,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.pointerUp(shell, {
        clientX: 184,
        clientY: 132,
        pointerId: 7,
        pointerType: "touch",
      });

      expect(onMinimize).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonTitle: "Designing for real users",
          mediaKey: "lesson-one.mp4",
          source: expect.objectContaining({
            src: "/course-videos/lesson-one.mp4",
          }),
        }),
      );
    } finally {
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
    expect(player).toHaveClass("max-sm:overflow-visible");

    await waitFor(() => {
      const projection = container.querySelector<HTMLCanvasElement>(
        "[data-ambient-inline-projection]",
      );
      expect(projection).not.toBeNull();
      expect(projection?.parentElement).toBe(shell);
      expect(player?.contains(projection)).toBe(false);
      expect(projection).toHaveAttribute("aria-hidden", "true");
    });
  });

  it("maps lesson media into the package source contract and loads it", async () => {
    const engine = new RecordingFakeVideoEngine(90);

    render(<LessonVideoPlayer {...playerProps(firstMedia, engine)} />);

    await waitFor(() => expect(engine.loadCalls).toHaveLength(1));
    expect(engine.loadCalls[0]).toEqual({
      source: {
        id: "lesson-one.mp4",
        src: "/course-videos/lesson-one.mp4",
        type: "video/mp4",
        kind: "file",
        startTime: 0,
        metadata: {
          duration: 90,
          title: "Designing for real users",
        },
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
    expect(
      player.parentElement?.style.getPropertyValue("--video-player-accent"),
    ).toBe("var(--accent)");

    const navigationCluster = container.querySelector<HTMLElement>(
      '[data-player-control-cluster="lesson-navigation"]',
    );
    expect(navigationCluster).not.toBeNull();
    expect(navigationCluster).toHaveClass("h-10.5", "p-[3px]");
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
      "h-10.5",
      "!w-11",
      "p-[3px]",
      "hover:!w-32",
      "focus-within:!w-32",
    );
    expect(volumeGroup?.className).toContain(
      "hover:bg-(--video-player-control-surface-hover)",
    );
    expect(
      within(volumeGroup!).getByRole("slider", { name: "Volume" }),
    ).toHaveClass("focus-visible:outline-(--video-player-control-text)");
    expect(
      within(volumeGroup!).getByRole("button", { name: "Mute" }),
    ).toHaveClass("hover:!bg-transparent");

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
      "max-sm:!bg-transparent",
      "max-sm:!shadow-none",
      "sm:h-10.5",
      "sm:p-[3px]",
    );
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
    for (const controlName of [
      "Turn captions on",
      "Settings",
      "Toggle fullscreen",
    ]) {
      expect(
        within(playerActions!).getByRole("button", { name: controlName }),
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
        "sm:!bg-[color-mix(in_srgb,var(--video-player-control-text)_6%,transparent)]",
        "sm:!px-3",
        "sm:hover:!bg-(--video-player-control-surface-hover)",
      );
    }
    const timeline = screen.getByRole("slider", {
      name: "Video timeline",
    });
    expect(timeline.parentElement).toHaveClass(
      "max-sm:[&_[data-timeline-buffered-range]]:rounded-none",
      "max-sm:[&_[data-timeline-progress]]:rounded-none",
      "max-sm:[&_[data-timeline-thumb]]:top-[calc(100%-1px)]",
      "max-sm:[&_[data-timeline-track]]:bottom-0",
      "max-sm:[&_[data-timeline-track]]:translate-y-0",
      "max-sm:[&_[data-timeline-track]]:!h-0.5",
      "max-sm:[&_[data-timeline-track]]:rounded-none",
    );
    vi.spyOn(timeline, "getBoundingClientRect").mockReturnValue({
      bottom: 20,
      height: 20,
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
      "max-sm:[&_[data-timeline-thumb]]:top-[calc(100%-1.5px)]",
      "max-sm:[&_[data-timeline-track]]:!h-0.75",
    );
    fireEvent.pointerUp(timeline, {
      clientX: 0,
      pointerId: 9,
      pointerType: "touch",
    });
    expect(
      container.querySelector('[data-player-timeline-wrap=""]'),
    ).toHaveClass(
      "inset-x-0",
      "bottom-0",
      "z-50",
      "sm:inset-x-3",
      "sm:bottom-13",
    );
    expect(
      container.querySelector('[data-mobile-player-corner="time"]'),
    ).toHaveClass("bottom-2.5", "left-2");
    expect(
      container.querySelector('[data-mobile-player-corner="fullscreen"]'),
    ).toHaveClass("bottom-2.5", "right-2");
    expect(
      container.querySelector('[data-player-control-cluster="mobile-play"]'),
    ).toHaveClass("size-14", "p-0.5");
    expect(
      container.querySelector(
        '[data-player-control-cluster="mobile-previous"]',
      ),
    ).toHaveClass("size-10.5", "p-0.5");
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
      name: /00:00 elapsed of 01:30\. Show remaining time/,
    });
    expect(timeButtons).toHaveLength(2);
    fireEvent.click(timeButtons[0]!);

    expect(timeButtons[0]).toHaveAttribute("aria-pressed", "true");
    expect(timeButtons[0]).toHaveTextContent("-01:30 / 01:30");
    expect(timeButtons[0]).toHaveAccessibleName(
      "01:30 remaining of 01:30. Show elapsed time",
    );
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

  it("restores an enabled caption preference after changing lessons", async () => {
    const firstEngine = new RecordingFakeVideoEngine(180);
    const secondEngine = new RecordingFakeVideoEngine(180);
    firstEngine.setSnapshot({ textTracks: [englishCaptions] });
    secondEngine.setSnapshot({ textTracks: [englishCaptions] });
    const engines = [firstEngine, secondEngine];
    const engineFactory = vi.fn(() => engines.shift()!);
    const props = {
      ...playerProps(firstMedia, firstEngine),
      engineFactory,
    };
    const { rerender } = render(<LessonVideoPlayer {...props} />);
    await waitFor(() => expect(firstEngine.loadCalls).toHaveLength(1));

    act(() => firstEngine.selectTextTrack(englishCaptions.id));
    expect(firstEngine.selectedTextTrackIds).toEqual([englishCaptions.id]);

    rerender(
      <LessonVideoPlayer
        {...props}
        media={secondMedia}
        lessonTitle="The design mindset"
      />,
    );

    await waitFor(() => expect(secondEngine.loadCalls).toHaveLength(1));
    await waitFor(() =>
      expect(secondEngine.selectedTextTrackIds).toEqual([englishCaptions.id]),
    );
    await waitFor(() =>
      expect(firstEngine.getSnapshot().lifecycle).toBe("destroyed"),
    );
    expect(engineFactory).toHaveBeenCalledTimes(2);
    expect(secondEngine.loadCalls[0]?.source).toMatchObject({
      id: "lesson-two.mp4",
      src: "/course-videos/lesson-two.mp4",
      metadata: { title: "The design mindset" },
    });
  });
});
