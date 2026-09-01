import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
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

afterEach(cleanup);

describe("player themes", () => {
  it("ships three complete built-in themes with YouTube as the default", () => {
    expect(BUILT_IN_PLAYER_THEME_IDS).toEqual(["youtube", "aurora", "minimal"]);
    expect(resolvePlayerTheme()).toBe(BUILT_IN_PLAYER_THEMES.youtube);
    for (const id of BUILT_IN_PLAYER_THEME_IDS) {
      const theme = BUILT_IN_PLAYER_THEMES[id];
      expect(theme.id).toBe(id);
      expect(theme.tokens.controlRadius).toBeTruthy();
      expect(theme.tokens.menuSolidSurface).not.toContain("/");
      expect(theme.icons.play).toBeTypeOf("function");
      expect(theme.icons.settings).toBeTypeOf("function");
      expect(theme.icons.speedDecrease).toBeTypeOf("function");
      expect(theme.icons.speedIncrease).toBeTypeOf("function");
    }
  });

  it("keeps filled control surfaces thirty percent more transparent", () => {
    expect(
      Object.fromEntries(
        BUILT_IN_PLAYER_THEME_IDS.map((id) => [
          id,
          {
            resting: BUILT_IN_PLAYER_THEMES[id].tokens.controlSurface,
            hover: BUILT_IN_PLAYER_THEMES[id].tokens.controlSurfaceHover,
            active: BUILT_IN_PLAYER_THEMES[id].tokens.controlSurfaceActive,
          },
        ]),
      ),
    ).toEqual({
      youtube: {
        resting: "rgb(5 7 11 / 0.5)",
        hover: "rgb(255 255 255 / 0.11)",
        active: "rgb(255 255 255 / 0.14)",
      },
      aurora: {
        resting: "rgb(29 20 52 / 0.6)",
        hover: "rgb(139 92 246 / 0.21)",
        active: "rgb(34 211 238 / 0.18)",
      },
      minimal: {
        resting: "rgb(248 250 252 / 0.64)",
        hover: "rgb(226 232 240 / 0.67)",
        active: "rgb(203 213 225 / 0.67)",
      },
    });
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
    expect(
      getPlayerThemeStyle(theme)["--video-player-menu-solid-surface"],
    ).toBe(BUILT_IN_PLAYER_THEMES.minimal.tokens.menuSolidSurface);
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

  it.each(BUILT_IN_PLAYER_THEME_IDS)(
    "keeps the same 60-degree settings interaction in the %s theme",
    (themeId) => {
      const engine = new FakeVideoEngine();
      render(
        <VideoPlayer
          source={source}
          engineFactory={() => engine}
          keyboardEnabled={false}
          theme={themeId}
        />,
      );

      const trigger = screen.getByRole("button", { name: "Settings" });
      const icon = trigger.querySelector<SVGElement>("svg")!;
      const restingRotation =
        BUILT_IN_PLAYER_THEMES[themeId].motion.settingsClosedRotation;

      expect(icon).toHaveStyle({
        transform: `rotate(${restingRotation}deg)`,
      });

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "true");
      expect(
        screen.getByRole("menu", { name: "Video settings" }),
      ).toBeVisible();
      expect(icon).toHaveStyle({
        transform: `rotate(${restingRotation + 60}deg)`,
      });

      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(
        screen.queryByRole("menu", { name: "Video settings" }),
      ).not.toBeInTheDocument();
      expect(icon).toHaveStyle({
        transform: `rotate(${restingRotation}deg)`,
      });
    },
  );
});
