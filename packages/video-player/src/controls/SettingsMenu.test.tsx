import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInitialVideoEngineSnapshot } from "../core/snapshot";
import type { PlayerController } from "../react/PlayerController";
import { PlayerInteractionModeProvider } from "../react/PlayerInteractionMode";
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

  it("returns to rest when closed and turns 30 degrees while open", () => {
    const { unmount } = renderPlaybackRateSettings("closed");
    const closedIcon = screen
      .getByRole("button", { name: "Settings" })
      .querySelector<SVGElement>('[data-settings-icon="gear-six"]');

    expect(closedIcon).toHaveAttribute("data-settings-icon-state", "closed");
    expect(closedIcon).toHaveStyle({ transform: "rotate(30deg)" });
    expect(closedIcon).toHaveClass(
      "transition-transform",
      "duration-400",
      "max-sm:size-5",
      "motion-reduce:transition-none",
    );

    unmount();
    renderPlaybackRateSettings("main");
    const openIcon = screen
      .getByRole("button", { name: "Settings" })
      .querySelector<SVGElement>('[data-settings-icon="gear-six"]');

    expect(openIcon).toHaveAttribute("data-settings-icon-state", "open");
    expect(openIcon).toHaveStyle({ transform: "rotate(60deg)" });
    expect(screen.getByRole("menu", { name: "Video settings" })).toHaveClass(
      "backdrop-blur-sm",
      "!mb-8",
    );
  });

  it("offers exactly the compact quick-speed presets", () => {
    const { setPlaybackRate } = renderPlaybackRateSettings();
    const presets = screen.getAllByRole("menuitemradio");

    expect(presets.map((preset) => preset.getAttribute("aria-label"))).toEqual([
      "1×",
      "1.25×",
      "1.5×",
      "2×",
      "3×",
    ]);
    expect(screen.getByText("Normal")).toBeVisible();

    fireEvent.click(screen.getByRole("menuitemradio", { name: "3×" }));

    expect(setPlaybackRate).toHaveBeenCalledWith(3);
  });

  it("keeps the mobile settings sheet open after choosing a playback speed", () => {
    const { setPlaybackRate, setSettingsView } = renderPlaybackRateSettings(
      "playback-rate",
      true,
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "3×" }));

    expect(setPlaybackRate).toHaveBeenCalledWith(3);
    expect(setSettingsView).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Video settings" }),
    ).toBeVisible();
  });

  it("keeps the mobile settings sheet open after choosing a quality", () => {
    const { selectQuality, setSettingsView } = renderPlaybackRateSettings(
      "quality",
      true,
    );

    fireEvent.click(screen.getByRole("menuitemradio", { name: "1080p" }));

    expect(selectQuality).toHaveBeenCalledWith("1080");
    expect(setSettingsView).not.toHaveBeenCalled();
    expect(
      screen.getByRole("dialog", { name: "Video settings" }),
    ).toBeVisible();
  });

  it("still dismisses desktop settings after choosing a quality", () => {
    const { selectQuality, setSettingsView } =
      renderPlaybackRateSettings("quality");

    fireEvent.click(screen.getByRole("menuitemradio", { name: "1080p" }));

    expect(selectQuality).toHaveBeenCalledWith("1080");
    expect(setSettingsView).toHaveBeenCalledWith("closed");
  });

  it("opens captions from the main settings menu", () => {
    const { setSettingsView } = renderPlaybackRateSettings("main");
    const captionsItem = screen.getByRole("menuitem", {
      name: "Captions Off",
    });

    expect(
      captionsItem.querySelector('[data-caption-icon-state="outline"]'),
    ).not.toBeNull();

    fireEvent.click(captionsItem);

    expect(setSettingsView).toHaveBeenCalledWith("captions");
  });

  it("selects a caption track from the captions submenu", () => {
    const { selectTextTrack } = renderPlaybackRateSettings("captions");

    expect(screen.getByRole("menuitemradio", { name: "Off" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "English en" }));

    expect(selectTextTrack).toHaveBeenCalledWith("captions-en");
  });

  it.each([
    ["quality", "Quality"],
    ["playback-rate", "Playback speed"],
    ["captions", "Captions"],
  ] as const)(
    "returns from the %s submenu without closing settings",
    (settingsView, label) => {
      const { setSettingsView } = renderPlaybackRateSettings(settingsView);
      const backButton = screen.getByRole("menuitem", { name: label });

      expect(backButton).toHaveAttribute("data-menu-keep-open");
      expect(backButton).toHaveAttribute("data-video-player-settings-back");
      expect(backButton).toHaveClass(
        "-mx-2",
        "w-[calc(100%+1rem)]",
        "rounded-none",
        "sm:-mx-1.5",
        "sm:w-[calc(100%+0.75rem)]",
      );

      fireEvent.click(backButton);

      expect(setSettingsView).toHaveBeenCalledOnce();
      expect(setSettingsView).toHaveBeenCalledWith("main");
    },
  );

  it("offers an accessible 0.25×–8× custom speed slider and step buttons", () => {
    const { setPlaybackRate } = renderPlaybackRateSettings();
    const slider = screen.getByRole("slider", {
      name: "Custom playback speed",
    });

    expect(slider).toHaveAttribute("min", "0.25");
    expect(slider).toHaveAttribute("max", "8");
    expect(slider).toHaveAttribute("step", "0.25");
    expect(slider).toHaveAttribute("aria-valuetext", "1.25×");
    expect(screen.getByText("1.25×", { selector: "output" })).toBeVisible();

    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Decrease playback speed by 0.25×",
      }),
    );
    fireEvent.click(
      screen.getByRole("menuitem", {
        name: "Increase playback speed by 0.25×",
      }),
    );
    fireEvent.change(slider, { target: { value: "7.25" } });

    expect(setPlaybackRate).toHaveBeenNthCalledWith(1, 1);
    expect(setPlaybackRate).toHaveBeenNthCalledWith(2, 1.5);
    expect(setPlaybackRate).toHaveBeenNthCalledWith(3, 7.25);
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
  mobileSheet = false,
) {
  const snapshot: PlayerSnapshot = {
    media: {
      ...createInitialVideoEngineSnapshot(),
      playbackRate: 1.25,
      qualities: [
        {
          id: "1080",
          label: "1080p",
          active: false,
          width: 1920,
          height: 1080,
          frameRate: 30,
        },
      ],
      textTracks: [
        {
          id: "captions-en",
          label: "English",
          language: "en",
          active: false,
          kind: "captions",
          roles: [],
        },
      ],
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
  const selectQuality = vi.fn<(qualityId: string | null) => void>();
  const selectTextTrack = vi.fn<(trackId: string | null) => void>();
  const setSettingsView =
    vi.fn<(view: PlayerSnapshot["ui"]["settingsView"]) => void>();
  const controller = {
    getSnapshot: () => snapshot,
    selectQuality,
    selectTextTrack,
    subscribe: () => () => undefined,
    setPlaybackRate,
    setSettingsView,
  } as unknown as PlayerController;

  const { unmount } = render(
    <PlayerControllerContext.Provider value={controller}>
      <PlayerInteractionModeProvider mobile={mobileSheet}>
        <SettingsMenu mobilePresentation={mobileSheet ? "sheet" : "popover"} />
      </PlayerInteractionModeProvider>
    </PlayerControllerContext.Provider>,
  );

  return {
    selectQuality,
    selectTextTrack,
    setPlaybackRate,
    setSettingsView,
    unmount,
  };
}
