import { ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ArrowsInLineHorizontal } from "@phosphor-icons/react/ArrowsInLineHorizontal";
import { Check } from "@phosphor-icons/react/Check";
import { CircleHalf } from "@phosphor-icons/react/CircleHalf";
import { Keyboard } from "@phosphor-icons/react/Keyboard";
import { SidebarSimple } from "@phosphor-icons/react/SidebarSimple";
import { Sparkle } from "@phosphor-icons/react/Sparkle";
import { Stack } from "@phosphor-icons/react/Stack";
import { Tabs } from "@phosphor-icons/react/Tabs";
import { TextAa } from "@phosphor-icons/react/TextAa";
import { useEffect, useState } from "react";
import {
  academyThemes,
  getThemeRotationPreferences,
  persistThemeRotationPreferences,
} from "../themes";
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
import { RadioGroup, SettingRow, SettingsToggle } from "./SettingsControls";
import { ReadingModeSettings } from "./ReadingModeSettings";

interface AppearanceDeferredSettingsProps {
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
}

export default function AppearanceDeferredSettings({
  pageTabColors,
  onPageTabColorsChange,
}: AppearanceDeferredSettingsProps) {
  const [reduceAnimations, setReduceAnimations] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [hideScrollbars, setHideScrollbars] = useState(false);
  const [elevatedSurfaces, setElevatedSurfaces] = useState(true);
  const [textSize, setTextSize] = useState("default");
  const [storageReady, setStorageReady] = useState(false);
  const shortcutPlatformPreference = useShortcutPlatformPreference();
  const [themeRotation, setThemeRotation] = useState({
    enabled: false,
    pool: academyThemes.map((theme) => theme.id),
  });

  const updateThemeRotation = (
    next: Parameters<typeof persistThemeRotationPreferences>[0],
  ) => setThemeRotation(persistThemeRotationPreferences(next));

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
    setReduceAnimations(
      readStoredBoolean("veolms-reduce-animations", false),
    );
    setHighContrast(readStoredBoolean("veolms-high-contrast", false));
    setCompactLayout(readStoredBoolean("veolms-compact-layout", false));
    setHideScrollbars(readStoredBoolean("veolms-hide-scrollbars", false));
    setElevatedSurfaces(readElevatedSurfaces());
    setTextSize(readStored("veolms-text-size", "default"));
    setThemeRotation(getThemeRotationPreferences());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.reduceAnimations = String(reduceAnimations);
    localStorage.setItem("veolms-reduce-animations", String(reduceAnimations));
  }, [reduceAnimations, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.highContrast = String(highContrast);
    localStorage.setItem("veolms-high-contrast", String(highContrast));
  }, [highContrast, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.compactLayout = String(compactLayout);
    localStorage.setItem("veolms-compact-layout", String(compactLayout));
  }, [compactLayout, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.hideScrollbars = String(hideScrollbars);
    localStorage.setItem("veolms-hide-scrollbars", String(hideScrollbars));
  }, [hideScrollbars, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.elevatedSurfaces = String(elevatedSurfaces);
    localStorage.setItem(ELEVATED_SURFACES_KEY, String(elevatedSurfaces));
  }, [elevatedSurfaces, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.textSize = textSize;
    localStorage.setItem("veolms-text-size", textSize);
  }, [storageReady, textSize]);

  return (
    <>
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
              {academyThemes.map((item) => {
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
          <SettingRow icon={Sparkle} label="Reduce animations" note="Minimize motion for a calmer experience">
            <SettingsToggle checked={reduceAnimations} onChange={setReduceAnimations} label="Reduce animations" />
          </SettingRow>
          <SettingRow icon={CircleHalf} label="High contrast mode" note="Increase contrast for better visibility">
            <SettingsToggle checked={highContrast} onChange={setHighContrast} label="High contrast mode" />
          </SettingRow>
          <SettingRow icon={ArrowsInLineHorizontal} label="Compact layout" note="Show more content in less space">
            <SettingsToggle checked={compactLayout} onChange={setCompactLayout} label="Compact layout" />
          </SettingRow>
          <SettingRow icon={SidebarSimple} label="Hide scrollbars" note="Keep scrolling enabled while hiding the visual scrollbars">
            <SettingsToggle checked={hideScrollbars} onChange={setHideScrollbars} label="Hide scrollbars" />
          </SettingRow>
          <SettingRow icon={Stack} label="Elevated surfaces" note="Add subtle edge light and depth to cards and navigation">
            <SettingsToggle checked={elevatedSurfaces} onChange={setElevatedSurfaces} label="Elevated surfaces" />
          </SettingRow>
          <SettingRow className="settings-row--shortcut-platform" icon={Keyboard} label="Shortcut key style" note="Follow your system or choose which modifier keys shortcut hints use">
            <RadioGroup label="Shortcut key style" className="settings-segmented settings-segmented--shortcut-platform">
              {([
                ["system", "Follow system"],
                ["windows", "Windows"],
                ["mac", "Mac"],
              ] as const satisfies readonly (readonly [ShortcutPlatformPreference, string])[]).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={shortcutPlatformPreference === value} tabIndex={shortcutPlatformPreference === value ? 0 : -1} className={shortcutPlatformPreference === value ? "is-selected" : ""} onClick={() => persistShortcutPlatformPreference(value)}>
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
          <SettingRow className="settings-row--text-size" icon={TextAa} label="Text size" note="Adjust the size of text across the application">
            <RadioGroup label="Text size" className="settings-segmented settings-segmented--text-size">
              {([[
                "small", "Small"], ["default", "Default"], ["large", "Large"], ["extra-large", "Extra large"],
              ] as const).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={textSize === value} tabIndex={textSize === value ? 0 : -1} className={textSize === value ? "is-selected" : ""} onClick={() => setTextSize(value)}>
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
          <SettingRow className="settings-row--page-tab-colors" icon={Tabs} label="Page tab colors" note="Follow the sidebar or choose an independent tab style">
            <RadioGroup label="Page tab colors" className="settings-segmented settings-segmented--page-tabs">
              {([[
                "follow-sidebar", "Follow sidebar"], ["multicolor", "Multicolor"], ["monochrome", "Monochrome"],
              ] as const).map(([value, label]) => (
                <button type="button" key={value} role="radio" aria-checked={pageTabColors === value} tabIndex={pageTabColors === value ? 0 : -1} className={pageTabColors === value ? "is-selected" : ""} onClick={() => onPageTabColorsChange(value)}>
                  {label}
                </button>
              ))}
            </RadioGroup>
          </SettingRow>
        </div>
      </section>
    </>
  );
}
