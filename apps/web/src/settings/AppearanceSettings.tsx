import { useEffect, useState } from "react";
import {
  ArrowsClockwise,
  ArrowsInLineHorizontal,
  Check,
  CircleHalf,
  DeviceMobile,
  Keyboard,
  Moon,
  SidebarSimple,
  Sparkle,
  Stack,
  Sun,
  Tabs,
  TextAa,
} from "@phosphor-icons/react";
import {
  academyThemes,
  getThemeRotationPreferences,
  persistThemeRotationPreferences,
} from "../themes";
import type { AcademyTheme } from "../themes";
import {
  ChoiceCard,
  RadioGroup,
  SettingRow,
  SettingsToggle,
} from "./SettingsControls";
import { MiniSurface } from "./SettingsPreviews";
import { ReadingModeSettings } from "./ReadingModeSettings";
import { persistShortcutPlatformPreference } from "../keyboardShortcuts";
import type { ShortcutPlatformPreference } from "../keyboardShortcuts";
import { useShortcutPlatformPreference } from "../useShortcutPlatform";
import {
  ELEVATED_SURFACES_KEY,
  readElevatedSurfaces,
  readStored,
  readStoredBoolean,
} from "./settingsPreferences";
import type { PageTabColors } from "./settingsPreferences";

export type DisplayMode = "light" | "dark" | "device";
const FONT_FAMILIES = [
  ["default", "Manrope"],
  ["system", "System Default"],
  ["cursive", "Cursive"],
] as const;
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

// Keep Settings in lockstep with the sidebar and mobile palette menus. This is
// deliberately the shared registry rather than a display-only subset.
const COLOR_THEMES = academyThemes;

export interface AppearanceSettingsProps {
  theme: DisplayMode;
  onThemeChange?: (theme: DisplayMode) => void;
  academyTheme: string;
  onAcademyThemeChange?: (themeId: AcademyTheme["id"]) => void;
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
  const [reduceAnimations, setReduceAnimations] = useState(() =>
    readStoredBoolean("veolms-reduce-animations", false),
  );
  const [highContrast, setHighContrast] = useState(() =>
    readStoredBoolean("veolms-high-contrast", false),
  );
  const [compactLayout, setCompactLayout] = useState(() =>
    readStoredBoolean("veolms-compact-layout", false),
  );
  const [hideScrollbars, setHideScrollbars] = useState(() =>
    readStoredBoolean("veolms-hide-scrollbars", false),
  );
  const [elevatedSurfaces, setElevatedSurfaces] =
    useState(readElevatedSurfaces);
  const [textSize, setTextSize] = useState(() =>
    readStored("veolms-text-size", "default"),
  );
  const [fontFamily, setFontFamily] = useState(() =>
    readStored("veolms-font-family", "default"),
  );
  const shortcutPlatformPreference = useShortcutPlatformPreference();
  const [themeRotation, setThemeRotation] = useState(
    getThemeRotationPreferences,
  );
  const selectedColor = COLOR_THEMES.some((item) => item.id === academyTheme)
    ? academyTheme
    : "codex";

  const updateThemeRotation = (
    next: Parameters<typeof persistThemeRotationPreferences>[0],
  ) => {
    setThemeRotation(persistThemeRotationPreferences(next));
  };

  const toggleThemeInPool = (themeId: string) => {
    const isSelected = themeRotation.pool.includes(themeId);
    if (isSelected && themeRotation.pool.length <= 2) return;

    updateThemeRotation({
      ...themeRotation,
      pool: isSelected
        ? themeRotation.pool.filter((id) => id !== themeId)
        : [...themeRotation.pool, themeId],
    });
  };

