import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LearningMiniPlayer } from "../../src/learning/player/LearningMiniPlayer.js";
import type { LearningMiniPlayerSession } from "../../src/learning/player/learningMiniPlayerTypes.js";

const videoPlayerMock = vi.hoisted(() => ({
  currentTime: 42,
  emitPlayingOnPlay: true,
  onEvent: null as ((event: { detail?: unknown; type: string }) => void) | null,
  play: vi.fn<() => Promise<void>>(),
  seekTo: vi.fn<(time: number) => void>(),
  setMuted: vi.fn<(muted: boolean) => void>(),
  setVolume: vi.fn<(volume: number) => void>(),
  waitForPresentedFrame: vi.fn<() => Promise<void>>(),
}));

vi.mock("@veolms/video-player", async () => {
  const React = await import("react");
  const VideoPlayer = React.forwardRef(
    (
      props: {
        ariaLabel: string;
        controls: React.ReactNode;
        onEvent?: (event: { detail?: unknown; type: string }) => void;
        onReady?: () => void;
        zoomEnabled?: boolean;
      },
      ref: React.ForwardedRef<unknown>,
    ) => {
      videoPlayerMock.onEvent = props.onEvent ?? null;
      React.useImperativeHandle(ref, () => ({
        getSnapshot: () => ({
          media: {
            currentTime: videoPlayerMock.currentTime,
            muted: false,
            playbackRate: 1,
            playing: true,
            volume: 1,
          },
        }),
        play: videoPlayerMock.play,
        seekTo: videoPlayerMock.seekTo,
        setMuted: videoPlayerMock.setMuted,
        setPlaybackRate: vi.fn(),
        setVolume: videoPlayerMock.setVolume,
        waitForPresentedFrame: videoPlayerMock.waitForPresentedFrame,
      }));
      React.useEffect(() => {
        void props.onReady?.();
      }, [props]);
      return (
        <div
          role="region"
          aria-label={props.ariaLabel}
          data-content-zoom-enabled={props.zoomEnabled !== false}
        >
          {props.controls}
        </div>
      );
    },
  );
  VideoPlayer.displayName = "MockVideoPlayer";

  return {
    PlayButton: ({
      className,
      iconSize,
    }: {
      className?: string;
      iconSize?: number;
    }) => (
      <button
        aria-label="Play"
        className={className}
        data-icon-size={iconSize}
        type="button"
      />
    ),
    PlayerIconButton: ({
      className,
      label,
      onClick,
    }: {
      className?: string;
      label: string;
      onClick: () => void;
    }) => (
      <button
        aria-label={label}
        className={className}
        type="button"
        onClick={onClick}
      />
    ),
    VideoPlayer,
    usePlayerTheme: () => ({
      icons: { close: () => <svg aria-hidden="true" /> },
    }),
  };
});

vi.mock("../../src/learning/player/useLearningPlayerTheme.js", () => ({
  useLearningPlayerTheme: () => ({ id: "youtube" }),
}));

const session: LearningMiniPlayerSession = {
  currentTime: 42,
  lessonPath: "/learn/backend-nodejs/career-opportunities",
  lessonTitle: "Career Opportunities",
  mediaKey: "career-opportunities.mp4",
  muted: false,
  playbackRate: 1,
  playing: true,
  returnPath: "/courses/backend-nodejs/overview",
  source: {
    id: "career-opportunities.mp4",
    kind: "hls",
    src: "/course-hls/career-opportunities/master.m3u8",
  },
  volume: 1,
};

const miniPlayerRect = {
  bottom: 618.75,
  height: 168.75,
  left: 300,
  right: 600,
  top: 450,
  width: 300,
  x: 300,
  y: 450,
  toJSON: () => ({}),
};

function renderMiniPlayer() {
  const onClose = vi.fn();
  const onRestore = vi.fn();
  render(
    <LearningMiniPlayer
      session={session}
      onClose={onClose}
      onRestore={onRestore}
    />,
  );
  const miniPlayer = screen.getByRole("complementary", {
    name: "Mini player for Career Opportunities",
  });
  Object.assign(miniPlayer, {
    hasPointerCapture: vi.fn(() => true),
    releasePointerCapture: vi.fn(),
    setPointerCapture: vi.fn(),
  });
  return { miniPlayer, onClose, onRestore };
}

