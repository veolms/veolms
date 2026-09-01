import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
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
  src: "/course-hls/lesson-one/master.m3u8",
};

const secondMedia: CourseVideo = {
  fileName: "lesson-two.mp4",
  duration: 150,
  src: "/course-hls/lesson-two/master.m3u8",
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
      const autoplaySwitch = screen.getByRole("switch", {
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
      const surface = openButton.closest(
        '[data-player-control-cluster="course-lessons"]',
      );
      expect(openButton).toHaveAttribute("aria-expanded", "false");
      expect(openButton).toHaveAttribute(
        "aria-controls",
        "lesson-drawer-curriculum-scrollport",
      );
      expect(surface).toHaveClass(
        "rounded-full",
        "bg-(--video-player-control-surface)",
      );
      expect(openButton).toHaveClass("!text-[13px]");
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
          onCourseLessonsToggle={onCourseLessonsToggle}
        />,
      );
      expect(
        screen.getByRole("button", { name: "Open lessons" }),
      ).toContainElement(arrow);
      expect(arrow).not.toHaveClass("is-open");
    },
  );

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
    expect(controls).not.toHaveClass("[&_*]:!pointer-events-none");
    expect(centralControls).not.toHaveClass("[&_*]:!pointer-events-none");

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "false");
    expect(controls).toHaveAttribute("inert");
    expect(centralControls).toHaveAttribute("inert");
    expect(controls).toHaveClass("[&_*]:!pointer-events-none");
    expect(centralControls).toHaveClass("[&_*]:!pointer-events-none");
    expect(play).not.toHaveBeenCalled();

    tapEmptySpace();
    expect(player).toHaveAttribute("data-controls-visible", "true");
    expect(controls).not.toHaveAttribute("inert");
    expect(centralControls).not.toHaveAttribute("inert");
    expect(controls).not.toHaveClass("[&_*]:!pointer-events-none");
    expect(centralControls).not.toHaveClass("[&_*]:!pointer-events-none");
    expect(play).not.toHaveBeenCalled();
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
        screen.getByRole("button", { name: "Minimize video" }),
      ).toHaveClass("!size-9", "!bg-transparent");
      const player = screen.getByRole("region", {
        name: "Lesson video player for Designing for real users",
      });
      const shell = player.parentElement!;
      const centralPlay = container.querySelector<HTMLElement>(
        '[data-player-control-cluster="mobile-play"] [data-player-control]',
      );
      expect(centralPlay).not.toBeNull();
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
      const forwardTransform = shell.style.transform;
      expect(forwardTransform).toMatch(/translate3d\(.+px, .+px, 0\) scale\(/);
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

      expect(shell.style.transform).toContain("scale(0.8200)");
      expect(onMinimize).not.toHaveBeenCalled();
      act(() => vi.advanceTimersByTime(180));
      expect(onMinimize).toHaveBeenCalledWith(
        expect.objectContaining({
          lessonTitle: "Designing for real users",
          mediaKey: "lesson-one.mp4",
          source: expect.objectContaining({
            src: "/course-hls/lesson-one/master.m3u8",
          }),
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
      rerender(
        <LessonVideoPlayer
          {...playerProps(firstMedia, engine)}
          onMinimize={onMinimize}
          onMinimizeGestureChange={onMinimizeGestureChange}
          presentation="full"
        />,
      );

      expect(shell.style.transform).toBe("");
      expect(onMinimizeGestureChange.mock.lastCall?.[0]).toEqual(
        expect.objectContaining({ offsetY: 0, phase: "idle", progress: 0 }),
      );
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

    fireEvent.click(screen.getByRole("button", { name: "Minimize video" }));
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
      "!w-10.5",
      "p-1",
      "hover:!w-31.5",
      "focus-within:!w-31.5",
    );
    expect(volumeGroup?.className).toContain(
      "hover:bg-(--video-player-control-surface-hover)",
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
        "sm:!bg-[color-mix(in_srgb,var(--video-player-control-text)_4%,transparent)]",
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
      "max-sm:[&_[role=slider]]:translate-y-[25%]",
      "max-sm:[&_[data-timeline-visual]]:-translate-y-[25%]",
    );
    expect(container.querySelector("[data-timeline-visual]")).toHaveClass(
      "pointer-events-none",
      "absolute",
      "inset-0",
    );
    expect(timeline.parentElement).toHaveClass(
      "max-sm:[&_[data-timeline-thumb]]:top-[calc(100%-1.5px)]",
      "max-sm:[&_[data-timeline-track]]:!h-0.75",
    );
    expect(timeline.parentElement).toHaveClass(
      "max-sm:[&_[data-video-player-preview]]:!bottom-3.5",
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
      "z-50",
      "sm:inset-x-3",
      "sm:bottom-13",
    );
    expect(
      container.querySelector('[data-mobile-player-corner="time"]'),
    ).toHaveClass(
      "bottom-2.5",
      "left-2",
      "h-10",
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
    const mobileFullscreenButton = within(
      mobileFullscreenCorner as HTMLElement,
    ).getByRole("button", { name: "Toggle fullscreen" });
    expect(mobileFullscreenButton).toHaveClass(
      "!size-10",
      "!bg-transparent",
      "!px-0",
    );
    const mobileFullscreenSurface = mobileFullscreenButton.querySelector(
      '[data-fullscreen-visual-surface=""]',
    );
    expect(mobileFullscreenSurface).toHaveClass(
      "size-7",
      "place-items-center",
      "rounded-full",
      "bg-(--video-player-control-surface)",
    );
    expect(mobileFullscreenSurface?.querySelector("svg")).toHaveAttribute(
      "width",
      "22",
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
      "p-0",
    );
    expect(mobilePreviousCluster).toHaveClass(
      "grid",
      "size-11.5",
      "place-items-center",
      "!border-0",
      "p-0",
    );
    expect(mobileNextCluster).toHaveClass(
      "grid",
      "size-11.5",
      "place-items-center",
      "!border-0",
      "p-0",
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
    expect(mobilePlayButton).toHaveClass("!size-15.5", "p-0");
    expect(mobilePreviousButton).toHaveClass("!size-11.5", "p-0");
    expect(mobileNextButton).toHaveClass("!size-11.5", "p-0");
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
      name: /00:00 elapsed of 01:30\. Show remaining time/,
    });
    expect(timeButtons).toHaveLength(2);
    const timeClusters = document.querySelectorAll(
      '[data-player-control-cluster="time"]',
    );
    expect(timeClusters).toHaveLength(2);

    const mobileTimeCluster = timeClusters[0] as HTMLElement;
    const desktopTimeCluster = timeClusters[1] as HTMLElement;
    const mobileTimeButton = within(mobileTimeCluster).getByRole("button");
    const desktopTimeButton = within(desktopTimeCluster).getByRole("button");

    expect(mobileTimeCluster).toHaveClass(
      "overflow-hidden",
      "rounded-full",
      "p-0",
    );
    expect(mobileTimeCluster).not.toHaveClass("h-9", "p-0.5");
    expect(mobileTimeButton).toHaveClass(
      "!h-auto",
      "!px-2",
      "!py-1",
      "!text-xs",
      "!leading-4",
    );
    expect(desktopTimeCluster).toHaveClass("h-9.5", "p-[3px]");
    expect(desktopTimeButton).toHaveClass("!h-8", "!px-3.5", "!text-sm");

    fireEvent.click(mobileTimeButton);

    expect(mobileTimeButton).toHaveAttribute("aria-pressed", "true");
    expect(mobileTimeButton).toHaveTextContent("-01:30 / 01:30");
    expect(mobileTimeButton).toHaveAccessibleName(
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
      src: "/course-hls/lesson-two/master.m3u8",
      metadata: { title: "The design mindset" },
    });
  });
});
