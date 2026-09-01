import { render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PersistentLearningPlayerHost,
  type PersistentLearningPlayerRegistration,
} from "../../src/learning/player/PersistentLearningPlayerHost.js";

const playerLifecycle = vi.hoisted(() => ({
  load: vi.fn<(mediaKey: string) => void>(),
  mount: vi.fn(),
  pause: vi.fn(),
  unmount: vi.fn(),
}));

vi.mock("../../src/learning/player/LessonVideoPlayer.js", () => ({
  LessonVideoPlayer: ({
    media,
    presentation,
  }: {
    media: { fileName: string };
    presentation: "full" | "mini";
  }) => {
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
  playerLifecycle.mount.mockClear();
  playerLifecycle.pause.mockClear();
  playerLifecycle.unmount.mockClear();
});

describe("PersistentLearningPlayerHost", () => {
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
    expect(host).not.toHaveClass("bg-black");
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
});