  useEffect(() => {
    document.documentElement.dataset.reduceAnimations =
      String(reduceAnimations);
    window.localStorage.setItem(
      "veolms-reduce-animations",
      String(reduceAnimations),
    );
  }, [reduceAnimations]);
  useEffect(() => {
    document.documentElement.dataset.highContrast = String(highContrast);
    window.localStorage.setItem("veolms-high-contrast", String(highContrast));
  }, [highContrast]);
  useEffect(() => {
    document.documentElement.dataset.compactLayout = String(compactLayout);
    window.localStorage.setItem("veolms-compact-layout", String(compactLayout));
  }, [compactLayout]);
  useEffect(() => {
    document.documentElement.dataset.hideScrollbars = String(hideScrollbars);
    window.localStorage.setItem(
      "veolms-hide-scrollbars",
      String(hideScrollbars),
    );
  }, [hideScrollbars]);
  useEffect(() => {
    document.documentElement.dataset.elevatedSurfaces =
      String(elevatedSurfaces);
    window.localStorage.setItem(
      ELEVATED_SURFACES_KEY,
      String(elevatedSurfaces),
    );
  }, [elevatedSurfaces]);
  useEffect(() => {
    document.documentElement.dataset.textSize = textSize;
    window.localStorage.setItem("veolms-text-size", textSize);
  }, [textSize]);
  useEffect(() => {
    if (fontFamily === "default") {
      document.documentElement.removeAttribute("data-font-family");
    } else {
      document.documentElement.dataset.fontFamily = fontFamily;
    }

    window.localStorage.setItem("veolms-font-family", fontFamily);
  }, [fontFamily]);
  return (
    <div className="settings-content">
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
              onChange={() => onThemeChange?.(id)}
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
              onChange={() => onAcademyThemeChange?.(item.id)}
              label={item.name}
              note={item.note}
              className="settings-choice-card--stacked settings-choice-card--theme"
              preview={<MiniSurface variant={item.id} previewMode="dark" />}
            />
          ))}
        </RadioGroup>
      </section>

      <ReadingModeSettings />

      <section className="settings-section settings-theme-rotation">
        <h2>Theme rotation</h2>
        <div className="settings-row-list">
          <SettingRow
            icon={ArrowsClockwise}
            label="Random theme on app open"
            note="Start each new app session with a theme from your selected pool"
          >
            <SettingsToggle
              checked={themeRotation.enabled}
              onChange={(enabled) =>
                updateThemeRotation({ ...themeRotation, enabled })
              }
              label="Random theme on app open"
            />
          </SettingRow>
        </div>

        {themeRotation.enabled && (
          <div className="settings-theme-pool">
            <div className="settings-theme-pool__heading">
              <div>
                <h3>Theme pool</h3>
                <p>Select the themes that can appear when the app opens.</p>
              </div>
              <span>{themeRotation.pool.length} selected</span>
            </div>
            <div
              className="settings-theme-pool__options"
              role="group"
              aria-label="Themes included in random rotation"
            >
              {COLOR_THEMES.map((item) => {
                const isSelected = themeRotation.pool.includes(item.id);
                const isRequired = isSelected && themeRotation.pool.length <= 2;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="checkbox"
                    aria-checked={isSelected}
                    aria-disabled={isRequired}
                    className={isSelected ? "is-selected" : ""}
                    onClick={() => toggleThemeInPool(item.id)}
                    title={
                      isRequired
                        ? "Keep at least two themes in the rotation"
                        : undefined
                    }
                  >
                    <span
                      className={`settings-theme-pool__swatch ${item.darkInk ? "has-dark-ink" : ""}`}
                      style={{ backgroundColor: item.preview }}
                      aria-hidden="true"
                    >
                      {isSelected && <Check size={12} weight="bold" />}
                    </span>
                    <span className="settings-theme-pool__name">
                      <strong>{item.name}</strong>
                      <small>{item.note}</small>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="settings-theme-pool__footnote">
              Your current theme stays unchanged. Rotation begins the next time
              you open the app.
            </p>
          </div>
        )}
      </section>

      <section className="settings-section">
        <h2>Interface</h2>
        <div className="settings-row-list">
          <SettingRow
            icon={Sparkle}
            label="Reduce animations"
            note="Minimize motion for a calmer experience"
          >
            <SettingsToggle
              checked={reduceAnimations}
              onChange={setReduceAnimations}
              label="Reduce animations"
            />
          </SettingRow>
          <SettingRow
            icon={CircleHalf}
            label="High contrast mode"
            note="Increase contrast for better visibility"
          >
            <SettingsToggle
              checked={highContrast}
              onChange={setHighContrast}
              label="High contrast mode"
            />
          </SettingRow>
          <SettingRow
            icon={ArrowsInLineHorizontal}
            label="Compact layout"
            note="Show more content in less space"
          >
            <SettingsToggle
              checked={compactLayout}
              onChange={setCompactLayout}
              label="Compact layout"
            />
          </SettingRow>
          <SettingRow
            icon={SidebarSimple}
            label="Hide scrollbars"
            note="Keep scrolling enabled while hiding the visual scrollbars"
          >
            <SettingsToggle
              checked={hideScrollbars}
              onChange={setHideScrollbars}
              label="Hide scrollbars"
            />
          </SettingRow>
          <SettingRow
            icon={Stack}
            label="Elevated surfaces"
            note="Add subtle edge light and depth to cards and navigation"
          >
            <SettingsToggle
              checked={elevatedSurfaces}
              onChange={setElevatedSurfaces}
              label="Elevated surfaces"
            />
          </SettingRow>
          <SettingRow
            className="settings-row--shortcut-platform"
            icon={Keyboard}
            label="Shortcut key style"
            note="Follow your system or choose which modifier keys shortcut hints use"
          >
            <RadioGroup
              label="Shortcut key style"
              className="settings-segmented settings-segmented--shortcut-platform"
            >
              {(
                [
                  ["system", "Follow system"],
                  ["windows", "Windows"],
                  ["mac", "Mac"],
                ] as const satisfies readonly (readonly [
                  ShortcutPlatformPreference,
                  string,
                ])[]
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={shortcutPlatformPreference === value}
                  tabIndex={shortcutPlatformPreference === value ? 0 : -1}
                  className={
                    shortcutPlatformPreference === value ? "is-selected" : ""
                  }
                  onClick={() => persistShortcutPlatformPreference(value)}
                >
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
          <SettingRow
            icon={TextAa}
            label="Font family"
            note="Choose the font used across the application"
          >
            <RadioGroup
              label="Font family"
              className="settings-segmented settings-segmented--font-family"
            >
              {FONT_FAMILIES.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={fontFamily === value}
                  tabIndex={fontFamily === value ? 0 : -1}
                  className={fontFamily === value ? "is-selected" : ""}
                  onClick={() => setFontFamily(value)}
                  style={{
                    fontFamily:
                      value === "default"
                        ? '"Manrope Variable", Manrope, sans-serif'
                        : value === "system"
                          ? "system-ui"
                          : "cursive",
                  }}
                >
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
          <SettingRow
            className="settings-row--text-size"
            icon={TextAa}
            label="Text size"
            note="Adjust the size of text across the application"
          >
            <RadioGroup
              label="Text size"
              className="settings-segmented settings-segmented--text-size"
            >
              {(
                [
                  ["small", "Small"],
                  ["default", "Default"],
                  ["large", "Large"],
                  ["extra-large", "Extra large"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={textSize === value}
                  tabIndex={textSize === value ? 0 : -1}
                  className={textSize === value ? "is-selected" : ""}
                  onClick={() => setTextSize(value)}
                >
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
          <SettingRow
            className="settings-row--page-tab-colors"
            icon={Tabs}
            label="Page tab colors"
            note="Follow the sidebar or choose an independent tab style"
          >
            <RadioGroup
              label="Page tab colors"
              className="settings-segmented settings-segmented--page-tabs"
            >
              {(
                [
                  ["follow-sidebar", "Follow sidebar"],
                  ["multicolor", "Multicolor"],
                  ["monochrome", "Monochrome"],
                ] as const
              ).map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="radio"
                  aria-checked={pageTabColors === value}
                  tabIndex={pageTabColors === value ? 0 : -1}
                  className={pageTabColors === value ? "is-selected" : ""}
                  onClick={() => onPageTabColorsChange(value)}
                >
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
        </div>
      </section>
    </div>
  );
}