beforeEach(() => {
  vi.useFakeTimers();
  videoPlayerMock.emitPlayingOnPlay = true;
  videoPlayerMock.currentTime = 42;
  videoPlayerMock.onEvent = null;
  videoPlayerMock.play.mockReset();
  videoPlayerMock.play.mockImplementation(async () => {
    if (videoPlayerMock.emitPlayingOnPlay) {
      videoPlayerMock.onEvent?.({ type: "playing" });
    }
  });
  videoPlayerMock.seekTo.mockReset();
  videoPlayerMock.seekTo.mockImplementation((time) => {
    videoPlayerMock.currentTime = time;
  });
  videoPlayerMock.setMuted.mockReset();
  videoPlayerMock.setVolume.mockReset();
  videoPlayerMock.waitForPresentedFrame.mockReset();
  videoPlayerMock.waitForPresentedFrame.mockResolvedValue();
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: 619,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: 779,
  });
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-learning-mini-player")) {
        return miniPlayerRect as DOMRect;
      }
      return {
        ...miniPlayerRect,
        bottom: 0,
        height: 0,
        left: 0,
        right: 0,
        top: 0,
        width: 0,
        x: 0,
        y: 0,
      } as DOMRect;
    },
  );
});

afterEach(() => {
  cleanup();
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  document
    .querySelectorAll(".mobile-bottom-nav")
    .forEach((node) => node.remove());
});

