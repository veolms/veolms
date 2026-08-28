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
});

describe("controller-backed player menus", () => {
  it("selects a playback speed", () => {
    const { actions } = renderWithController(<PlaybackRateMenu />);
    fireEvent.click(
      screen.getByRole("button", { name: "Playback speed, 1.25×" }),
    );
    fireEvent.click(screen.getByRole("menuitemradio", { name: "1.75×" }));
    expect(actions.setPlaybackRate).toHaveBeenCalledWith(1.75);
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
    expect(slider).toHaveAttribute("max", "4");
    expect(slider).toHaveAttribute("step", "0.05");
    fireEvent.change(slider, { target: { value: "3.25" } });

    expect(actions.setPlaybackRate).toHaveBeenCalledWith(3.25);
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
