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

vi.mock("@veolms/video-player", async () => {
  const React = await import("react");
  const VideoPlayer = React.forwardRef(
    (
      props: {
        ariaLabel: string;
        controls: React.ReactNode;
        onReady?: () => void;
      },
      ref: React.ForwardedRef<unknown>,
    ) => {
      React.useImperativeHandle(ref, () => ({
        getSnapshot: () => ({
          media: { currentTime: 42, playing: true },
        }),
        setPlaybackRate: vi.fn(),
      }));
      React.useEffect(() => props.onReady?.(), [props]);
      return (
        <div role="region" aria-label={props.ariaLabel}>
          {props.controls}
        </div>
      );
    },
  );
  VideoPlayer.displayName = "MockVideoPlayer";

  return {
    PlayButton: () => <button aria-label="Play" type="button" />,
    PlayerIconButton: ({
      label,
      onClick,
    }: {
      label: string;
      onClick: () => void;
    }) => <button aria-label={label} type="button" onClick={onClick} />,
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
});

describe("LearningMiniPlayer gestures", () => {
  it("moves freely and suppresses restore after a drag", () => {
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
    expect(miniPlayer.style.left).toBe("150px");
    expect(miniPlayer.style.top).toBe("250px");

    fireEvent.pointerUp(miniPlayer, {
      clientX: 250,
      clientY: 300,
      pointerId: 1,
      pointerType: "mouse",
    });
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
    expect(miniPlayer.style.width).toBe("192px");

    fireEvent.pointerMove(miniPlayer, {
      clientX: 550,
      clientY: 500,
      pointerId: 2,
      pointerType: "touch",
    });
    expect(miniPlayer.style.width).toBe("600px");

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
    expect(onClose).not.toHaveBeenCalled();
  });

  it("animates out and closes after a downward touch flick", () => {
    const { miniPlayer, onClose } = renderMiniPlayer();

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

    expect(miniPlayer).toHaveAttribute("data-mini-player-mode", "dismissing");
    expect(miniPlayer.style.transform).toContain("translate3d");
    expect(onClose).not.toHaveBeenCalled();

    act(() => vi.advanceTimersByTime(200));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
