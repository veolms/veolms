import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { createRef, StrictMode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { FakeVideoEngine } from "../testing/FakeVideoEngine";
import type { VideoSource } from "../core/types";
import { BUILT_IN_PLAYER_THEME_IDS } from "../themes/playerThemes";
import { PlayerMedia } from "./PlayerMedia";
import { PlayerRoot, type VideoPlayerHandle } from "./PlayerRoot";
import { VideoPlayer } from "./VideoPlayer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function installFinePointerMatchMedia() {
  const previousMatchMedia = Object.getOwnPropertyDescriptor(
    window,
    "matchMedia",
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(hover: hover) and (pointer: fine)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });

  return () => {
    if (previousMatchMedia) {
      Object.defineProperty(window, "matchMedia", previousMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  };
}

function installCompactViewportMatchMedia() {
  const previousMatchMedia = Object.getOwnPropertyDescriptor(
    window,
    "matchMedia",
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
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
    }),
  });

  return () => {
    if (previousMatchMedia) {
      Object.defineProperty(window, "matchMedia", previousMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  };
}

function installWideLandscapeTouchMatchMedia() {
  const previousMatchMedia = Object.getOwnPropertyDescriptor(
    window,
    "matchMedia",
  );
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(max-height: 40rem)" || query === "(pointer: coarse)",
      media: query,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent() {
        return false;
      },
    }),
  });

  return () => {
    if (previousMatchMedia) {
      Object.defineProperty(window, "matchMedia", previousMatchMedia);
    } else {
      Reflect.deleteProperty(window, "matchMedia");
    }
  };
}

function installControllableWidthMatchMedia(initialMobile: boolean) {
  const previousMatchMedia = Object.getOwnPropertyDescriptor(
    window,
    "matchMedia",
  );
  const widthListeners = new Set<EventListenerOrEventListenerObject>();
  let mobile = initialMobile;

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: query === "(max-width: 640px)" && mobile,
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
    }),
  });

  return {
    setMobile(nextMobile: boolean) {
      mobile = nextMobile;
      const event = new Event("change");
      for (const listener of widthListeners) {
        if (typeof listener === "function") listener(event);
        else listener.handleEvent(event);
      }
    },
    restore() {
      if (previousMatchMedia) {
        Object.defineProperty(window, "matchMedia", previousMatchMedia);
      } else {
        Reflect.deleteProperty(window, "matchMedia");
      }
    },
  };
}

const source = {
  id: "lesson-1",
  src: "/lesson.mp4",
  kind: "file" as const,
  metadata: { title: "Testing the player" },
};

class StartupBufferingFakeVideoEngine extends FakeVideoEngine {
  #finishLoad: (() => void) | null = null;

  override async load(nextSource: VideoSource): Promise<void> {
    this.setSnapshot({
      lifecycle: "loading",
      source: nextSource,
      buffering: false,
      error: null,
    });
    await new Promise<void>((resolve) => {
      this.#finishLoad = resolve;
    });
  }

  finishLoadWhileBuffering(): void {
    this.setSnapshot({ lifecycle: "ready", buffering: true });
    this.#finishLoad?.();
    this.#finishLoad = null;
  }

  finishBuffering(): void {
    this.setSnapshot({ buffering: false });
  }

  startBuffering(): void {
    this.setSnapshot({ buffering: true });
  }
}

