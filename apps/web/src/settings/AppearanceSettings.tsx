import { DeviceMobileIcon as DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { MoonIcon as Moon } from "@phosphor-icons/react/Moon";
import { SunIcon as Sun } from "@phosphor-icons/react/Sun";
import { academyThemes } from "../themes";
import type { AcademyTheme } from "../themes";
import { themeRevealOriginFromClick } from "../shell/themeViewTransition";
import type { ThemeRevealOrigin } from "../shell/themeViewTransition";
import AppearanceAdditionalSettings from "./AppearanceDeferredSettings";
import type { PageTabColors } from "./settingsPreferences";
import { ChoiceCard, RadioGroup } from "./SettingsControls";
import { MiniSurface } from "./SettingsPreviews";

export type DisplayMode = "light" | "dark" | "device";

interface DisplayModeOption {
  id: DisplayMode;
  label: string;
  note: string;
  icon: typeof Sun;
}

const DISPLAY_MODES: readonly DisplayModeOption[] = [
  { id: "light", label: "Light", note: "Use a light color scheme", icon: Sun },
  { id: "dark", label: "Dark", note: "Use a dark color scheme", icon: Moon },
  {
    id: "device",
    label: "Use device setting",
    note: "Match your system preference",
    icon: DeviceMobile,
  },
];

// Keep Settings in lockstep with the sidebar and mobile palette menus.
const COLOR_THEMES = academyThemes;

export interface AppearanceSettingsProps {
  theme: DisplayMode;
  onThemeChange?: (theme: DisplayMode, origin?: ThemeRevealOrigin) => void;
  academyTheme: string;
  onAcademyThemeChange?: (
    themeId: AcademyTheme["id"],
    origin?: ThemeRevealOrigin,
  ) => void;
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
}

export function AppearanceSettings({
  theme,
  onThemeChange,
  academyTheme,
  onAcademyThemeChange,
  pageTabColors,
  onPageTabColorsChange,
}: AppearanceSettingsProps) {
  const selectedColor = COLOR_THEMES.some((item) => item.id === academyTheme)
    ? academyTheme
    : "codex";

  return (
    <div className="settings-content settings-content--appearance">
      <section className="settings-section">
        <h2>Display mode</h2>
        <RadioGroup
          label="Display mode"
          className="settings-choice-grid settings-choice-grid--display"
        >
          {DISPLAY_MODES.map(({ id, label, note, icon }) => (
            <ChoiceCard
              key={id}
              checked={theme === id}
              onChange={(event) =>
                onThemeChange?.(
                  id,
                  themeRevealOriginFromClick(event) ?? undefined,
                )
              }
              label={label}
              note={note}
              icon={icon}
              className="settings-choice-card--stacked"
              preview={
                <MiniSurface
                  variant={selectedColor}
                  previewMode={
                    id === "light" ? "light" : id === "dark" ? "dark" : "device"
                  }
                />
              }
            />
          ))}
        </RadioGroup>
      </section>

      <section className="settings-section">
        <h2>Color theme</h2>
        <RadioGroup
          label="Color theme"
          className="settings-choice-grid settings-choice-grid--colors"
        >
          {COLOR_THEMES.map((item) => (
            <ChoiceCard
              key={item.id}
              checked={selectedColor === item.id}
              onChange={(event) =>
                onAcademyThemeChange?.(
                  item.id,
                  themeRevealOriginFromClick(event) ?? undefined,
                )
              }
              label={item.name}
              note={item.note}
              className="settings-choice-card--stacked settings-choice-card--theme"
              preview={<MiniSurface variant={item.id} previewMode="dark" />}
            />
          ))}
        </RadioGroup>
      </section>

      <AppearanceAdditionalSettings
        pageTabColors={pageTabColors}
        onPageTabColorsChange={onPageTabColorsChange}
      />
    </div>
  );
}
