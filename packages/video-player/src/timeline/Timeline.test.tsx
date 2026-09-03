import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialVideoEngineSnapshot } from "../core/snapshot";
import { PlayerControllerContext } from "../react/context";
import type { PlayerController } from "../react/PlayerController";
import {
  createInitialPlayerUiState,
  type PlayerSnapshot,
} from "../react/playerState";
import { Timeline } from "./Timeline";

afterEach(cleanup);

describe("Timeline", () => {
  it("renders progress metadata, chapter boundaries, buffered ranges, and markers", () => {
    const { actions, container } = renderTimeline();

    const slider = screen.getByRole("slider", { name: "Video timeline" });
    expect(slider).toHaveAttribute("aria-valuenow", "30");
    expect(slider).toHaveAttribute("aria-valuemax", "120");
    expect(slider).toHaveAttribute("aria-valuetext", "0:30 of 2:00");

    const marker = screen.getByRole("button", { name: "Quiz checkpoint" });
    expect(marker).toHaveStyle({ left: "75%" });
    fireEvent.click(marker);
    expect(actions.seekTo).toHaveBeenCalledWith(90);

    expect(container.querySelectorAll("span[aria-hidden='true']")).toHaveLength(
      2,
    );
    expect(container.querySelector("span[style*='width: 25%']")).toBeTruthy();
    expect(container.querySelector("[data-timeline-track]")).toBeTruthy();
    expect(container.querySelector("[data-timeline-visual]")).toHaveClass(
      "pointer-events-none",
      "absolute",
      "inset-0",
    );
    expect(
      container.querySelector("[data-timeline-buffered-range]"),
    ).toBeTruthy();
    expect(container.querySelector("[data-timeline-progress]")).toHaveClass(
      "bg-[var(--video-player-accent,#ff7a1a)]",
    );
    const thumb = container.querySelector("[data-timeline-thumb]");
    expect(thumb).toHaveClass(
      "bg-[var(--video-player-accent,#ff7a1a)]",
      "scale-100",
      "group-data-[controls-visible=true]/timeline:opacity-100",
      "group-hover/timeline:scale-[1.6]",
      "group-focus-within/timeline:scale-[1.6]",
      "group-data-[scrubbing=true]/timeline:scale-[1.6]",
      "transition-[scale,opacity]",
      "duration-200",
    );
    expect(thumb?.className).not.toContain("rgb(255_255_255");
  });

  it.each([
    [0, "0%", "0% -50%", "0% 50%"],
    [60, "50%", "-50% -50%", "50% 50%"],
    [120, "100%", "-100% -50%", "100% 50%"],
  ])(
    "keeps the timeline thumb inside the track at %i seconds",
    (currentTime, left, translate, transformOrigin) => {
      const { container } = renderTimeline({ currentTime });
      const thumb = container.querySelector<HTMLElement>(
        "[data-timeline-thumb]",
      );

      expect(thumb).toHaveStyle({ left, transformOrigin, translate });
    },
  );

  it("seeks with timeline-owned keyboard controls", () => {
    const { actions } = renderTimeline();
    const slider = screen.getByRole("slider", { name: "Video timeline" });

    fireEvent.keyDown(slider, { key: "ArrowRight" });
    fireEvent.keyDown(slider, { key: "PageUp" });
    fireEvent.keyDown(slider, { key: "Home" });
    fireEvent.keyDown(slider, { key: "End" });

    expect(actions.seekTo.mock.calls).toEqual([[35], [42], [0], [120]]);
  });

  it("maps pointer scrubbing to the custom track without a native range input", () => {
    const { actions } = renderTimeline();
    const slider = screen.getByRole("slider", { name: "Video timeline" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      bottom: 24,
      height: 24,
      left: 100,
      right: 300,
      top: 0,
      width: 200,
      x: 100,
      y: 0,
      toJSON: () => ({}),
    });
    Object.assign(slider, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });

    fireEvent.pointerDown(slider, {
      pointerId: 7,
      pointerType: "mouse",
      clientX: 200,
    });
    fireEvent.pointerMove(slider, {
      pointerId: 7,
      pointerType: "mouse",
      clientX: 250,
    });
    fireEvent.pointerUp(slider, {
      pointerId: 7,
      pointerType: "mouse",
      clientX: 250,
    });

    expect(actions.setScrubbing).toHaveBeenNthCalledWith(1, true);
    expect(actions.seekTo).toHaveBeenCalledWith(60);
    expect(actions.seekTo).toHaveBeenCalledWith(90);
    expect(actions.setScrubbing).toHaveBeenLastCalledWith(false);
  });

  it("keeps a time-only preview compact and translucent", () => {
    const { container } = renderTimeline({
      chapters: [],
      previewTime: 45,
      showPreview: true,
    });

    const preview = container.querySelector<HTMLElement>(
      '[data-video-player-preview-mode="time"]',
    );
    expect(preview).toHaveClass(
      "w-max",
      "max-w-[calc(100vw-1rem)]",
      "rounded-full",
      "mb-2.5",
    );
    expect(preview?.className).toContain(
      "bg-[color-mix(in_srgb,#05070b_64%,var(--video-player-accent,#ff7a1a)_4%)]",
    );
    expect(preview?.firstElementChild).toHaveClass("px-2.5", "py-1.5");
    expect(preview).toHaveTextContent("0:45");
  });

  it("clears the preview when a touch seek ends", () => {
    const { actions } = renderTimeline();
    const slider = screen.getByRole("slider", { name: "Video timeline" });
    vi.spyOn(slider, "getBoundingClientRect").mockReturnValue({
      bottom: 24,
      height: 24,
      left: 0,
      right: 200,
      top: 0,
      width: 200,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    Object.assign(slider, {
      setPointerCapture: vi.fn(),
      hasPointerCapture: vi.fn(() => true),
      releasePointerCapture: vi.fn(),
    });

    fireEvent.pointerDown(slider, {
      clientX: 100,
      pointerId: 8,
      pointerType: "touch",
    });
    fireEvent.pointerUp(slider, {
      clientX: 100,
      pointerId: 8,
      pointerType: "touch",
    });

    expect(actions.setPreviewTime).toHaveBeenLastCalledWith(null);
    expect(actions.setScrubbing).toHaveBeenLastCalledWith(false);
  });
});

function renderTimeline({
  chapters = [
    { id: "intro", title: "Introduction", startTime: 0, endTime: 60 },
    { id: "details", title: "Details", startTime: 60, endTime: 120 },
  ],
  currentTime = 30,
  previewTime = null,
  showPreview = false,
}: {
  chapters?: PlayerSnapshot["chapters"];
  currentTime?: number;
  previewTime?: number | null;
  showPreview?: boolean;
} = {}) {
  const snapshot: PlayerSnapshot = {
    media: {
      ...createInitialVideoEngineSnapshot(),
      lifecycle: "ready",
      currentTime,
      duration: 120,
      buffered: [{ start: 0, end: 30 }],
    },
    capabilities: {
      browserSupported: true,
      adaptiveStreaming: true,
      drm: false,
      nativeHls: false,
      pictureInPicture: false,
    },
    ui: { ...createInitialPlayerUiState(), previewTime },
    chapters,
    activeChapterId: "intro",
    storyboard: [],
    markers: [{ id: "quiz", type: "quiz", label: "Quiz checkpoint", time: 90 }],
  };
  const actions = {
    seekTo: vi.fn<(time: number) => void>(),
    setControlsVisible: vi.fn<(visible: boolean) => void>(),
    setPreviewTime: vi.fn<(time: number | null) => void>(),
    setScrubbing: vi.fn<(scrubbing: boolean) => void>(),
  };
  const controller = {
    ...actions,
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
  } as unknown as PlayerController;

  return {
    ...render(
      <PlayerControllerContext.Provider value={controller}>
        <Timeline showPreview={showPreview} />
      </PlayerControllerContext.Provider>,
    ),
    actions,
  };
}