describe("VideoPlayer integration", () => {
  it("keeps one spinner mounted through startup buffering", async () => {
    const engine = new StartupBufferingFakeVideoEngine();
    render(<VideoPlayer source={source} engineFactory={() => engine} />);

    const loadingIndicator = await screen.findByRole("status", {
      name: "Loading video",
    });
    expect(loadingIndicator).toHaveClass("z-40");
    expect(
      loadingIndicator.querySelector(
        '[data-video-player-buffering-spinner=""]',
      ),
    ).toHaveClass(
      "video-player-buffering-spinner",
      "size-12",
      "overflow-visible",
    );
    expect(
      loadingIndicator.querySelector(".video-player-buffering-spinner__arc"),
    ).toHaveAttribute("stroke-linecap", "round");

    act(() => engine.finishLoadWhileBuffering());
    expect(screen.getByRole("status", { name: "Loading video" })).toBe(
      loadingIndicator,
    );

    act(() => engine.finishBuffering());
    await waitFor(() =>
      expect(screen.queryByRole("status")).not.toBeInTheDocument(),
    );

    act(() => engine.startBuffering());
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(
        screen.getByRole("status", { name: "Buffering video" }),
      ).toBeInTheDocument(),
    );
  });

  it("briefly shows themed desktop feedback for play and pause state changes", async () => {
    const engine = new FakeVideoEngine();
    const { container } = render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
        theme="aurora"
      />,
    );
    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    expect(
      container.querySelector("[data-video-player-playback-feedback]"),
    ).not.toBeInTheDocument();

    vi.useFakeTimers();
    await act(async () => engine.play());

    const playFeedback = container.querySelector(
      '[data-video-player-playback-feedback="play"]',
    );
    const playSurface = playFeedback?.querySelector(
      "[data-playback-feedback-surface]",
    );
    expect(playFeedback).toHaveClass("hidden", "sm:grid");
    expect(playFeedback).toHaveAttribute("aria-hidden", "true");
    expect(playSurface).toHaveClass(
      "size-20",
      "lg:size-22",
      "border-0",
      "bg-transparent",
      "shadow-none",
    );
    expect(playSurface).not.toHaveClass("backdrop-blur-sm");
    expect(playSurface).toHaveAttribute(
      "data-playback-feedback-duration",
      "850",
    );
    expect(
      playSurface?.querySelector('[data-playback-feedback-icon="play"]'),
    ).toHaveClass("size-10", "lg:size-11", "translate-x-0.5");

    act(() => vi.advanceTimersByTime(849));
    expect(
      container.querySelector('[data-video-player-playback-feedback="play"]'),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(
      container.querySelector("[data-video-player-playback-feedback]"),
    ).not.toBeInTheDocument();

    act(() => engine.pause());
    expect(
      container.querySelector(
        '[data-video-player-playback-feedback="pause"] [data-playback-feedback-icon="pause"]',
      ),
    ).toBeInTheDocument();
  });

  it("allows the default playback feedback to be disabled", async () => {
    const engine = new FakeVideoEngine();
    const { container } = render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
        playbackFeedback={false}
      />,
    );
    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

    await act(async () => engine.play());
    expect(
      container.querySelector("[data-video-player-playback-feedback]"),
    ).not.toBeInTheDocument();
  });

  it("maps pointer presses across the full-height volume hit target", async () => {
    const engine = new FakeVideoEngine();
    const setVolume = vi.spyOn(engine, "setVolume");
    const handle = createRef<VideoPlayerHandle>();

    render(
      <VideoPlayer ref={handle} source={source} engineFactory={() => engine} />,
    );
    await waitFor(() => expect(engine.getSnapshot().source).toEqual(source));

    const volumeSlider = screen.getByRole("slider", { name: "Volume" });
    const muteButton = screen.getByRole("button", { name: "Mute" });
    expect(volumeSlider).toHaveClass("h-9");
    expect(muteButton).toHaveAttribute("data-volume-level", "high");
    vi.spyOn(volumeSlider, "getBoundingClientRect").mockReturnValue({
      bottom: 40,
      height: 36,
      left: 10,
      right: 110,
      top: 4,
      width: 100,
      x: 10,
      y: 4,
      toJSON: () => ({}),
    });

    fireEvent.pointerDown(volumeSlider, { clientX: 85, clientY: 6 });
    expect(setVolume).toHaveBeenCalledWith(0.75);

    act(() => handle.current?.setVolume(0.5));
    await waitFor(() =>
      expect(muteButton).toHaveAttribute("data-volume-level", "medium"),
    );
    act(() => handle.current?.setVolume(0.2));
    await waitFor(() =>
      expect(muteButton).toHaveAttribute("data-volume-level", "quiet"),
    );
    fireEvent.click(muteButton);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute(
        "data-volume-level",
        "muted",
      ),
    );
  });

  it("keeps the Space shortcut active while the gesture surface is focused", async () => {
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");

    render(<VideoPlayer source={source} engineFactory={() => engine} />);
    await waitFor(() => expect(engine.getSnapshot().source).toEqual(source));

    const gestureSurface = screen.getByRole("button", {
      name: "Play or pause video",
    });
    gestureSurface.focus();
    fireEvent.keyDown(gestureSurface, { key: " ", code: "Space" });
    fireEvent.keyUp(gestureSurface, { key: " ", code: "Space" });

    await waitFor(() => expect(play).toHaveBeenCalledOnce());
  });

  it("hides controls during a held-Space 2× boost while its elevated label fades independently", async () => {
    const engine = new FakeVideoEngine();
    const setPlaybackRate = vi.spyOn(engine, "setPlaybackRate");

    render(<VideoPlayer source={source} engineFactory={() => engine} />);
    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

    const player = screen.getByRole("region", { name: "Video player" });
    const gestureSurface = screen.getByRole("button", {
      name: "Play or pause video",
    });
    gestureSurface.focus();
    vi.useFakeTimers();

    fireEvent.keyDown(gestureSurface, {
      key: " ",
      code: "Space",
      repeat: true,
    });

    expect(setPlaybackRate).toHaveBeenLastCalledWith(2);
    expect(player).toHaveAttribute("data-controls-visible", "false");
    expect(screen.getByRole("status")).toHaveAttribute(
      "data-player-hud-variant",
      "temporary-speed",
    );
    expect(screen.getByText("2× speed")).toHaveClass(
      "top-[22%]",
      "left-1/2",
      "-translate-x-1/2",
    );

    act(() => vi.advanceTimersByTime(850));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(engine.getSnapshot().playbackRate).toBe(2);
    expect(player).toHaveAttribute("data-controls-visible", "false");

    fireEvent.keyDown(gestureSurface, {
      key: " ",
      code: "Space",
      repeat: true,
    });
    expect(player).toHaveAttribute("data-controls-visible", "false");
    fireEvent.keyUp(gestureSurface, { key: " ", code: "Space" });

    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(player).toHaveAttribute("data-controls-visible", "true");
  });

  it("survives StrictMode effect replay without duplicate loading or leaked ownership", async () => {
    const engine = new FakeVideoEngine();
    const engineFactory = vi.fn(() => engine);
    const load = vi.spyOn(engine, "load");
    const play = vi.spyOn(engine, "play");
    const destroy = vi.spyOn(engine, "destroy");

    const { unmount } = render(
      <StrictMode>
        <VideoPlayer source={source} engineFactory={engineFactory} />
      </StrictMode>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(destroy).not.toHaveBeenCalled();

    const player = screen.getByRole("region", { name: "Video player" });
    fireEvent.focusIn(player);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    await waitFor(() => expect(play).toHaveBeenCalledOnce());

    unmount();
    await waitFor(() => expect(destroy).toHaveBeenCalledOnce());
  });

  it("serializes delayed media ref replay before loading in StrictMode", async () => {
    const engine = new FakeVideoEngine();
    const originalAttach = engine.attach.bind(engine);
    const originalDetach = engine.detach.bind(engine);
    const originalLoad = engine.load.bind(engine);
    let activeTransitions = 0;
    let maxConcurrentTransitions = 0;
    let loadStartedDuringTransition = false;
    let attachedMedia: HTMLMediaElement | null = null;
    let loadedMedia: HTMLMediaElement | null = null;
    const delay = () =>
      new Promise<void>((resolve) => {
        setTimeout(resolve, 10);
      });

    vi.spyOn(engine, "attach").mockImplementation(async (media) => {
      activeTransitions += 1;
      maxConcurrentTransitions = Math.max(
        maxConcurrentTransitions,
        activeTransitions,
      );
      try {
        await delay();
        await originalAttach(media);
        attachedMedia = media;
      } finally {
        activeTransitions -= 1;
      }
    });
    vi.spyOn(engine, "detach").mockImplementation(async () => {
      activeTransitions += 1;
      maxConcurrentTransitions = Math.max(
        maxConcurrentTransitions,
        activeTransitions,
      );
      try {
        await delay();
        await originalDetach();
        attachedMedia = null;
      } finally {
        activeTransitions -= 1;
      }
    });
    const load = vi
      .spyOn(engine, "load")
      .mockImplementation(async (nextSource, options) => {
        loadStartedDuringTransition = activeTransitions > 0;
        loadedMedia = attachedMedia;
        await originalLoad(nextSource, options);
      });

    const { container } = render(
      <StrictMode>
        <VideoPlayer source={source} engineFactory={() => engine} />
      </StrictMode>,
    );

    await waitFor(() => expect(load).toHaveBeenCalledOnce());
    expect(maxConcurrentTransitions).toBe(1);
    expect(loadStartedDuringTransition).toBe(false);
    expect(loadedMedia).toBe(container.querySelector("video"));
  });

  it("does not reload equivalent recreated load props but reloads meaningful changes", async () => {
    const engine = new FakeVideoEngine();
    const load = vi.spyOn(engine, "load");
    const certificate = new Uint8Array([1, 2, 3]);
    const createSource = (): VideoSource => ({
      ...source,
      metadata: { title: "Testing the player", duration: 120 },
      drm: {
        fairplay: {
          licenseUrl: "/license",
          certificate: new Uint8Array(certificate),
        },
      },
      streaming: { bufferingGoal: 20, abrEnabled: true },
      textTracks: [
        {
          src: "/lesson-en.vtt",
          language: "en",
          label: "English",
        },
      ],
    });
    const renderRoot = (
      nextSource: VideoSource,
      startTime: number,
      autoPlay = false,
    ) => (
      <PlayerRoot
        source={nextSource}
        loadOptions={{ startTime, mimeType: "video/mp4" }}
        engineFactory={() => engine}
        autoPlay={autoPlay}
      >
        <PlayerMedia />
      </PlayerRoot>
    );

    const { rerender } = render(renderRoot(createSource(), 4));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    rerender(renderRoot(createSource(), 4));
    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);

    rerender(renderRoot(createSource(), 4, true));
    await act(async () => Promise.resolve());
    expect(load).toHaveBeenCalledTimes(1);

    rerender(renderRoot({ ...createSource(), kind: "hls" as const }, 4));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    const changedTrack: VideoSource = {
      ...createSource(),
      kind: "hls",
      textTracks: [
        {
          src: "/lesson-en-v2.vtt",
          language: "en",
          label: "English",
        },
      ],
    };
    rerender(renderRoot(changedTrack, 4));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(3));

    rerender(renderRoot(changedTrack, 18));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(4));
  });

  it("reactively exposes picture in picture after the media ref attaches", async () => {
    const previousPictureInPictureEnabled = Object.getOwnPropertyDescriptor(
      document,
      "pictureInPictureEnabled",
    );
    Object.defineProperty(document, "pictureInPictureEnabled", {
      configurable: true,
      value: true,
    });
    const engine = new FakeVideoEngine();
    vi.spyOn(engine, "getCapabilities").mockReturnValue({
      browserSupported: true,
      adaptiveStreaming: true,
      drm: false,
      nativeHls: false,
      pictureInPicture: true,
    });
    let finishAttach: (() => void) | undefined;
    const attachment = new Promise<void>((resolve) => {
      finishAttach = resolve;
    });
    vi.spyOn(engine, "attach").mockReturnValue(attachment);

    try {
      const { container } = render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          keyboardEnabled={false}
        />,
      );
      expect(
        screen.queryByRole("button", { name: "Toggle picture in picture" }),
      ).not.toBeInTheDocument();

      const media = container.querySelector("video");
      expect(media).not.toBeNull();
      Object.defineProperty(media!, "requestPictureInPicture", {
        configurable: true,
        value: vi.fn(async () => undefined),
      });
      finishAttach?.();

      expect(
        await screen.findByRole("button", {
          name: "Toggle picture in picture",
        }),
      ).toBeVisible();
    } finally {
      if (previousPictureInPictureEnabled) {
        Object.defineProperty(
          document,
          "pictureInPictureEnabled",
          previousPictureInPictureEnabled,
        );
      } else {
        Reflect.deleteProperty(document, "pictureInPictureEnabled");
      }
    }
  });

  it("queues play until asynchronous media attachment finishes", async () => {
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");
    const pause = vi.spyOn(engine, "pause");
    let finishAttach: (() => void) | undefined;
    const attachment = new Promise<void>((resolve) => {
      finishAttach = resolve;
    });
    vi.spyOn(engine, "attach").mockReturnValue(attachment);
    const handle = createRef<VideoPlayerHandle>();
    render(
      <VideoPlayer
        ref={handle}
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
      />,
    );

    let playRequest: Promise<void> | undefined;
    await act(async () => {
      playRequest = handle.current?.play();
      await Promise.resolve();
    });
    expect(play).not.toHaveBeenCalled();

    finishAttach?.();
    await act(async () => playRequest);
    expect(play).toHaveBeenCalledOnce();

    const pauseRequest = handle.current?.togglePlayback();
    expect(pause).toHaveBeenCalledOnce();
    await pauseRequest;
  });

  it("applies only the latest pre-attachment media properties after attachment", async () => {
    const engine = new FakeVideoEngine();
    const pause = vi.spyOn(engine, "pause");
    const setMuted = vi.spyOn(engine, "setMuted");
    const setPlaybackRate = vi.spyOn(engine, "setPlaybackRate");
    const setVolume = vi.spyOn(engine, "setVolume");
    const seek = vi.spyOn(engine, "seek");
    let finishAttach: (() => void) | undefined;
    const attachment = new Promise<void>((resolve) => {
      finishAttach = resolve;
    });
    vi.spyOn(engine, "attach").mockReturnValue(attachment);
    const handle = createRef<VideoPlayerHandle>();
    render(
      <VideoPlayer
        ref={handle}
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
      />,
    );

    act(() => {
      handle.current?.setVolume(0.25);
      handle.current?.setVolume(0.65);
      handle.current?.setMuted(false);
      handle.current?.setMuted(true);
      handle.current?.setPlaybackRate(1.25);
      handle.current?.setPlaybackRate(1.5);
      handle.current?.seekTo(8);
      handle.current?.seekTo(24);
      handle.current?.pause();
    });
    expect(setVolume).not.toHaveBeenCalled();
    expect(setMuted).not.toHaveBeenCalled();
    expect(setPlaybackRate).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
    expect(pause).not.toHaveBeenCalled();

    finishAttach?.();
    await waitFor(() => expect(setVolume).toHaveBeenCalledWith(0.65));
    expect(setVolume).toHaveBeenCalledOnce();
    expect(setMuted).toHaveBeenCalledOnce();
    expect(setMuted).toHaveBeenCalledWith(true);
    expect(setPlaybackRate).toHaveBeenCalledOnce();
    expect(setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(seek).toHaveBeenCalledOnce();
    expect(seek).toHaveBeenCalledWith(24);
  });

  it("queues a keyboard Space toggle until asynchronous media attachment finishes", async () => {
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");
    let finishAttach: (() => void) | undefined;
    const attachment = new Promise<void>((resolve) => {
      finishAttach = resolve;
    });
    vi.spyOn(engine, "attach").mockReturnValue(attachment);
    render(<VideoPlayer source={source} engineFactory={() => engine} />);

    const player = screen.getByRole("region", { name: "Video player" });
    fireEvent.focusIn(player);
    fireEvent.keyDown(window, { key: " ", code: "Space" });
    fireEvent.keyUp(window, { key: " ", code: "Space" });
    expect(play).not.toHaveBeenCalled();

    finishAttach?.();
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
  });

  it("loads through an injected engine without exposing skip controls", async () => {
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");
    const setMuted = vi.spyOn(engine, "setMuted");

    render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
      />,
    );

    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(play).toHaveBeenCalledOnce();
    expect(await screen.findByRole("button", { name: "Pause" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Mute" }));
    expect(setMuted).toHaveBeenCalledWith(true);
    expect(screen.getByRole("button", { name: "Unmute" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    expect(
      screen.queryByRole("button", { name: /Seek (?:backward|forward)/ }),
    ).not.toBeInTheDocument();
  });

  it("routes active-player keyboard seeking to the engine", async () => {
    const engine = new FakeVideoEngine();
    const seek = vi.spyOn(engine, "seek");
    render(<VideoPlayer source={source} engineFactory={() => engine} />);

    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    engine.setSnapshot({ currentTime: 30 });
    const player = screen.getByRole("region", { name: "Video player" });
    fireEvent.focusIn(player);
    fireEvent.keyDown(window, { key: "ArrowRight", code: "ArrowRight" });
    fireEvent.keyDown(window, { key: "l", code: "KeyL" });

    expect(seek).toHaveBeenNthCalledWith(1, 40);
    expect(seek).toHaveBeenNthCalledWith(2, 50);
  });

  it("changes playback speed by 0.25× and shows themed shortcut feedback", async () => {
    const engine = new FakeVideoEngine();
    const setPlaybackRate = vi.spyOn(engine, "setPlaybackRate");
    const { container } = render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        theme="aurora"
      />,
    );

    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    const player = screen.getByRole("region", { name: "Video player" });
    fireEvent.focusIn(player);
    vi.useFakeTimers();

    fireEvent.keyDown(window, {
      code: "Comma",
      key: "<",
      shiftKey: true,
    });

    expect(setPlaybackRate).toHaveBeenLastCalledWith(0.75);
    const speedStatus = screen.getByRole("status");
    expect(speedStatus).toHaveAttribute(
      "data-player-hud-variant",
      "playback-rate",
    );
    expect(screen.getByText("0.75×")).toHaveAttribute(
      "data-playback-feedback-duration",
      "850",
    );
    expect(
      container.querySelector('[data-player-playback-rate-icon="decrease"]'),
    ).toBeInTheDocument();

    fireEvent.keyDown(window, {
      code: "Period",
      key: ">",
      shiftKey: true,
    });
    expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
    expect(screen.getByText("1×")).toBeVisible();
    expect(
      container.querySelector('[data-player-playback-rate-icon="increase"]'),
    ).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(850));
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it.each(BUILT_IN_PLAYER_THEME_IDS)(
    "accumulates mobile seek taps with side feedback in the %s theme",
    async (theme) => {
      const restoreMatchMedia = installCompactViewportMatchMedia();
      const engine = new FakeVideoEngine();
      const seek = vi.spyOn(engine, "seek");

      try {
        const { container } = render(
          <VideoPlayer
            source={source}
            engineFactory={() => engine}
            emptyTapBehavior="responsive"
            seekIntervalSeconds={20}
            theme={theme}
          />,
        );

        await waitFor(() =>
          expect(engine.getSnapshot().lifecycle).toBe("ready"),
        );
        engine.setSnapshot({ currentTime: 30 });
        const player = screen.getByRole("region", { name: "Video player" });
        const surface = screen.getByRole("button", {
          name: "Play or pause video; tap to show controls",
        });
        vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
          bottom: 60,
          height: 60,
          left: 0,
          right: 100,
          top: 0,
          width: 100,
          x: 0,
          y: 0,
          toJSON: () => undefined,
        });
        vi.useFakeTimers();

        const tap = (clientX: number) => {
          fireEvent.pointerDown(surface, {
            clientX,
            pointerId: 1,
            pointerType: "touch",
          });
          fireEvent.pointerUp(surface, {
            clientX,
            pointerId: 1,
            pointerType: "touch",
          });
        };

        act(() => {
          tap(75);
          vi.advanceTimersByTime(100);
          tap(75);
        });
        expect(seek).toHaveBeenLastCalledWith(50);
        expect(player).toHaveAttribute("data-controls-visible", "false");
        expect(screen.getByRole("status")).toHaveAttribute(
          "data-player-hud-direction",
          "forward",
        );
        expect(screen.getByRole("status")).toHaveAccessibleName(
          "Seek forward 20 seconds",
        );
        expect(screen.getByText("+20")).toBeVisible();
        expect(
          container.querySelector('[data-player-mobile-seek-icon="forward"]'),
        ).toBeInTheDocument();

        act(() => {
          vi.advanceTimersByTime(100);
          fireEvent.pointerDown(surface, {
            clientX: 75,
            pointerId: 1,
            pointerType: "touch",
          });
        });
        expect(player).toHaveAttribute("data-controls-visible", "false");
        fireEvent.pointerUp(surface, {
          clientX: 75,
          pointerId: 1,
          pointerType: "touch",
        });
        expect(seek).toHaveBeenLastCalledWith(70);
        expect(screen.getByText("+40")).toBeVisible();

        act(() => {
          vi.advanceTimersByTime(100);
          tap(25);
        });
        expect(seek).toHaveBeenLastCalledWith(50);
        expect(screen.getByRole("status")).toHaveAttribute(
          "data-player-hud-direction",
          "backward",
        );
        expect(screen.getByRole("status")).toHaveAccessibleName(
          "Seek backward 20 seconds",
        );
        expect(screen.getByText("−20")).toBeVisible();
        expect(
          container.querySelector('[data-player-mobile-seek-icon="backward"]'),
        ).toHaveClass("rotate-180");

        act(() => vi.advanceTimersByTime(1_499));
        expect(screen.getByText("−20")).toBeVisible();
        expect(player).toHaveAttribute("data-controls-visible", "false");
        act(() => vi.advanceTimersByTime(1));
        expect(screen.queryByRole("status")).not.toBeInTheDocument();
        expect(player).toHaveAttribute("data-controls-visible", "true");
      } finally {
        restoreMatchMedia();
      }
    },
  );

  it("accumulates native mobile touch taps without waiting for another pair", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const seek = vi.spyOn(engine, "seek");

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
          seekIntervalSeconds={10}
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      engine.setSnapshot({ currentTime: 5 });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
        bottom: 60,
        height: 60,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });
      vi.useFakeTimers();

      const touchTap = (identifier: number) => {
        const touch = { clientX: 75, clientY: 30, identifier };
        fireEvent.touchStart(surface, {
          changedTouches: [touch],
          touches: [touch],
        });
        fireEvent.touchEnd(surface, {
          changedTouches: [touch],
          touches: [],
        });
      };

      act(() => {
        touchTap(1);
        vi.advanceTimersByTime(100);
        touchTap(2);
      });
      expect(seek).toHaveBeenLastCalledWith(15);
      expect(screen.getByText("+10")).toBeVisible();

      act(() => {
        vi.advanceTimersByTime(100);
        touchTap(3);
      });
      expect(seek).toHaveBeenLastCalledWith(25);
      expect(screen.getByText("+20")).toBeVisible();
    } finally {
      restoreMatchMedia();
    }
  });

  it("pinch-zooms to fill, pans the zoomed video, and exposes the zoom level with controls", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");

    try {
      const { container } = render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
          zoomOverflowBoundary="shell"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const media = container.querySelector("video");
      const zoomViewport = container.querySelector(
        '[data-player-zoom-viewport=""]',
      );
      expect(media).not.toBeNull();
      expect(player).toHaveAttribute(
        "data-player-zoom-overflow-boundary",
        "shell",
      );
      expect(zoomViewport).toHaveAttribute(
        "data-player-zoom-expanded",
        "false",
      );
      vi.spyOn(player, "getBoundingClientRect").mockReturnValue({
        bottom: 300,
        height: 300,
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
      vi.useFakeTimers();

      fireEvent.pointerDown(surface, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerDown(surface, {
        clientX: 250,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 270,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });

      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.200");
      expect(player).toHaveStyle({ overflow: "visible" });
      expect(player).toHaveAttribute("data-player-zoom-expanded", "true");
      expect(zoomViewport).toHaveClass("overflow-visible");
      expect(
        screen.getByRole("button", {
          name: "Reset video zoom from 1.2× to 1×",
        }),
      ).toHaveClass("size-10", "text-[13px]", "leading-none");
      expect(play).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(100));
      fireEvent.pointerUp(surface, {
        clientX: 270,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.333");
      fireEvent.pointerMove(surface, {
        clientX: 190,
        clientY: 170,
        pointerId: 1,
        pointerType: "touch",
      });
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.333");
      expect(media?.style.transform).toContain("translate3d(50px, 0px, 0)");
      fireEvent.pointerUp(surface, {
        clientX: 190,
        clientY: 170,
        pointerId: 1,
        pointerType: "touch",
      });

      expect(media).toHaveAttribute("data-player-zoom-scale", "1.333");
      expect(
        screen.getByRole("button", {
          name: "Reset video zoom from 1.33× to 1×",
        }),
      ).toHaveAttribute("data-player-zoom-indicator", "feedback");

      act(() => vi.advanceTimersByTime(1_800));
      expect(
        screen.queryByRole("button", {
          name: "Reset video zoom from 1.33× to 1×",
        }),
      ).not.toBeInTheDocument();

      fireEvent.pointerDown(surface, {
        clientX: 200,
        clientY: 150,
        pointerId: 3,
        pointerType: "touch",
      });
      fireEvent.pointerUp(surface, {
        clientX: 200,
        clientY: 150,
        pointerId: 3,
        pointerType: "touch",
      });
      act(() => vi.advanceTimersByTime(301));
      expect(player).toHaveAttribute("data-controls-visible", "true");
      const zoomControl = screen.getByRole("button", {
        name: "Reset video zoom from 1.33× to 1×",
      });
      expect(zoomControl).toHaveAttribute(
        "data-player-zoom-indicator",
        "control",
      );
      expect(zoomControl).toHaveClass(
        "size-[34px]",
        "sm:size-9",
        "text-[13px]",
        "leading-none",
      );

      fireEvent.pointerDown(surface, {
        clientX: 200,
        clientY: 150,
        pointerId: 4,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 240,
        clientY: 150,
        pointerId: 4,
        pointerType: "touch",
      });
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.333");
      expect(player).toHaveAttribute("data-controls-visible", "false");
      fireEvent.pointerUp(surface, {
        clientX: 240,
        clientY: 150,
        pointerId: 4,
        pointerType: "touch",
      });

      const feedbackReset = screen.getByRole("button", {
        name: "Reset video zoom from 1.33× to 1×",
      });
      expect(feedbackReset).toHaveAttribute(
        "data-player-controls-reveal",
        "delayed",
      );
      fireEvent.pointerDown(feedbackReset, {
        clientX: 380,
        clientY: 20,
        pointerId: 5,
        pointerType: "touch",
      });
      expect(player).toHaveAttribute("data-controls-visible", "false");
      fireEvent.pointerUp(feedbackReset, {
        clientX: 380,
        clientY: 20,
        pointerId: 5,
        pointerType: "touch",
      });
      fireEvent.click(feedbackReset);

      expect(feedbackReset).not.toBeInTheDocument();
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.000");
      expect(player).not.toHaveStyle({ overflow: "visible" });
      expect(player).not.toHaveAttribute("data-player-zoom-expanded");
      expect(zoomViewport).toHaveClass("overflow-hidden");
      expect(media?.style.transform).toContain("translate3d(0px, 0px, 0)");
      expect(player).toHaveAttribute("data-controls-visible", "false");
      act(() => vi.advanceTimersByTime(999));
      expect(player).toHaveAttribute("data-controls-visible", "false");
      act(() => vi.advanceTimersByTime(1));
      expect(player).toHaveAttribute("data-controls-visible", "true");
    } finally {
      restoreMatchMedia();
    }
  });

  it("does not reuse an abandoned touch pointer as a second pinch finger", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();

    try {
      const { container } = render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const media = container.querySelector("video");

      fireEvent.pointerDown(surface, {
        clientX: 180,
        clientY: 100,
        isPrimary: true,
        pointerId: 1,
        pointerType: "touch",
      });

      fireEvent.pointerDown(surface, {
        clientX: 180,
        clientY: 140,
        isPrimary: true,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 180,
        clientY: 240,
        isPrimary: true,
        pointerId: 2,
        pointerType: "touch",
      });

      expect(media).toHaveAttribute("data-player-zoom-scale", "1.000");
      expect(media).toHaveAttribute("data-player-zoom-active", "false");
      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(
        screen.queryByRole("button", { name: /Reset video zoom/ }),
      ).not.toBeInTheDocument();
    } finally {
      restoreMatchMedia();
    }
  });

  it("leaves pinch gestures for a parent surface when content zoom is disabled", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const parentPointerMove = vi.fn();

    try {
      const { container } = render(
        <div onPointerMove={parentPointerMove}>
          <VideoPlayer
            source={source}
            engineFactory={() => engine}
            zoomEnabled={false}
          />
        </div>,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      const player = screen.getByRole("region", { name: "Video player" });
      const media = container.querySelector("video");

      fireEvent.pointerDown(player, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        pointerType: "touch",
      });
      fireEvent.pointerDown(player, {
        clientX: 250,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerMove(player, {
        clientX: 300,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });

      expect(player).toHaveAttribute("data-player-zoom-enabled", "false");
      expect(media).toHaveAttribute("data-player-zoom-scale", "1.000");
      expect(parentPointerMove).toHaveBeenCalledOnce();
      expect(
        screen.queryByRole("button", { name: /Reset video zoom/ }),
      ).not.toBeInTheDocument();

      fireEvent.pointerUp(player, {
        clientX: 300,
        clientY: 150,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.pointerUp(player, {
        clientX: 150,
        clientY: 150,
        pointerId: 1,
        pointerType: "touch",
      });
    } finally {
      restoreMatchMedia();
    }
  });

  it("supports native touch pinch gestures without pointer events", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();

    try {
      const { container } = render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const media = container.querySelector("video");
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

      const first = { clientX: 150, clientY: 110, identifier: 1 };
      const second = { clientX: 250, clientY: 110, identifier: 2 };
      fireEvent.touchStart(surface, {
        changedTouches: [first, second],
        touches: [first, second],
      });
      fireEvent.touchMove(surface, {
        changedTouches: [{ ...second, clientX: 350 }],
        touches: [first, { ...second, clientX: 350 }],
      });

      expect(media).toHaveAttribute("data-player-zoom-scale", "2.000");
      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(
        screen.getByRole("button", {
          name: "Reset video zoom from 2× to 1×",
        }),
      ).toHaveAttribute("data-player-zoom-indicator", "feedback");

      fireEvent.touchEnd(surface, {
        changedTouches: [second],
        touches: [first],
      });
      fireEvent.touchMove(surface, {
        changedTouches: [{ ...first, clientX: 190, clientY: 140 }],
        touches: [{ ...first, clientX: 190, clientY: 140 }],
      });
      expect(media).toHaveAttribute("data-player-zoom-scale", "2.000");
      expect(media?.style.transform).toContain("translate3d(90px, 32.5px, 0)");
      fireEvent.touchEnd(surface, {
        changedTouches: [{ ...first, clientX: 190, clientY: 140 }],
        touches: [],
      });
      expect(media).toHaveAttribute("data-player-zoom-active", "false");
    } finally {
      restoreMatchMedia();
    }
  });

  it("starts a pinch when either touch begins on a player control", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");

    try {
      const { container } = render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
      const player = screen.getByRole("region", { name: "Video player" });
      const playControl = screen.getByRole("button", { name: "Play video" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const media = container.querySelector("video");
      vi.spyOn(player, "getBoundingClientRect").mockReturnValue({
        bottom: 300,
        height: 300,
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
      vi.useFakeTimers();

      fireEvent.pointerDown(playControl, {
        clientX: 150,
        clientY: 150,
        pointerId: 11,
        pointerType: "touch",
      });
      fireEvent.pointerDown(surface, {
        clientX: 250,
        clientY: 150,
        pointerId: 12,
        pointerType: "touch",
      });
      fireEvent.pointerMove(surface, {
        clientX: 270,
        clientY: 150,
        pointerId: 12,
        pointerType: "touch",
      });

      expect(media).toHaveAttribute("data-player-zoom-scale", "1.200");
      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(play).not.toHaveBeenCalled();

      fireEvent.pointerUp(surface, {
        clientX: 270,
        clientY: 150,
        pointerId: 12,
        pointerType: "touch",
      });
      fireEvent.pointerUp(playControl, {
        clientX: 150,
        clientY: 150,
        pointerId: 11,
        pointerType: "touch",
      });
      fireEvent.click(playControl);
      expect(play).not.toHaveBeenCalled();

      act(() => vi.advanceTimersByTime(91));
      await act(async () => {
        fireEvent.click(playControl);
        await Promise.resolve();
      });
      expect(play).toHaveBeenCalledOnce();
    } finally {
      restoreMatchMedia();
    }
  });

  it("double-clicks anywhere on desktop to toggle fullscreen without seeking", async () => {
    const engine = new FakeVideoEngine();
    const seek = vi.spyOn(engine, "seek");
    const play = vi.spyOn(engine, "play");
    const { container } = render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
      />,
    );

    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    const shell = container.querySelector<HTMLElement>(".video-shell");
    const requestFullscreen = vi.fn(async () => undefined);
    Object.assign(shell!, { requestFullscreen });
    const surface = screen.getByRole("button", {
      name: "Play or pause video",
    });
    expect(surface).not.toHaveAttribute("title");
    vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
      bottom: 60,
      height: 60,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => undefined,
    });
    vi.useFakeTimers();

    const click = (clientX: number) => {
      fireEvent.pointerDown(surface, {
        clientX,
        pointerId: 2,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(surface, {
        clientX,
        pointerId: 2,
        pointerType: "mouse",
      });
    };

    await act(async () => {
      click(75);
      vi.advanceTimersByTime(100);
      click(75);
      await Promise.resolve();
    });
    expect(requestFullscreen).toHaveBeenCalledOnce();
    expect(seek).not.toHaveBeenCalled();
    expect(screen.queryByText(/seconds/)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(350));
    expect(play).not.toHaveBeenCalled();
  });

  it("uses desktop controls when opened in wide coarse-pointer landscape", async () => {
    const restoreMatchMedia = installWideLandscapeTouchMatchMedia();
    const engine = new FakeVideoEngine();

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
          seekIntervalSeconds={10}
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const player = screen.getByRole("region", { name: "Video player" });
      expect(player).toHaveAttribute("data-player-mobile-interaction", "false");
      expect(screen.getByRole("button", { name: "Play video" })).toHaveClass(
        "hidden",
      );
    } finally {
      restoreMatchMedia();
    }
  });

  it("keeps width-selected mobile controls through fullscreen rotation", async () => {
    const viewport = installControllableWidthMatchMedia(true);
    const originalFullscreenElement = Object.getOwnPropertyDescriptor(
      document,
      "fullscreenElement",
    );
    let fullscreenElement: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", {
      configurable: true,
      get: () => fullscreenElement,
    });
    const engine = new FakeVideoEngine();

    try {
      const { container } = render(
        <VideoPlayer source={source} engineFactory={() => engine} />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const shell = container.querySelector<HTMLElement>(".video-shell");
      const player = screen.getByRole("region", { name: "Video player" });
      expect(player).toHaveAttribute("data-player-mobile-interaction", "true");

      act(() => {
        fullscreenElement = shell;
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      act(() => viewport.setMobile(false));
      expect(player).toHaveAttribute("data-player-mobile-interaction", "true");

      act(() => {
        fullscreenElement = null;
        document.dispatchEvent(new Event("fullscreenchange"));
      });
      expect(player).toHaveAttribute("data-player-mobile-interaction", "false");
    } finally {
      viewport.restore();
      if (originalFullscreenElement) {
        Object.defineProperty(
          document,
          "fullscreenElement",
          originalFullscreenElement,
        );
      } else {
        Reflect.deleteProperty(document, "fullscreenElement");
      }
    }
  });

  it("uses empty-space mouse clicks to toggle controls in a compact viewport", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const playButton = screen.getByRole("button", { name: "Play" });
      const controls = document.querySelector<HTMLElement>(
        "[data-video-player-controls]",
      );
      expect(player).toHaveAttribute("data-player-mobile-interaction", "true");
      expect(surface).not.toHaveAttribute("title");
      vi.useFakeTimers();

      const clickEmptySpace = () => {
        fireEvent.pointerDown(surface, {
          clientX: 50,
          pointerId: 1,
          pointerType: "mouse",
        });
        fireEvent.pointerUp(surface, {
          clientX: 50,
          pointerId: 1,
          pointerType: "mouse",
        });
        act(() => vi.advanceTimersByTime(301));
      };

      expect(player).toHaveAttribute("data-controls-visible", "true");
      clickEmptySpace();
      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(controls).toHaveAttribute("inert");
      expect(controls).toHaveClass("invisible", "pointer-events-none");
      expect(play).not.toHaveBeenCalled();

      fireEvent.pointerDown(playButton, {
        clientX: 50,
        pointerId: 2,
        pointerType: "touch",
      });
      expect(player).toHaveAttribute("data-controls-visible", "true");
      fireEvent.pointerUp(playButton, {
        clientX: 50,
        pointerId: 2,
        pointerType: "touch",
      });
      fireEvent.click(playButton, { detail: 1 });
      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(controls).not.toHaveAttribute("inert");
      expect(play).not.toHaveBeenCalled();

      clickEmptySpace();
      expect(player).toHaveAttribute("data-controls-visible", "false");

      clickEmptySpace();
      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(play).not.toHaveBeenCalled();
    } finally {
      restoreMatchMedia();
    }
  });

  it("uses touch completion to toggle controls and deduplicates pointer-backed touches", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");
    const seek = vi.spyOn(engine, "seek");

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      vi.spyOn(surface, "getBoundingClientRect").mockReturnValue({
        bottom: 60,
        height: 60,
        left: 0,
        right: 100,
        top: 0,
        width: 100,
        x: 0,
        y: 0,
        toJSON: () => undefined,
      });
      vi.useFakeTimers();
      const touch = { clientX: 50, clientY: 30, identifier: 7 };

      fireEvent.touchStart(surface, {
        changedTouches: [touch],
        touches: [touch],
      });
      fireEvent.touchEnd(surface, { changedTouches: [touch], touches: [] });
      act(() => vi.advanceTimersByTime(301));

      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(play).not.toHaveBeenCalled();

      fireEvent.pointerDown(surface, {
        clientX: 50,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.touchStart(surface, {
        changedTouches: [touch],
        touches: [touch],
      });
      fireEvent.pointerUp(surface, {
        clientX: 50,
        pointerId: 7,
        pointerType: "touch",
      });
      fireEvent.touchEnd(surface, { changedTouches: [touch], touches: [] });
      act(() => vi.advanceTimersByTime(301));

      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(play).not.toHaveBeenCalled();
      expect(seek).not.toHaveBeenCalled();

      fireEvent.touchStart(surface, {
        changedTouches: [touch],
        touches: [touch],
      });
      fireEvent.touchMove(surface, {
        changedTouches: [{ ...touch, clientY: 50 }],
        touches: [{ ...touch, clientY: 50 }],
      });
      fireEvent.touchEnd(surface, { changedTouches: [touch], touches: [] });
      act(() => vi.advanceTimersByTime(301));

      expect(player).toHaveAttribute("data-controls-visible", "true");
      expect(play).not.toHaveBeenCalled();
      expect(seek).not.toHaveBeenCalled();
    } finally {
      restoreMatchMedia();
    }
  });

  it("keeps a mobile long-press at 2× after the elevated label fades", async () => {
    const restoreMatchMedia = installCompactViewportMatchMedia();
    const engine = new FakeVideoEngine();
    const setPlaybackRate = vi.spyOn(engine, "setPlaybackRate");

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const player = screen.getByRole("region", { name: "Video player" });
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      const touch = { clientX: 75, clientY: 30, identifier: 17 };
      vi.useFakeTimers();

      fireEvent.touchStart(surface, {
        changedTouches: [touch],
        touches: [touch],
      });
      act(() => vi.advanceTimersByTime(500));

      expect(setPlaybackRate).toHaveBeenLastCalledWith(2);
      expect(player).toHaveAttribute("data-controls-visible", "false");
      expect(screen.getByRole("status")).toHaveAttribute(
        "data-player-hud-variant",
        "temporary-speed",
      );
      expect(screen.getByText("2× speed")).toHaveClass("top-[22%]");

      act(() => vi.advanceTimersByTime(850));
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
      expect(engine.getSnapshot().playbackRate).toBe(2);
      expect(player).toHaveAttribute("data-controls-visible", "false");

      fireEvent.touchEnd(surface, {
        changedTouches: [touch],
        touches: [],
      });
      expect(setPlaybackRate).toHaveBeenLastCalledWith(1);
      expect(player).toHaveAttribute("data-controls-visible", "true");
    } finally {
      restoreMatchMedia();
    }
  });

  it("uses desktop hover for controls and mouse clicks for playback", async () => {
    const restoreMatchMedia = installFinePointerMatchMedia();
    const engine = new FakeVideoEngine();
    const play = vi.spyOn(engine, "play");

    try {
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          emptyTapBehavior="responsive"
          controlsIdleDelay={5_000}
        />,
      );
      await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

      const player = screen.getByRole("region", { name: "Video player" });
      const playerPointerSurface = player.closest<HTMLElement>(".video-shell");
      expect(playerPointerSurface).not.toBeNull();
      const surface = screen.getByRole("button", {
        name: "Play or pause video; tap to show controls",
      });
      await waitFor(() =>
        expect(player).toHaveAttribute("data-controls-visible", "false"),
      );

      fireEvent.pointerEnter(playerPointerSurface!, { pointerType: "mouse" });
      expect(player).toHaveAttribute("data-controls-visible", "true");

      vi.useFakeTimers();
      fireEvent.pointerDown(surface, {
        clientX: 50,
        pointerId: 1,
        pointerType: "mouse",
      });
      fireEvent.pointerUp(surface, {
        clientX: 50,
        pointerId: 1,
        pointerType: "mouse",
      });
      await act(async () => {
        vi.advanceTimersByTime(301);
        await Promise.resolve();
      });
      expect(play).toHaveBeenCalledOnce();

      act(() => vi.advanceTimersByTime(5_100));
      expect(player).toHaveAttribute("data-controls-visible", "true");

      fireEvent.pointerMove(player, { pointerType: "mouse" });
      expect(player).toHaveAttribute("data-controls-visible", "true");
      fireEvent.pointerLeave(playerPointerSurface!, { pointerType: "mouse" });
      expect(player).toHaveAttribute("data-controls-visible", "false");

      act(() => engine.pause());
      fireEvent.pointerEnter(playerPointerSurface!, { pointerType: "mouse" });
      act(() => vi.advanceTimersByTime(5_100));
      expect(player).toHaveAttribute("data-controls-visible", "true");
      fireEvent.pointerLeave(playerPointerSurface!, { pointerType: "mouse" });
      expect(player).toHaveAttribute("data-controls-visible", "false");
    } finally {
      restoreMatchMedia();
    }
  });

  it("keeps controls visible while focus remains inside the player", async () => {
    const engine = new FakeVideoEngine();
    render(
      <>
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          keyboardEnabled={false}
          controlsIdleDelay={50}
        />
        <button type="button">Outside player</button>
      </>,
    );
    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

    vi.useFakeTimers();
    await act(async () => engine.play());
    const player = screen.getByRole("region", { name: "Video player" });
    const pauseButton = screen.getByRole("button", { name: "Pause" });
    act(() => pauseButton.focus());
    act(() => vi.advanceTimersByTime(100));
    expect(player).toHaveAttribute("data-controls-visible", "true");

    act(() => screen.getByRole("button", { name: "Outside player" }).focus());
    act(() => vi.advanceTimersByTime(100));
    expect(player).toHaveAttribute("data-controls-visible", "false");
  });

  it("fullscreens the presentation shell while keeping focus on the keyboard root", async () => {
    const engine = new FakeVideoEngine();
    const handle = createRef<VideoPlayerHandle>();
    const { container } = render(
      <VideoPlayer
        ref={handle}
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
      />,
    );
    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));

    const shell = container.querySelector<HTMLElement>(".video-shell");
    const keyboardRoot = screen.getByRole("region", { name: "Video player" });
    expect(shell).not.toBeNull();
    expect(shell).not.toBe(keyboardRoot);
    const requestFullscreen = vi.fn(async () => undefined);
    Object.assign(shell!, { requestFullscreen });

    const fullscreenButton = screen.getByRole("button", {
      name: "Toggle fullscreen",
    });
    expect(fullscreenButton.querySelector("svg")).toHaveStyle({
      transform: "rotate(90deg)",
    });

    fireEvent.click(fullscreenButton);
    await waitFor(() => expect(requestFullscreen).toHaveBeenCalledOnce());

    act(() => handle.current?.focus());
    expect(keyboardRoot).toHaveFocus();
    expect(shell).not.toHaveFocus();
  });

  it("forwards progress, ready, and normalized error events", async () => {
    const engine = new FakeVideoEngine(200);
    const onEvent = vi.fn();
    const onPlayerError = vi.fn();
    const onProgress = vi.fn();
    const onProgressChange = vi.fn();
    const onReady = vi.fn();

    render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
        onEvent={onEvent}
        onPlayerError={onPlayerError}
        onProgress={onProgress}
        onProgressChange={onProgressChange}
        onReady={onReady}
      />,
    );

    await waitFor(() => expect(onReady).toHaveBeenCalledWith(200));
    engine.emitTimeUpdate(50);
    expect(onProgress).toHaveBeenCalledWith({
      currentTime: 50,
      duration: 200,
      progress: 25,
    });
    expect(onProgressChange).toHaveBeenCalledWith(25);

    engine.emitError();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Your connection was interrupted while loading the video.",
    );
    expect(onPlayerError).toHaveBeenCalledWith(engine.getSnapshot().error);
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "error" }),
    );
  });
});
