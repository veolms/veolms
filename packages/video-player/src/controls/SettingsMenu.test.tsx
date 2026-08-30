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
  it("uses the six-notch settings gear", () => {
    renderPlaybackRateSettings();

    expect(
      screen
        .getByRole("button", { name: "Settings" })
        .querySelector('[data-settings-icon="gear-six"]'),
    ).toBeTruthy();
  });

  it("centers a notch at rest and turns one notch while open", () => {
    const { unmount } = renderPlaybackRateSettings("closed");
    const closedIcon = screen
      .getByRole("button", { name: "Settings" })
      .querySelector<SVGElement>('[data-settings-icon="gear-six"]');

    expect(closedIcon).toHaveAttribute("data-settings-icon-state", "closed");
    expect(closedIcon).toHaveStyle({ transform: "rotate(30deg)" });
    expect(closedIcon).toHaveClass(
      "transition-transform",
      "duration-200",
      "max-sm:size-5",
      "motion-reduce:transition-none",
    );

    unmount();
    renderPlaybackRateSettings("main");
    const openIcon = screen
      .getByRole("button", { name: "Settings" })
      .querySelector<SVGElement>('[data-settings-icon="gear-six"]');

    expect(openIcon).toHaveAttribute("data-settings-icon-state", "open");
    expect(openIcon).toHaveStyle({ transform: "rotate(90deg)" });
  });

  it("includes the 1.75× preset", () => {
    const { setPlaybackRate } = renderPlaybackRateSettings();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "1.75×" }));

    expect(setPlaybackRate).toHaveBeenCalledWith(1.75);
  });

  it("omits captions from the main menu when captions have a quick control", () => {
    renderPlaybackRateSettings("main");

    expect(
      screen.queryByRole("menuitem", { name: /^Captions\b/ }),
    ).not.toBeInTheDocument();
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

  it("offers picture in picture as a settings action when requested", () => {
    const togglePictureInPicture = vi.fn<() => Promise<void>>();
    const snapshot: PlayerSnapshot = {
      media: createInitialVideoEngineSnapshot(),
      capabilities: {
        browserSupported: true,
        adaptiveStreaming: true,
        drm: false,
        nativeHls: false,
        pictureInPicture: true,
      },
      ui: {
        ...createInitialPlayerUiState(),
        settingsView: "main",
      },
      chapters: [],
      activeChapterId: null,
      storyboard: [],
      markers: [],
    };
    const controller = {
      getSnapshot: () => snapshot,
      subscribe: () => () => undefined,
      setSettingsView: vi.fn(),
      togglePictureInPicture,
    } as unknown as PlayerController;

    render(
      <PlayerControllerContext.Provider value={controller}>
        <SettingsMenu includePictureInPicture />
      </PlayerControllerContext.Provider>,
    );

    fireEvent.click(
      screen.getByRole("menuitem", { name: /^Picture in picture/ }),
    );
    expect(togglePictureInPicture).toHaveBeenCalledOnce();
  });
});

function renderPlaybackRateSettings(
  settingsView: PlayerSnapshot["ui"]["settingsView"] = "playback-rate",
) {
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
      settingsView,
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

  const { unmount } = render(
    <PlayerControllerContext.Provider value={controller}>
      <SettingsMenu />
    </PlayerControllerContext.Provider>,
  );

  return { setPlaybackRate, unmount };
}
