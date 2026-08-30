import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FakeVideoEngine } from "../testing/FakeVideoEngine";
import { VideoPlayer } from "../react/VideoPlayer";
import {
  BUILT_IN_PLAYER_THEME_IDS,
  BUILT_IN_PLAYER_THEMES,
  createPlayerTheme,
  getPlayerThemeStyle,
  resolvePlayerTheme,
  type PlayerThemeIconProps,
} from "./playerThemes";

const source = {
  id: "theme-preview",
  src: "/theme-preview.mp4",
  kind: "file" as const,
};

describe("player themes", () => {
  it("ships three complete built-in themes with YouTube as the default", () => {
    expect(BUILT_IN_PLAYER_THEME_IDS).toEqual(["youtube", "aurora", "minimal"]);
    expect(resolvePlayerTheme()).toBe(BUILT_IN_PLAYER_THEMES.youtube);
    for (const id of BUILT_IN_PLAYER_THEME_IDS) {
      const theme = BUILT_IN_PLAYER_THEMES[id];
      expect(theme.id).toBe(id);
      expect(theme.tokens.controlRadius).toBeTruthy();
      expect(theme.icons.play).toBeTypeOf("function");
      expect(theme.icons.settings).toBeTypeOf("function");
    }
  });

  it("merges custom tokens and semantic icons over a built-in base", () => {
    function CustomPlayIcon(props: PlayerThemeIconProps) {
      return <svg {...props} data-custom-play-icon="" />;
    }

    const theme = createPlayerTheme({
      id: "brand",
      label: "Brand",
      base: "minimal",
      tokens: { accent: "#22c55e" },
      icons: { play: CustomPlayIcon },
    });

    expect(theme.tokens.accent).toBe("#22c55e");
    expect(theme.tokens.controlRadius).toBe(
      BUILT_IN_PLAYER_THEMES.minimal.tokens.controlRadius,
    );
    expect(theme.icons.play).toBe(CustomPlayIcon);
    expect(theme.icons.pause).toBe(BUILT_IN_PLAYER_THEMES.minimal.icons.pause);
    expect(getPlayerThemeStyle(theme)["--video-player-accent"]).toBe("#22c55e");
  });

  it("applies the selected theme to the root and all default controls", () => {
    const engine = new FakeVideoEngine();
    render(
      <VideoPlayer
        source={source}
        engineFactory={() => engine}
        keyboardEnabled={false}
        theme="aurora"
      />,
    );

    const player = screen.getByRole("region", { name: "Video player" });
    expect(player).toHaveAttribute("data-player-theme", "aurora");
    expect(player.style.getPropertyValue("--video-player-accent")).toBe(
      "#a78bfa",
    );
    expect(
      screen.getByRole("button", { name: "Settings" }).querySelector("svg"),
    ).toHaveAttribute("data-settings-icon", "aurora");
  });
});
