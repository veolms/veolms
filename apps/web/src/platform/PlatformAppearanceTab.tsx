import { academyThemes, DEFAULT_ACADEMY_THEME } from "../themes";
import { ChoiceCard, RadioGroup } from "../settings/SettingsControls";
import {
  DISPLAY_MODES,
  displayModePreview,
  type DisplayMode,
} from "../settings/displayModes";
import { MiniSurface } from "../settings/SettingsPreviews";
import { PlatformSettingsStatus } from "./PlatformSettingsStatus";
import { usePlatformSettingsEditor } from "./usePlatformSettingsEditor";

// The theme list calls its first theme the default ("Default - clear &
// confident"); here the admin decides which one is.
const withoutDefaultLabel = (note: string) => {
  const rest = note.replace(/^Default - /u, "");
  return rest === note ? note : rest.charAt(0).toUpperCase() + rest.slice(1);
};

const MODE_SAVED_NOTICE: Record<DisplayMode, string> = {
  light: "The default is now light mode.",
  dark: "The default is now dark mode.",
  device: "The default now follows each visitor's device.",
};

/**
 * The look everyone starts with: the display mode and colour theme a visitor
 * sees until they pick their own in Settings. The same cards as Settings >
 * Appearance, choosing for the academy instead of for oneself.
 */
export function PlatformAppearanceTab({
  setNotice,
}: {
  setNotice?: (message: string) => void;
}) {
  const { query, settings, save } = usePlatformSettingsEditor(setNotice);

  if (!settings) {
    return (
      <PlatformSettingsStatus
        isError={query.isError}
        onRetry={() => void query.refetch()}
      />
    );
  }

  const { defaultDisplayMode, defaultColorTheme } = settings.appearance;
  // A theme this version does not have shows as its first one, as it does
  // for visitors.
  const selectedTheme = academyThemes.some(
    (theme) => theme.id === defaultColorTheme,
  )
    ? defaultColorTheme
    : DEFAULT_ACADEMY_THEME;

  return (
    <div className="settings-content">
      <header className="settings-detail__header">
        <div>
          <h2>Appearance</h2>
          <p>
            The look everyone starts with. Anyone can still pick their own in
            Settings, and keeps it.
          </p>
        </div>
      </header>

      <section className="settings-section">
        <div className="settings-section__heading-row mb-3">
          <div>
            <h2>Default display mode</h2>
            <p>
              Light or dark, or whatever each visitor&apos;s device is set to.
            </p>
          </div>
        </div>
        <RadioGroup
          label="Default display mode"
          className="settings-choice-grid settings-choice-grid--display"
        >
          {DISPLAY_MODES.map(({ id, label, icon }) => (
            <ChoiceCard
              key={id}
              checked={defaultDisplayMode === id}
              onChange={() => {
                if (id === defaultDisplayMode) return;
                save(
                  { appearance: { defaultDisplayMode: id } },
                  MODE_SAVED_NOTICE[id],
                );
              }}
              label={label}
              note={
                id === "device"
                  ? "Follow each visitor's system preference"
                  : `Start everyone in ${label.toLowerCase()} mode`
              }
              icon={icon}
              className="settings-choice-card--stacked"
              preview={
                <MiniSurface
                  variant={selectedTheme}
                  previewMode={displayModePreview(id)}
                />
              }
            />
          ))}
        </RadioGroup>
      </section>

      <section className="settings-section">
        <div className="settings-section__heading-row mb-3">
          <div>
            <h2>Default color theme</h2>
            <p>The accent colours of the sidebar, buttons and highlights.</p>
          </div>
        </div>
        <RadioGroup
          label="Default color theme"
          className="settings-choice-grid settings-choice-grid--colors"
        >
          {academyThemes.map((theme) => (
            <ChoiceCard
              key={theme.id}
              checked={selectedTheme === theme.id}
              onChange={() => {
                if (theme.id === selectedTheme) return;
                save(
                  { appearance: { defaultColorTheme: theme.id } },
                  `${theme.name} is now the default theme.`,
                );
              }}
              label={theme.name}
              note={withoutDefaultLabel(theme.note)}
              className="settings-choice-card--stacked settings-choice-card--theme"
              preview={
                <MiniSurface
                  variant={theme.id}
                  previewMode={
                    defaultDisplayMode === "light" ? "light" : "dark"
                  }
                />
              }
            />
          ))}
        </RadioGroup>
      </section>
    </div>
  );
}
