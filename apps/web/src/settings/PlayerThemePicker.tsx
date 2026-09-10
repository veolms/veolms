import {
  PLAYER_THEME_OPTIONS,
  getPlayerThemeStyle,
  type BuiltInPlayerThemeId,
  type PlayerThemeDefinition,
} from "@veolms/video-player";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";

export interface PlayerThemePickerProps {
  value: BuiltInPlayerThemeId;
  onChange: (theme: BuiltInPlayerThemeId) => void;
}

function PlayerThemePreview({ theme }: { theme: PlayerThemeDefinition }) {
  const PlayIcon = theme.icons.play;
  const CaptionsIcon = theme.icons.captions;
  const SettingsIcon = theme.icons.settings;

  return (
    <span
      aria-hidden="true"
      data-player-theme-preview={theme.id}
      className="relative block h-15 overflow-hidden rounded-lg bg-slate-950"
      style={getPlayerThemeStyle(theme)}
    >
      <span className="absolute inset-x-2 bottom-2 h-0.5 bg-(--video-player-timeline-track)">
        <span className="block h-full w-2/5 bg-(--video-player-accent)" />
      </span>
      <span
        className="absolute bottom-3.5 left-2.5 flex h-7 items-center gap-0.5 border border-(--video-player-control-border) bg-(--video-player-control-surface) px-1.5 text-(--video-player-control-text) shadow-(--video-player-control-shadow)"
        style={{ borderRadius: "var(--video-player-control-radius)" }}
      >
        <PlayIcon size={15} active />
        <CaptionsIcon size={16} />
        <SettingsIcon
          size={15}
          style={{
            transform: `rotate(${theme.motion.settingsClosedRotation}deg)`,
          }}
        />
      </span>
      <span className="absolute right-2 top-2 size-1.5 rounded-full bg-(--video-player-accent)" />
    </span>
  );
}

export function PlayerThemePicker({ onChange, value }: PlayerThemePickerProps) {
  return (
    <fieldset className="settings-learning-player-theme mb-1 border-b border-[color-mix(in_srgb,var(--text)_5%,transparent)] pb-4">
      <legend className="text-sm font-semibold text-(--text)">
        Video player theme
      </legend>
      <p className="mt-1 text-xs leading-5 text-(--text-secondary)">
        Change only the lesson player’s controls, icons, and color treatment.
      </p>
      <div
        className="mt-3 grid gap-2 sm:grid-cols-3"
        role="radiogroup"
        aria-label="Video player theme"
      >
        {PLAYER_THEME_OPTIONS.map((theme) => {
          const selected = value === theme.id;
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
              onClick={() => onChange(theme.id as BuiltInPlayerThemeId)}
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
              {theme.id === "youtube" ? (
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
