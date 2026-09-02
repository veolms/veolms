import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialVideoEngineSnapshot } from "../core/snapshot";
import type { PlayerController } from "../react/PlayerController";
import { PlayerControllerContext } from "../react/context";
import {
  createInitialPlayerUiState,
  type PlayerSnapshot,
} from "../react/playerState";
import { VolumeControl } from "./VolumeControl";

afterEach(cleanup);

describe("VolumeControl mouse wheel", () => {
  it("raises and lowers volume in five-percent steps without scrolling the page", () => {
    const { setVolume } = renderVolumeControl({ volume: 0.5 });
    const slider = screen.getByRole("slider", { name: "Volume" });

    const wheelUp = createWheelEvent(-100);
    fireEvent(slider, wheelUp);
    expect(wheelUp.defaultPrevented).toBe(true);
    expect(setVolume).toHaveBeenLastCalledWith(0.55);

    const wheelDown = createWheelEvent(100);
    fireEvent(slider, wheelDown);
    expect(wheelDown.defaultPrevented).toBe(true);
    expect(setVolume).toHaveBeenLastCalledWith(0.45);
  });

  it("restores volume from zero when scrolling up while muted", () => {
    const { setVolume } = renderVolumeControl({ muted: true, volume: 0.7 });

    fireEvent(
      screen.getByRole("slider", { name: "Volume" }),
      createWheelEvent(-100),
    );

    expect(setVolume).toHaveBeenCalledWith(0.05);
  });
});

function createWheelEvent(deltaY: number) {
  return new WheelEvent("wheel", {
    bubbles: true,
    cancelable: true,
    deltaY,
  });
}

function renderVolumeControl({
  muted = false,
  volume,
}: {
  muted?: boolean;
  volume: number;
}) {
  const snapshot: PlayerSnapshot = {
    media: {
      ...createInitialVideoEngineSnapshot(),
      muted,
      volume,
    },
    capabilities: {
      browserSupported: true,
      adaptiveStreaming: true,
      drm: false,
      nativeHls: false,
      pictureInPicture: true,
    },
    ui: createInitialPlayerUiState(),
    chapters: [],
    activeChapterId: null,
    storyboard: [],
    markers: [],
  };
  const setVolume = vi.fn<(volume: number) => void>();
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    setVolume,
  } as unknown as PlayerController;

  render(
    <PlayerControllerContext.Provider value={controller}>
      <VolumeControl collapsible />
    </PlayerControllerContext.Provider>,
  );

  return { setVolume };
}
