import type { PlayerThemeDefinition } from "./playerThemes";
import { getPlayerThemeStyle } from "./playerThemes";

export interface PlayerThemeSwatchProps {
  theme: PlayerThemeDefinition;
  /**
   * `card` is the Settings page picker's still; `menu` is the smaller one in
   * the player's own settings menu.
   */
  size?: "card" | "menu";
  className?: string;
}

/*
 * The still is 16:9 like the player, and its parts sit at fixed fractions
 * of its height (play a third of the way down, the timeline under it, the
 * pill along the bottom) with room between them at either size. Only the
 * icons and the thumb's largest size differ.
 */
const SWATCH_SIZES = {
  card: { frame: "rounded-lg", playIcon: 13, pillIcon: 11, thumbMax: "11px" },
  menu: { frame: "rounded-md", playIcon: 9, pillIcon: 8, thumbMax: "8px" },
} as const;

/**
 * A small still of the theme's controls over a dark picture: the play
 * button, a pill of icons and the timeline with its thumb, each drawn from
 * the theme's own tokens.
 */
export function PlayerThemeSwatch({
  className,
  size = "card",
  theme,
}: PlayerThemeSwatchProps) {
  const PlayIcon = theme.icons.play;
  const CaptionsIcon = theme.icons.captions;
  const SettingsIcon = theme.icons.settings;
  const { tokens } = theme;
  // A theme that plays in the app's own colours (YouTube) shows them here
  // too, not the stand-in accent it is defined with.
  const accent = theme.usesAppPalette
    ? `var(--accent, ${tokens.accent})`
    : tokens.accent;
  const controlRadius = `min(${tokens.controlRadius}, 999px)`;
  const sizes = SWATCH_SIZES[size];

  return (
    <span
      aria-hidden="true"
      data-player-theme-preview={theme.id}
      className={`relative block aspect-video overflow-hidden bg-[radial-gradient(120%_90%_at_30%_20%,#2b4d6e_0%,#1a3049_45%,#0e1b2b_100%)] ${sizes.frame} ${className ?? ""}`}
      style={{
        ...getPlayerThemeStyle(theme),
        ["--video-player-accent" as string]: accent,
        fontFamily: tokens.fontFamily,
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0 h-1/2"
        style={{
          background:
            tokens.bottomScrim ??
            `linear-gradient(to top, rgb(${tokens.vignetteColor} / 0.85), transparent)`,
        }}
      />
      <span
        className="absolute top-[32%] left-1/2 grid aspect-square h-[30%] -translate-1/2 place-items-center"
        style={{
          background: tokens.playSurface ?? tokens.controlSurface,
          color: tokens.playText ?? tokens.controlText,
          border: tokens.playBorder ?? `1px solid ${tokens.controlBorder}`,
          borderRadius: tokens.playRadius ?? controlRadius,
          backdropFilter: tokens.controlBackdrop,
          boxShadow: tokens.controlShadow,
        }}
      >
        <PlayIcon size={sizes.playIcon} active />
      </span>
      <span className="absolute inset-x-[7%] top-[64%] flex -translate-y-1/2 items-center">
        <span
          className="relative block w-full"
          style={{
            height: tokens.timelineHeight ?? "3px",
            borderRadius: tokens.timelineRadius ?? "999px",
            background: tokens.timelineTrack,
          }}
        >
          <span
            className="block h-full w-2/5"
            style={{
              borderRadius: "inherit",
              background: tokens.timelineProgress ?? accent,
            }}
          />
          <span
            className="absolute left-2/5 top-1/2 -translate-1/2"
            style={{
              width: tokens.thumbWidth ?? "9px",
              height: tokens.thumbHeight ?? "9px",
              maxWidth: sizes.thumbMax,
              maxHeight: sizes.thumbMax,
              borderRadius: tokens.thumbRadius ?? "999px",
              border: tokens.thumbBorder,
              boxShadow: tokens.thumbShadow,
              background:
                tokens.thumbColor ?? tokens.timelineProgress ?? accent,
            }}
          />
        </span>
      </span>
      <span
        className="absolute bottom-[7%] left-[5%] flex h-[17%] items-center gap-[0.15em] px-[3%] text-(--video-player-control-text)"
        style={{
          borderRadius: controlRadius,
          border: `1px solid ${tokens.controlBorder}`,
          background: tokens.controlSurface,
          backdropFilter: tokens.controlBackdrop,
        }}
      >
        <CaptionsIcon size={sizes.pillIcon} />
        <SettingsIcon size={sizes.pillIcon} />
      </span>
      <span
        className="absolute right-[5%] bottom-[12%] h-[6%] w-[14%]"
        style={{
          borderRadius: tokens.controlRadius,
          background: accent,
        }}
      />
    </span>
  );
}
