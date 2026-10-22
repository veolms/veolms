import {
  DEFAULT_PLAYER_THEME_ID,
  getPlayerThemeStyle,
  usePlayerThemes,
  type PlayerThemeDefinition,
} from "@veolms/video-player";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";

export interface PlayerThemePickerProps {
  value: string;
  onChange: (theme: string) => void;
}

/**
 * A small still of the theme's controls over a dark picture: the play
 * button, a pill of icons and the timeline with its thumb, each drawn from
 * the theme's own tokens.
 */
function PlayerThemePreview({ theme }: { theme: PlayerThemeDefinition }) {
  const PlayIcon = theme.icons.play;
  const CaptionsIcon = theme.icons.captions;
  const SettingsIcon = theme.icons.settings;
  const { tokens } = theme;
  const controlRadius = `min(${tokens.controlRadius}, 999px)`;

  return (
    <span
      aria-hidden="true"
      data-player-theme-preview={theme.id}
      className="relative block h-18 overflow-hidden rounded-lg bg-[radial-gradient(120%_90%_at_30%_20%,#2b4d6e_0%,#1a3049_45%,#0e1b2b_100%)]"
      style={{
        ...getPlayerThemeStyle(theme),
        fontFamily: tokens.fontFamily,
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0 h-10"
        style={{
          background:
            tokens.bottomScrim ??
            `linear-gradient(to top, rgb(${tokens.vignetteColor} / 0.85), transparent)`,
        }}
      />
      <span
        className="absolute left-1/2 top-[38%] grid size-7 -translate-1/2 place-items-center"
        style={{
          background: tokens.playSurface ?? tokens.controlSurface,
          color: tokens.playText ?? tokens.controlText,
          border: tokens.playBorder ?? `1px solid ${tokens.controlBorder}`,
          borderRadius: tokens.playRadius ?? controlRadius,
          backdropFilter: tokens.controlBackdrop,
          boxShadow: tokens.controlShadow,
        }}
      >
        <PlayIcon size={13} active />
      </span>
      <span className="absolute inset-x-2 bottom-7 flex items-center">
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
              background: tokens.timelineProgress ?? tokens.accent,
            }}
          />
          <span
            className="absolute left-2/5 top-1/2 -translate-1/2"
            style={{
              width: tokens.thumbWidth ?? "9px",
              height: tokens.thumbHeight ?? "9px",
              borderRadius: tokens.thumbRadius ?? "999px",
              border: tokens.thumbBorder,
              boxShadow: tokens.thumbShadow,
              background:
                tokens.thumbColor ?? tokens.timelineProgress ?? tokens.accent,
            }}
          />
        </span>
      </span>
      <span
        className="absolute bottom-1 left-2 flex h-5 items-center gap-1 px-1.5 text-(--video-player-control-text)"
        style={{
          borderRadius: controlRadius,
          border: `1px solid ${tokens.controlBorder}`,
          background: tokens.controlSurface,
          backdropFilter: tokens.controlBackdrop,
        }}
      >
        <CaptionsIcon size={12} />
        <SettingsIcon size={12} />
      </span>
      <span
        className="absolute bottom-2 right-2 h-1.5 w-5"
        style={{
          borderRadius: tokens.controlRadius,
          background: tokens.accent,
        }}
      />
    </span>
  );
}

export function PlayerThemePicker({ onChange, value }: PlayerThemePickerProps) {
  const themes = usePlayerThemes();
  // A stored theme whose plugin is not installed plays in the default one.
  const selectedId = themes.some((theme) => theme.id === value)
    ? value
    : DEFAULT_PLAYER_THEME_ID;

  return (
    <fieldset className="settings-learning-player-theme mb-1 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
      <legend className="text-sm font-semibold text-(--text)">
        Video player theme
      </legend>
      <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
        Change only the lesson player’s controls, icons, and color treatment.
      </p>
      <div
        className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Video player theme"
      >
        {themes.map((theme) => {
          const selected = selectedId === theme.id;
          return (
            <button
              key={theme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${theme.label} video player theme`}
              className={`group min-w-0 rounded-xl border p-2 text-left transition-[border-color,background-color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) ${
                selected
                  ? "border-[color-mix(in_srgb,var(--accent)_72%,var(--border))] bg-[color-mix(in_srgb,var(--accent)_8%,var(--surface))] shadow-[0_8px_22px_color-mix(in_srgb,var(--accent)_9%,transparent)]"
                  : "border-(--border) bg-(--surface) hover:border-[color-mix(in_srgb,var(--accent)_35%,var(--border))] hover:bg-(--surface-strong)"
              }`}
              onClick={() => onChange(theme.id)}
            >
              <PlayerThemePreview theme={theme} />
              <span className="mt-2 flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-(--text)">
                  {theme.label}
                </span>
                {selected ? (
                  <CheckCircle
                    size={16}
                    weight="fill"
                    className="shrink-0 text-(--accent)"
                  />
                ) : null}
              </span>
              <span className="mt-0.5 block text-[11px] leading-4 text-(--text-secondary)">
                {theme.description}
              </span>
              {theme.id === DEFAULT_PLAYER_THEME_ID ? (
                <span className="mt-1.5 inline-flex text-[10px] font-semibold uppercase tracking-[0.08em] text-(--text-secondary)">
                  Default
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
