import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createInitialVideoEngineSnapshot } from "../../core/snapshot";
import type { PlayerController } from "../../react/PlayerController";
import { PlayerControllerContext } from "../../react/context";
import {
  createInitialPlayerUiState,
  type PlayerSnapshot,
} from "../../react/playerState";
import { PlayerInteractionModeProvider } from "../../react/PlayerInteractionMode";
import { AudioTrackMenu } from "./AudioTrackMenu";
import { CaptionsMenu } from "./CaptionsMenu";
import { ChaptersMenu } from "./ChaptersMenu";
import { PlaybackRateMenu } from "./PlaybackRateMenu";
import { PlayerMenuItem } from "./PlayerMenuItem";
import { PopoverMenu } from "./PopoverMenu";
import { QualityMenu } from "./QualityMenu";

afterEach(cleanup);

describe("PopoverMenu", () => {
  it("opens from the keyboard, roves focus, and restores focus on Escape", () => {
    render(
      <PopoverMenu label="Options" trigger="Options">
        <PlayerMenuItem label="First" />
        <PlayerMenuItem label="Second" selected />
        <PlayerMenuItem label="Third" />
      </PopoverMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Options" });
    fireEvent.keyDown(trigger, { key: "ArrowDown" });

    const menu = screen.getByRole("menu", { name: "Options" });
    expect(menu).toHaveClass("border-0");
    expect(menu).toHaveClass("text-(--video-player-menu-text)");
    expect(menu).not.toHaveClass("backdrop-blur-md");
    expect(menu).toHaveAttribute("data-video-player-menu-panel");
    const first = within(menu).getByRole("menuitem", { name: "First" });
    const second = within(menu).getByRole("menuitemradio", { name: "Second" });
    const third = within(menu).getByRole("menuitem", { name: "Third" });
    expect(first).toHaveFocus();

    fireEvent.keyDown(first, { key: "ArrowUp" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "Home" });
    expect(first).toHaveFocus();
    fireEvent.keyDown(first, { key: "End" });
    expect(third).toHaveFocus();
    fireEvent.keyDown(third, { key: "ArrowUp" });
    expect(second).toHaveFocus();

    fireEvent.keyDown(second, { key: "Escape" });
    expect(
      screen.queryByRole("menu", { name: "Options" }),
    ).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("focuses the selected item on click and closes after a selection or outside press", () => {
    const selected = vi.fn();
    render(
      <PopoverMenu label="Options" trigger="Options">
        <PlayerMenuItem label="First" />
        <PlayerMenuItem label="Second" selected onClick={selected} />
      </PopoverMenu>,
    );

    const trigger = screen.getByRole("button", { name: "Options" });
    fireEvent.click(trigger);
    const second = screen.getByRole("menuitemradio", { name: "Second" });
    expect(second).toHaveFocus();
    fireEvent.click(second);
    expect(selected).toHaveBeenCalledOnce();
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("supports controlled state without maintaining a conflicting internal value", () => {
    const onOpenChange = vi.fn();
    const { rerender } = render(
      <PopoverMenu
        label="Options"
        trigger="Options"
        open={false}
        onOpenChange={onOpenChange}
      >
        <PlayerMenuItem label="First" />
      </PopoverMenu>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Options" }));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();

    rerender(
      <PopoverMenu
        label="Options"
        trigger="Options"
        open
        onOpenChange={onOpenChange}
      >
        <PlayerMenuItem label="First" />
      </PopoverMenu>,
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("presents the menu as a bottom sheet on phone viewports", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 640px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      render(
        <PlayerInteractionModeProvider mobile>
          <PopoverMenu
            label="Settings"
            menuLabel="Video settings"
            mobilePresentation="sheet"
            trigger="Settings"
          >
            <PlayerMenuItem label="Quality" />
          </PopoverMenu>
        </PlayerInteractionModeProvider>,
      );

      const trigger = screen.getByRole("button", { name: "Settings" });
      fireEvent.click(trigger);

      const sheet = screen.getByRole("dialog", { name: "Video settings" });
      expect(sheet).toHaveAttribute("data-video-player-mobile-sheet");
      expect(sheet).toHaveClass("border-0");
      expect(
        sheet.style.getPropertyValue("--video-player-menu-solid-surface"),
      ).toBe("rgb(11 11 13)");
      expect(
        document.querySelector("[data-video-player-mobile-sheet-drag-handle]"),
      ).not.toHaveClass("border-b");
      expect(sheet.parentElement).toBe(document.body);
      expect(sheet).toHaveClass("fixed");
      expect(trigger).toHaveAttribute("data-player-control");
      expect(
        screen.getByRole("menu", { name: "Video settings" }),
      ).toBeVisible();
      expect(
        screen.queryByRole("button", { name: /close video settings/i }),
      ).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe("hidden");

      const backdrop = document.querySelector(
        "[data-video-player-mobile-sheet-backdrop]",
      )!;
      fireEvent.pointerDown(backdrop);
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "true");

      fireEvent.click(backdrop);
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(trigger).toHaveFocus();
      expect(document.body.style.overflow).toBe("");
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("can contain a mobile sheet inside a fullscreen-local overlay host", () => {
    const originalMatchMedia = window.matchMedia;
    const portalTarget = document.createElement("div");
    document.body.append(portalTarget);
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 640px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      render(
        <PlayerInteractionModeProvider mobile>
          <PopoverMenu
            label="Settings"
            menuLabel="Video settings"
            mobilePresentation="sheet"
            mobileSheetPortalTarget={portalTarget}
            mobileSheetPanelClassName="mx-auto max-w-[100dvh]"
            trigger="Settings"
          >
            <PlayerMenuItem label="Quality" />
          </PopoverMenu>
        </PlayerInteractionModeProvider>,
      );

      fireEvent.click(screen.getByRole("button", { name: "Settings" }));

      const sheet = screen.getByRole("dialog", { name: "Video settings" });
      const backdrop = portalTarget.querySelector(
        '[data-video-player-mobile-sheet-backdrop=""]',
      );
      expect(sheet.parentElement).toBe(portalTarget);
      expect(sheet).toHaveClass(
        "absolute",
        "w-full",
        "mx-auto",
        "max-w-[100dvh]",
      );
      expect(sheet).not.toHaveClass("fixed");
      expect(backdrop?.parentElement).toBe(portalTarget);
      expect(backdrop).toHaveClass("absolute", "pointer-events-auto");
    } finally {
      portalTarget.remove();
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });

  it("dismisses the phone bottom sheet with a downward drag", () => {
    const originalMatchMedia = window.matchMedia;
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: query === "(max-width: 640px)",
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    });

    try {
      render(
        <PlayerInteractionModeProvider mobile>
          <PopoverMenu
            label="Settings"
            menuLabel="Video settings"
            mobilePresentation="sheet"
            trigger="Settings"
          >
            <PlayerMenuItem label="Quality" />
          </PopoverMenu>
        </PlayerInteractionModeProvider>,
      );

      const trigger = screen.getByRole("button", { name: "Settings" });
      fireEvent.click(trigger);
      const handle = document.querySelector(
        "[data-video-player-mobile-sheet-drag-handle]",
      )!;

      fireEvent.pointerDown(handle, {
        pointerId: 1,
        clientY: 100,
      });
      fireEvent.pointerMove(handle, {
        pointerId: 1,
        clientY: 190,
      });
      expect(
        screen.getByRole("dialog", { name: "Video settings" }),
      ).toHaveStyle({ transform: "translate3d(0, 90px, 0)" });
      fireEvent.pointerUp(handle, {
        pointerId: 1,
        clientY: 190,
      });

      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveFocus();
    } finally {
      Object.defineProperty(window, "matchMedia", {
        configurable: true,
        writable: true,
        value: originalMatchMedia,
      });
    }
  });
});

describe("controller-backed player menus", () => {
  it("selects a playback speed", () => {
    const { actions } = renderWithController(<PlaybackRateMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Playback speed, 1.25×" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "3×" }));
    expect(actions.setPlaybackRate).toHaveBeenCalledWith(3);
  });

  it("sets a custom playback speed without closing the menu", () => {
    const { actions } = renderWithController(<PlaybackRateMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Playback speed, 1.25×" }),
    );

    const slider = screen.getByRole("slider", {
      name: "Custom playback speed",
    });
    expect(slider).toHaveAttribute("min", "0.25");
    expect(slider).toHaveAttribute("max", "8");
    expect(slider).toHaveAttribute("step", "0.25");
    fireEvent.change(slider, { target: { value: "7.25" } });

    expect(actions.setPlaybackRate).toHaveBeenCalledWith(7.25);
    expect(screen.getByRole("menu", { name: "Playback speed" })).toBeVisible();
  });

  it("switches between automatic and fixed quality", () => {
    const { actions } = renderWithController(<QualityMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Video quality, Auto" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^720p/ }));
    expect(actions.selectQuality).toHaveBeenCalledWith("720");

    fireEvent.click(
      screen.getByRole("button", { name: "Video quality, Auto" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Auto/ }));
    expect(actions.selectQuality).toHaveBeenCalledWith(null);
  });

  it("selects audio and caption tracks, including captions off", () => {
    const { actions } = renderWithController(
      <>
        <AudioTrackMenu />
        <CaptionsMenu />
      </>,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Audio track, English" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Spanish/ }));
    expect(actions.selectAudioTrack).toHaveBeenCalledWith("audio-es");

    fireEvent.click(
      screen.getByRole("button", { name: "Captions, English CC" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "Off" }));
    expect(actions.selectTextTrack).toHaveBeenCalledWith(null);

    fireEvent.click(
      screen.getByRole("button", { name: "Captions, English CC" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Español/ }));
    expect(actions.selectTextTrack).toHaveBeenCalledWith("text-es");
  });

  it("seeks to a selected chapter", () => {
    const onChapterSelect = vi.fn();
    const { actions } = renderWithController(
      <ChaptersMenu onChapterSelect={onChapterSelect} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Chapters, Introduction" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: /^Deep dive/ }));
    expect(actions.seekTo).toHaveBeenCalledWith(60);
    expect(onChapterSelect).toHaveBeenCalledWith("deep-dive", 60);
  });

  it("disables unavailable track and chapter menus", () => {
    renderWithController(
      <>
        <QualityMenu />
        <AudioTrackMenu />
        <CaptionsMenu />
        <ChaptersMenu />
      </>,
      {
        media: {
          ...createSnapshot().media,
          qualities: [],
          audioTracks: [],
          textTracks: [],
        },
        chapters: [],
        activeChapterId: null,
      },
    );

    expect(
      screen.getByRole("button", { name: "Video quality, Auto" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Audio track, Audio" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Captions, Off" }),
    ).toBeDisabled();
    expect(
      screen.getByRole("button", { name: "Chapters, Chapters" }),
    ).toBeDisabled();
  });
});

function renderWithController(
  ui: ReactNode,
  snapshotOverrides: Partial<PlayerSnapshot> = {},
) {
  const snapshot = { ...createSnapshot(), ...snapshotOverrides };
  const actions = {
    setPlaybackRate: vi.fn<(rate: number) => void>(),
    selectQuality: vi.fn<(qualityId: string | null) => void>(),
    selectAudioTrack: vi.fn<(trackId: string) => void>(),
    selectTextTrack: vi.fn<(trackId: string | null) => void>(),
    seekTo: vi.fn<(time: number) => void>(),
  };
  const controller = {
    getSnapshot: () => snapshot,
    subscribe: () => () => undefined,
    ...actions,
  } as unknown as PlayerController;

  const result = render(
    <PlayerControllerContext.Provider value={controller}>
      {ui}
    </PlayerControllerContext.Provider>,
  );
  return { ...result, controller, actions };
}

function createSnapshot(): PlayerSnapshot {
  return {
    media: {
      ...createInitialVideoEngineSnapshot(),
      playbackRate: 1.25,
      autoQuality: true,
      selectedQualityId: null,
      qualities: [
        {
          id: "1080",
          label: "1080p",
          active: true,
          width: 1920,
          height: 1080,
          frameRate: 30,
        },
        {
          id: "720",
          label: "720p",
          active: false,
          width: 1280,
          height: 720,
          frameRate: 30,
        },
      ],
      selectedAudioTrackId: "audio-en",
      audioTracks: [
        {
          id: "audio-en",
          label: "English",
          language: "en",
          active: true,
          roles: [],
        },
        {
          id: "audio-es",
          label: "Spanish",
          language: "es",
          active: false,
          roles: [],
        },
      ],
      selectedTextTrackId: "text-en",
      textTracks: [
        {
          id: "text-en",
          label: "English CC",
          language: "en",
          active: true,
          roles: [],
        },
        {
          id: "text-es",
          label: "Español",
          language: "es",
          active: false,
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
    ui: createInitialPlayerUiState(),
    chapters: [
      { id: "introduction", title: "Introduction", startTime: 0, endTime: 60 },
      { id: "deep-dive", title: "Deep dive", startTime: 60, endTime: 180 },
    ],
    activeChapterId: "introduction",
    storyboard: [],
    markers: [],
  };
}