describe("LearningMiniPlayer gestures", () => {
  it("keeps the current player active until a prepared frame is presented", async () => {
    videoPlayerMock.emitPlayingOnPlay = false;
    let presentFrame: (() => void) | undefined;
    videoPlayerMock.waitForPresentedFrame.mockReturnValue(
      new Promise<void>((resolve) => {
        presentFrame = resolve;
      }),
    );
    const getLivePlaybackSnapshot = vi.fn(() => ({
      currentTime: 57,
      muted: false,
      playbackRate: 1.5,
      playing: true,
      volume: 0.65,
    }));
    const preparePlaybackHandoff = vi.fn();
    const onPrepared = vi.fn();

    render(
      <LearningMiniPlayer
        session={{
          ...session,
          getLivePlaybackSnapshot,
          preparePlaybackHandoff,
        }}
        onClose={vi.fn()}
        onPrepared={onPrepared}
        onRestore={vi.fn()}
        preparing
      />,
    );

    expect(
      screen.getByRole("complementary", {
        name: "Mini player for Career Opportunities",
      }),
    ).toHaveAttribute("data-mini-player-preparing", "true");
    await act(async () => {
      await Promise.resolve();
    });
    expect(onPrepared).not.toHaveBeenCalled();
    expect(preparePlaybackHandoff).not.toHaveBeenCalled();

    act(() => videoPlayerMock.onEvent?.({ type: "playing" }));

    expect(videoPlayerMock.waitForPresentedFrame).toHaveBeenCalledOnce();
    expect(onPrepared).not.toHaveBeenCalled();
    expect(preparePlaybackHandoff).not.toHaveBeenCalled();

    await act(async () => {
      presentFrame?.();
      await Promise.resolve();
    });

    expect(videoPlayerMock.setVolume).toHaveBeenLastCalledWith(0.65);
    expect(videoPlayerMock.setMuted).toHaveBeenLastCalledWith(false);
    expect(onPrepared).toHaveBeenCalledOnce();
    expect(getLivePlaybackSnapshot).toHaveBeenCalled();
    expect(preparePlaybackHandoff).toHaveBeenCalledOnce();
  });

  it("moves freely, then docks to the nearest corner and suppresses restore", () => {
    const { miniPlayer, onClose, onRestore } = renderMiniPlayer();

    fireEvent.pointerDown(miniPlayer, {
      button: 0,
      clientX: 400,
      clientY: 500,
      pointerId: 1,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 250,
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "dragging");
    expect(miniPlayer.style.left).toBe("147.5px");
    expect(miniPlayer.style.top).toBe("392.90625px");

    fireEvent.pointerUp(miniPlayer, {
      clientX: 250,
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });
    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "settling");
    expect(miniPlayer.style.left).toBe("12px");
    expect(miniPlayer.style.top).toBe("592.90625px");
    fireEvent.click(
      screen.getByRole("button", { name: "Return to Career Opportunities" }),
    );
    expect(onRestore).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.runOnlyPendingTimers());
    fireEvent.click(
      screen.getByRole("button", { name: "Return to Career Opportunities" }),
    );
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("pinches smaller and larger around the gesture midpoint", () => {
    const { miniPlayer, onClose } = renderMiniPlayer();

    expect(
      screen.getByRole("region", {
        name: "Mini player video for Career Opportunities",
      }),
    ).toHaveAttribute("data-content-zoom-enabled", "false");

    fireEvent.pointerDown(miniPlayer, {
      clientX: 350,
      clientY: 500,
      pointerId: 1,
      pointerType: "touch",
    });
    fireEvent.pointerDown(miniPlayer, {
      clientX: 450,
      clientY: 500,
      pointerId: 2,
      pointerType: "touch",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 400,
      clientY: 500,
      pointerId: 2,
      pointerType: "touch",
    });

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "resizing");
    expect(miniPlayer.style.width).toBe("309.5px");

    fireEvent.pointerMove(miniPlayer, {
      clientX: 550,
      clientY: 500,
      pointerId: 2,
      pointerType: "touch",
    });
    expect(miniPlayer.style.width).toBe("619px");

    fireEvent.pointerUp(miniPlayer, {
      clientX: 550,
      clientY: 500,
      pointerId: 2,
      pointerType: "touch",
    });
    fireEvent.pointerUp(miniPlayer, {
      clientX: 350,
      clientY: 500,
      pointerId: 1,
      pointerType: "touch",
    });
    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "settling");
    expect(miniPlayer.style.width).toBe("595px");
    expect(miniPlayer.style.left).toBe("12px");
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(240));
    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "idle");
  });

  it("moves beneath mobile navigation while dragging and settles 12px above it", () => {
    const mobileNavigation = document.createElement("nav");
    mobileNavigation.className = "mobile-bottom-nav";
    document.body.appendChild(mobileNavigation);
    vi.spyOn(mobileNavigation, "getBoundingClientRect").mockReturnValue({
      bottom: 779,
      height: 79,
      left: 0,
      right: 619,
      top: 700,
      width: 619,
      x: 0,
      y: 700,
      toJSON: () => ({}),
    } as DOMRect);
    const { miniPlayer } = renderMiniPlayer();

    fireEvent.pointerDown(miniPlayer, {
      button: 0,
      clientX: 400,
      clientY: 500,
      pointerId: 3,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 400,
      clientY: 800,
      pointerId: 3,
      pointerType: "mouse",
    });

    const liveBottom =
      Number.parseFloat(miniPlayer.style.top) +
      Number.parseFloat(miniPlayer.style.width) / (16 / 9);
    expect(liveBottom).toBeGreaterThan(700);

    fireEvent.pointerUp(miniPlayer, {
      clientX: 400,
      clientY: 800,
      pointerId: 3,
      pointerType: "mouse",
    });

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "settling");
    const settledBottom =
      Number.parseFloat(miniPlayer.style.top) +
      Number.parseFloat(miniPlayer.style.width) / (16 / 9);
    expect(settledBottom).toBeCloseTo(688);
  });

  it("places matching compact play and close controls in the top corners", () => {
    const { miniPlayer } = renderMiniPlayer();
    const playButton = screen.getByRole("button", { name: "Play" });
    const closeButton = screen.getByRole("button", {
      name: "Close mini player",
    });

    expect(miniPlayer).toHaveClass("z-130");
    expect(playButton.parentElement).toHaveClass("left-1", "top-1");
    expect(playButton).toHaveClass("!size-9");
    expect(playButton).toHaveAttribute("data-icon-size", "20");
    expect(closeButton).toHaveClass("!size-9");
  });

  it("keeps stationary mouse clicks targeted at restore and close controls", () => {
    const { miniPlayer, onClose, onRestore } = renderMiniPlayer();
    const restoreButton = screen.getByRole("button", {
      name: "Return to Career Opportunities",
    });
    const closeButton = screen.getByRole("button", {
      name: "Close mini player",
    });

    fireEvent.pointerDown(restoreButton, {
      button: 0,
      clientX: 420,
      clientY: 520,
      pointerId: 21,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(restoreButton, {
      button: 0,
      clientX: 420,
      clientY: 520,
      pointerId: 21,
      pointerType: "mouse",
    });
    fireEvent.click(restoreButton);

    expect(miniPlayer.setPointerCapture).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledOnce();

    fireEvent.pointerDown(closeButton, {
      button: 0,
      clientX: 580,
      clientY: 470,
      pointerId: 22,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(closeButton, {
      button: 0,
      clientX: 580,
      clientY: 470,
      pointerId: 22,
      pointerType: "mouse",
    });
    fireEvent.click(closeButton);

    expect(miniPlayer.setPointerCapture).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("keeps a stationary touch tap targeted at the restore control", () => {
    const { miniPlayer, onRestore } = renderMiniPlayer();
    const restoreButton = screen.getByRole("button", {
      name: "Return to Career Opportunities",
    });

    fireEvent.pointerDown(restoreButton, {
      clientX: 420,
      clientY: 520,
      isPrimary: true,
      pointerId: 23,
      pointerType: "touch",
    });
    fireEvent.pointerUp(restoreButton, {
      clientX: 420,
      clientY: 520,
      isPrimary: true,
      pointerId: 23,
      pointerType: "touch",
    });
    expect(onRestore).not.toHaveBeenCalled();

    fireEvent.click(restoreButton);

    expect(miniPlayer.setPointerCapture).not.toHaveBeenCalled();
    expect(onRestore).toHaveBeenCalledOnce();
  });

  it("captures touch only after dragging and suppresses the restore click", () => {
    const { miniPlayer, onRestore } = renderMiniPlayer();
    const restoreButton = screen.getByRole("button", {
      name: "Return to Career Opportunities",
    });

    fireEvent.pointerDown(restoreButton, {
      clientX: 420,
      clientY: 520,
      isPrimary: true,
      pointerId: 24,
      pointerType: "touch",
    });
    expect(miniPlayer.setPointerCapture).not.toHaveBeenCalled();

    fireEvent.pointerMove(restoreButton, {
      clientX: 440,
      clientY: 550,
      isPrimary: true,
      pointerId: 24,
      pointerType: "touch",
    });
    expect(miniPlayer.setPointerCapture).toHaveBeenCalledWith(24);

    fireEvent.pointerUp(miniPlayer, {
      clientX: 440,
      clientY: 550,
      isPrimary: true,
      pointerId: 24,
      pointerType: "touch",
    });
    fireEvent.click(restoreButton);

    expect(onRestore).not.toHaveBeenCalled();
  });

  it("docks the first downward swipe and closes only from the downmost position", () => {
    const { miniPlayer, onClose } = renderMiniPlayer();

    fireEvent.pointerDown(miniPlayer, {
      button: 0,
      clientX: 420,
      clientY: 500,
      pointerId: 6,
      pointerType: "mouse",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 420,
      clientY: 100,
      pointerId: 6,
      pointerType: "mouse",
    });
    fireEvent.pointerUp(miniPlayer, {
      clientX: 420,
      clientY: 100,
      pointerId: 6,
      pointerType: "mouse",
    });
    act(() => vi.advanceTimersByTime(240));

    fireEvent.pointerDown(miniPlayer, {
      clientX: 420,
      clientY: 300,
      pointerId: 7,
      pointerType: "touch",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 424,
      clientY: 420,
      pointerId: 7,
      pointerType: "touch",
    });
    fireEvent.pointerUp(miniPlayer, {
      clientX: 426,
      clientY: 460,
      pointerId: 7,
      pointerType: "touch",
    });

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "settling");
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(240));
    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "idle");

    fireEvent.pointerDown(miniPlayer, {
      clientX: 420,
      clientY: 300,
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.pointerMove(miniPlayer, {
      clientX: 420,
      clientY: 360,
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.pointerUp(miniPlayer, {
      clientX: 420,
      clientY: 380,
      pointerId: 8,
      pointerType: "touch",
    });

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "dismissing");
    expect(miniPlayer.style.transform).toContain("translate3d");
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
