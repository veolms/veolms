import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PersistentLearningPlayerHost,
  type PersistentLearningPlayerRegistration,
} from "../../src/learning/player/PersistentLearningPlayerHost.js";

const playerLifecycle = vi.hoisted(() => ({
  load: vi.fn<(mediaKey: string) => void>(),
  minimizeGestureStart: null as (() => void) | null,
  mount: vi.fn(),
  pause: vi.fn(),
  unmount: vi.fn(),
}));

vi.mock("../../src/learning/player/LessonVideoPlayer.js", () => ({
  LessonVideoPlayer: ({
    media,
    onMinimizeGestureStart,
    presentation,
  }: {
    media: { fileName: string };
    onMinimizeGestureStart?: () => void;
    presentation: "full" | "mini";
  }) => {
    playerLifecycle.minimizeGestureStart = onMinimizeGestureStart ?? null;
    useEffect(() => {
      playerLifecycle.mount();
      playerLifecycle.load(media.fileName);
      return () => {
        playerLifecycle.pause();
        playerLifecycle.unmount();
      };
    }, [media.fileName]);

    return (
      <video
        data-testid="persistent-learning-video"
        data-presentation={presentation}
      />
    );
  },
}));

vi.mock("../../src/learning/player/useLearningMiniPlayerGestures.js", () => ({
  useLearningMiniPlayerGestures: () => ({
    gestureProps: {},
    mode: "idle",
    style: {},
  }),
}));

const createRegistration = (): PersistentLearningPlayerRegistration => {
  const anchor = document.createElement("div");
  vi.spyOn(anchor, "getBoundingClientRect").mockReturnValue({
    bottom: 360,
    height: 360,
    left: 0,
    right: 640,
    top: 0,
    width: 640,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  } as DOMRect);

  return {
    anchor,
    courseRouteKey: "backend-nodejs",
    lessonPath: "/learn/backend-nodejs/career-opportunities",
    mediaKey: "career-opportunities.mp4",
    playerProps: {
      lessonTitle: "Career Opportunities",
      media: {
        duration: 8_742,
        fileName: "career-opportunities.mp4",
        src: "/course-hls/career-opportunities/master.m3u8",
      },
      onTheaterToggle: vi.fn(),
      theaterMode: false,
    },
    returnPath: "/courses",
  };
};

beforeEach(() => {
  playerLifecycle.load.mockClear();
  playerLifecycle.minimizeGestureStart = null;
  playerLifecycle.mount.mockClear();
  playerLifecycle.pause.mockClear();
  playerLifecycle.unmount.mockClear();
});

