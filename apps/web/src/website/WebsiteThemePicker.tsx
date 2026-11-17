import {
  SITE_COLOUR_MODES,
  SITE_THEME_IDS,
  SITE_THEMES,
  type SiteLook,
} from "@veolms/contracts";
import { CheckCircleIcon as CheckCircle } from "@phosphor-icons/react/CheckCircle";

const MODE_LABELS: Record<SiteLook["colourMode"], string> = {
  system: "Match the visitor",
  light: "Always light",
  dark: "Always dark",
};

/** A small picture of a theme: its page, a heading, text and a button. */
export function ThemeSwatch({
  themeId,
  dark,
}: {
  themeId: SiteLook["themeId"];
  dark: boolean;
}) {
  const theme = SITE_THEMES[themeId];
  const colours = dark ? theme.dark : theme.light;
  const radius = { pill: 999, square: 5, outline: 3, soft: 8, gradient: 999 }[
    theme.buttonStyle
  ];
  return (
    <span
      aria-hidden="true"
      className="flex h-24 min-w-0 flex-col justify-center gap-1.5 overflow-hidden rounded-lg border px-3"
      // Theme colours are data, not our app's tokens, so they are set inline.
      style={{
        background: colours.bg,
        borderColor: colours.border,
        color: colours.text,
      }}
    >
      <span
        className="block truncate text-[14px] leading-tight"
        style={{
          fontFamily: theme.fonts.heading,
          fontWeight: theme.headingWeight,
          letterSpacing: theme.headingTracking,
        }}
      >
        Learn with us
      </span>
      <span className="block text-[11px]" style={{ color: colours.muted }}>
        Short, practical lessons.
      </span>
      <span
        className="mt-0.5 inline-block w-fit px-2.5 py-1 text-[10px] font-bold"
        style={{
          background: colours.accent,
          color: colours.onAccent,
          borderRadius: radius,
        }}
      >
        See courses
      </span>
    </span>
  );
}

export function WebsiteThemePicker({
  look,
  onChange,
  isSaving,
}: {
  look: SiteLook;
  onChange: (look: SiteLook) => void;
  isSaving: boolean;
}) {
  const previewDark = look.colourMode === "dark";
  return (
    <div className="grid gap-4">
      <div
        role="radiogroup"
        aria-label="Theme"
        className="grid gap-3 sm:grid-cols-3"
      >
        {SITE_THEME_IDS.map((themeId) => {
          const theme = SITE_THEMES[themeId];
          const selected = look.themeId === themeId;
          return (
            <button
              key={themeId}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={isSaving}
              onClick={() => onChange({ ...look, themeId })}
              className={`grid cursor-pointer gap-2 rounded-xl border bg-transparent p-2.5 text-left transition-colors disabled:cursor-wait ${
                selected
                  ? "border-(--accent) ring-2 ring-(--accent)/20"
                  : "border-[color-mix(in_srgb,var(--text)_10%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_22%,transparent)]"
              }`}
            >
              <ThemeSwatch themeId={themeId} dark={previewDark} />
              <span className="flex items-center justify-between gap-2 px-0.5">
                <span className="text-sm font-semibold text-(--text)">
                  {theme.name}
                </span>
                {selected ? (
                  <CheckCircle
                    size={18}
                    weight="fill"
                    className="text-(--accent)"
                  />
                ) : null}
              </span>
              <span className="px-0.5 text-xs leading-5 text-(--muted)">
                {theme.description}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-medium text-(--text)">Light or dark</span>
        <div
          role="radiogroup"
          aria-label="Light or dark"
          className="flex w-fit flex-wrap items-center gap-1 rounded-[12px] border border-[color-mix(in_srgb,var(--text)_8%,transparent)] bg-[color-mix(in_srgb,var(--canvas)_80%,var(--surface))] p-1"
        >
          {SITE_COLOUR_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              role="radio"
              aria-checked={look.colourMode === mode}
              disabled={isSaving}
              onClick={() => onChange({ ...look, colourMode: mode })}
              className={`cursor-pointer rounded-[8px] border-none px-3 py-1.5 text-[13px] font-semibold transition-all ${
                look.colourMode === mode
                  ? "bg-(--card-surface,var(--surface)) text-(--text) shadow-(--card-compact-shadow)"
                  : "bg-transparent text-(--muted) hover:text-(--text)"
              }`}
            >
              {MODE_LABELS[mode]}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
