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
import { PlayerMedia } from "./PlayerMedia";
import { PlayerRoot, type VideoPlayerHandle } from "./PlayerRoot";
import { VideoPlayer } from "./VideoPlayer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const source = {
  id: "lesson-1",
  src: "/lesson.mp4",
  kind: "file" as const,
  metadata: { title: "Testing the player" },
};

describe("VideoPlayer integration", () => {
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
    const renderRoot = (nextSource: VideoSource, startTime: number) => (
      <PlayerRoot
        source={nextSource}
        loadOptions={{ startTime, mimeType: "video/mp4" }}
        engineFactory={() => engine}
      >
        <PlayerMedia />
      </PlayerRoot>
    );

    const { rerender } = render(renderRoot(createSource(), 4));
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));

    rerender(renderRoot(createSource(), 4));
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

  it("double taps either side using the configured seek interval", async () => {
    const engine = new FakeVideoEngine();
    const seek = vi.spyOn(engine, "seek");
    render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        seekIntervalSeconds={20}
      />,
    );

    await waitFor(() => expect(engine.getSnapshot().lifecycle).toBe("ready"));
    engine.setSnapshot({ currentTime: 30 });
    const surface = screen.getByRole("button", { name: "Play or pause video" });
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
    expect(screen.getByText("+20 seconds")).toBeVisible();

    act(() => {
      vi.advanceTimersByTime(350);
      tap(25);
      vi.advanceTimersByTime(100);
      tap(25);
    });
    expect(seek).toHaveBeenLastCalledWith(30);
    expect(screen.getByText("−20 seconds")).toBeVisible();
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