describe("PersistentLearningPlayerHost", () => {
  it("renders inside the existing main scrollport so clipping and wheel scrolling stay native", () => {
    const player = createRegistration();
    const mainScrollport = document.createElement("main");
    mainScrollport.className = "courses-main courses-main--learning";
    mainScrollport.append(player.anchor!);
    document.body.append(mainScrollport);
    Object.defineProperties(mainScrollport, {
      clientHeight: { configurable: true, value: 400 },
      scrollHeight: { configurable: true, value: 1_000 },
      scrollTop: { configurable: true, value: 0, writable: true },
    });
    const wheelListener = vi.fn();
    mainScrollport.addEventListener("wheel", wheelListener);

    const { container, unmount } = render(
      <PersistentLearningPlayerHost
        player={player}
        presentation="full"
        onClose={vi.fn()}
        onRestore={vi.fn()}
      />,
    );

    const host = mainScrollport.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    );
    expect(host).not.toBeNull();
    expect(container).not.toContainElement(host);

    fireEvent.wheel(screen.getByTestId("persistent-learning-video"), {
      deltaY: 120,
    });
    expect(wheelListener).toHaveBeenCalledOnce();
    expect(mainScrollport.scrollTop).toBe(120);

    const video = screen.getByTestId("persistent-learning-video");
    video.setAttribute("data-player-mobile-interaction", "true");
    fireEvent.wheel(video, { deltaY: 120 });
    expect(mainScrollport.scrollTop).toBe(120);

    unmount();
    mainScrollport.remove();
  });

  it("keeps one mounted video while the same registration changes presentation", () => {
    const player = createRegistration();
    const props = {
      onClose: vi.fn(),
      onRestore: vi.fn(),
      player,
    };
    const { container, rerender, unmount } = render(
      <PersistentLearningPlayerHost {...props} presentation="full" />,
    );

    const host = container.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    )!;
    const originalVideo = screen.getByTestId("persistent-learning-video");
    expect(host).toHaveClass("bg-transparent");
    expect(host).not.toHaveClass("[&_.youtube-player]:rounded-none");
    expect(host).toHaveClass("learning-persistent-player--full");
    expect(host).not.toHaveClass("fixed");
    expect(host).not.toHaveClass("bg-black");
    expect(host.style.top).toBe("");
    expect(host.style.left).toBe("");
    expect(host.style.width).toBe("");
    expect(host.style.height).toBe("");
    expect(host.style.borderRadius).toBe("");
    expect(originalVideo).toHaveAttribute("data-presentation", "full");
    expect(screen.getAllByTestId("persistent-learning-video")).toHaveLength(1);
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.load).toHaveBeenCalledOnce();
    expect(playerLifecycle.load).toHaveBeenCalledWith(player.mediaKey);

    rerender(<PersistentLearningPlayerHost {...props} presentation="mini" />);

    expect(host).toHaveClass("bg-black");
    expect(host).not.toHaveClass("bg-transparent");
    expect(screen.getByTestId("persistent-learning-video")).toBe(originalVideo);
    expect(originalVideo).toHaveAttribute("data-presentation", "mini");
    expect(screen.getAllByTestId("persistent-learning-video")).toHaveLength(1);
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.unmount).not.toHaveBeenCalled();
    expect(playerLifecycle.pause).not.toHaveBeenCalled();
    expect(playerLifecycle.load).toHaveBeenCalledOnce();

    rerender(<PersistentLearningPlayerHost {...props} presentation="full" />);

    expect(host).toHaveClass("bg-transparent");
    expect(host).not.toHaveClass("bg-black");
    expect(screen.getByTestId("persistent-learning-video")).toBe(originalVideo);
    expect(originalVideo).toHaveAttribute("data-presentation", "full");
    expect(screen.getAllByTestId("persistent-learning-video")).toHaveLength(1);
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.unmount).not.toHaveBeenCalled();
    expect(playerLifecycle.pause).not.toHaveBeenCalled();
    expect(playerLifecycle.load).toHaveBeenCalledOnce();

    unmount();
    expect(playerLifecycle.unmount).toHaveBeenCalledOnce();
    expect(playerLifecycle.pause).toHaveBeenCalledOnce();
  });

  it("animates mini back to its anchor without replacing the video", () => {
    const player = createRegistration();
    const props = {
      onClose: vi.fn(),
      onRestore: vi.fn(),
      player,
    };
    let restoreFrame: FrameRequestCallback | null = null;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      restoreFrame = callback;
      return 17;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container, rerender } = render(
      <PersistentLearningPlayerHost {...props} presentation="full" />,
    );
    const host = container.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    )!;
    const originalVideo = screen.getByTestId("persistent-learning-video");
    vi.spyOn(host, "getBoundingClientRect")
      .mockReturnValueOnce({
        bottom: 800,
        height: 180,
        left: 48,
        right: 368,
        top: 620,
        width: 320,
        x: 48,
        y: 620,
        toJSON: () => ({}),
      } as DOMRect)
      .mockReturnValueOnce({
        bottom: 360,
        height: 360,
        left: 0,
        right: 640,
        top: 0,
        width: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

    rerender(<PersistentLearningPlayerHost {...props} presentation="mini" />);
    rerender(<PersistentLearningPlayerHost {...props} presentation="full" />);

    expect(screen.getByTestId("persistent-learning-video")).toBe(originalVideo);
    expect(originalVideo).toHaveAttribute("data-presentation", "full");
    expect(host).toHaveAttribute(
      "data-learning-player-restore-phase",
      "expanding",
    );
    expect(host.style.borderRadius).toBe("13px");
    expect(host.style.transform).toBe(
      "translate3d(48.000px, 620.000px, 0) scale(0.50000)",
    );
    expect(host.style.transition).toBe("none");
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.pause).not.toHaveBeenCalled();
    expect(playerLifecycle.unmount).not.toHaveBeenCalled();

    act(() => restoreFrame?.(performance.now()));

    expect(host.style.transform).toBe("translate3d(0, 0, 0) scale(1)");
    expect(host.style.transition).toContain("transform 300ms");
    expect(screen.getByTestId("persistent-learning-video")).toBe(originalVideo);

    fireEvent.transitionEnd(host, { propertyName: "transform" });

    expect(host).not.toHaveAttribute("data-learning-player-restore-phase");
    expect(host.style.borderRadius).toBe("");
    expect(host.style.transform).toBe("");
    expect(screen.getByTestId("persistent-learning-video")).toBe(originalVideo);
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.pause).not.toHaveBeenCalled();
    expect(playerLifecycle.unmount).not.toHaveBeenCalled();
  });

  it("finishes an in-flight restore before a new minimize gesture starts", () => {
    const player = createRegistration();
    const props = {
      onClose: vi.fn(),
      onRestore: vi.fn(),
      player,
    };
    vi.spyOn(window, "requestAnimationFrame").mockImplementation(() => 23);
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    const { container, rerender } = render(
      <PersistentLearningPlayerHost {...props} presentation="full" />,
    );
    const host = container.querySelector<HTMLElement>(
      "[data-learning-persistent-player]",
    )!;
    vi.spyOn(host, "getBoundingClientRect")
      .mockReturnValueOnce({
        bottom: 800,
        height: 180,
        left: 48,
        right: 368,
        top: 620,
        width: 320,
        x: 48,
        y: 620,
        toJSON: () => ({}),
      } as DOMRect)
      .mockReturnValueOnce({
        bottom: 360,
        height: 360,
        left: 0,
        right: 640,
        top: 0,
        width: 640,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      } as DOMRect);

    rerender(<PersistentLearningPlayerHost {...props} presentation="mini" />);
    rerender(<PersistentLearningPlayerHost {...props} presentation="full" />);

    expect(host).toHaveAttribute(
      "data-learning-player-restore-phase",
      "expanding",
    );

    act(() => playerLifecycle.minimizeGestureStart?.());

    expect(host).not.toHaveAttribute("data-learning-player-restore-phase");
    expect(host.style.transform).toBe("");
    expect(host.style.transition).toBe("");
    expect(playerLifecycle.mount).toHaveBeenCalledOnce();
    expect(playerLifecycle.pause).not.toHaveBeenCalled();
    expect(playerLifecycle.unmount).not.toHaveBeenCalled();
  });
});
