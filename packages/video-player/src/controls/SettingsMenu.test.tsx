import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialVideoEngineSnapshot } from "../core/snapshot";
import type { PlayerController } from "../react/PlayerController";
import { PlayerControllerContext } from "../react/context";
import {
  createInitialPlayerUiState,
  type PlayerSnapshot,
} from "../react/playerState";
import { SettingsMenu } from "./SettingsMenu";

afterEach(cleanup);

describe("SettingsMenu playback speed", () => {
  it("includes the 1.75× preset", () => {
    const { setPlaybackRate } = renderPlaybackRateSettings();

    fireEvent.click(
      screen.getByRole("menuitemradio", { name: "1.75×" }),
    );

    expect(setPlaybackRate).toHaveBeenCalledWith(1.75);
  });

  it("offers an accessible 0.25×–4× custom speed slider", () => {
    const { setPlaybackRate } = renderPlaybackRateSettings();
    const slider = screen.getByRole("slider", {
      name: "Custom playback speed",
    });

    expect(slider).toHaveAttribute("min", "0.25");
    expect(slider).toHaveAttribute("max", "4");
    expect(slider).toHaveAttribute("step", "0.05");
    expect(slider).toHaveAttribute("aria-valuetext", "1.25×");

    fireEvent.change(slider, { target: { value: "3.35" } });

    expect(setPlaybackRate).toHaveBeenCalledWith(3.35);
    expect(screen.getByRole("menu", { name: "Video settings" })).toBeVisible();
  });
});

function renderPlaybackRateSettings() {
  const snapshot: PlayerSnapshot = {
    media: {
      ...createInitialVideoEngineSnapshot(),
      playbackRate: 1.25,
    },
    capabilities: {
      browserSupported: true,
      adaptiveStreaming: true,
      drm: false,
      nativeHls: false,
      pictureInPicture: false,
    },
    ui: {
      ...createInitialPlayerUiState(),
      settingsView: "playback-rate",
    },
    chapters: [],
    activeChapterId: null,
    storyboard: [],
    markers: [],
  };
  const setPlaybackRate = vi.fn<(rate: number) => void>();
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    setPlaybackRate,
    setSettingsView: vi.fn(),
  } as unknown as PlayerController;

  render(
    <PlayerControllerContext.Provider value={controller}>
      <SettingsMenu />
    </PlayerControllerContext.Provider>,
  );

  return { setPlaybackRate };
}
