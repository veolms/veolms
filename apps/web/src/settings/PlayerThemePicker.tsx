import {
  DEFAULT_PLAYER_THEME_ID,
  PlayerThemeSwatch,
  usePlayerThemes,
} from "@veolms/video-player";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";

export interface PlayerThemePickerProps {
  value: string;
  onChange: (theme: string) => void;
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
              <PlayerThemeSwatch theme={theme} />
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
