import { ArrowsClockwiseIcon as ArrowsClockwise } from "@phosphor-icons/react/ArrowsClockwise";
import { ArrowsInLineHorizontalIcon as ArrowsInLineHorizontal } from "@phosphor-icons/react/ArrowsInLineHorizontal";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { CircleHalfIcon as CircleHalf } from "@phosphor-icons/react/CircleHalf";
import { CornersOutIcon as CornersOut } from "@phosphor-icons/react/CornersOut";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { SparkleIcon as Sparkle } from "@phosphor-icons/react/Sparkle";
import { StackIcon as Stack } from "@phosphor-icons/react/Stack";
import { TabsIcon as Tabs } from "@phosphor-icons/react/Tabs";
import { TextAaIcon as TextAa } from "@phosphor-icons/react/TextAa";
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
  CONTROL_RADIUS_CUSTOM_MAX,
  CONTROL_RADIUS_CUSTOM_MIN,
  CONTROL_RADIUS_DEFAULT,
  CONTROL_RADIUS_PRESETS,
  ELEVATED_SURFACES_KEY,
  normalizeControlRadiusCustom,
  persistControlRadiusPreference,
  readControlRadiusPreference,
  readElevatedSurfaces,
  readStored,
  readStoredBoolean,
} from "./settingsPreferences";
import type { PageTabColors } from "./settingsPreferences";
import { RadioGroup, SettingRow, SettingsToggle } from "./SettingsControls";
import { ReadingModeSettings } from "./ReadingModeSettings";
import { ScrollbarSettings } from "./scrollbars/ScrollbarSettings";

interface AppearanceAdditionalSettingsProps {
  pageTabColors: PageTabColors;
  onPageTabColorsChange: (colors: PageTabColors) => void;
}

export default function AppearanceAdditionalSettings({
  pageTabColors,
  onPageTabColorsChange,
}: AppearanceAdditionalSettingsProps) {
  const [reduceAnimations, setReduceAnimations] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [compactLayout, setCompactLayout] = useState(false);
  const [elevatedSurfaces, setElevatedSurfaces] = useState(true);
  const [controlRadius, setControlRadius] = useState({
    ...CONTROL_RADIUS_DEFAULT,
  });
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
    setReduceAnimations(readStoredBoolean("veolms-reduce-animations", false));
    setHighContrast(readStoredBoolean("veolms-high-contrast", false));
    setCompactLayout(readStoredBoolean("veolms-compact-layout", false));
    setElevatedSurfaces(readElevatedSurfaces());
    setControlRadius(readControlRadiusPreference());
    setTextSize(readStored("veolms-text-size", "default"));
    setThemeRotation(getThemeRotationPreferences());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.reduceAnimations =
      String(reduceAnimations);
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
    document.documentElement.dataset.elevatedSurfaces =
      String(elevatedSurfaces);
    localStorage.setItem(ELEVATED_SURFACES_KEY, String(elevatedSurfaces));
  }, [elevatedSurfaces, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    persistControlRadiusPreference(controlRadius);
  }, [controlRadius, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    document.documentElement.dataset.textSize = textSize;
    localStorage.setItem("veolms-text-size", textSize);
  }, [storageReady, textSize]);

  return (
    <>
      <ReadingModeSettings />

      <ScrollbarSettings />

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
          <SettingRow
            className="settings-row--control-radius"
            icon={CornersOut}
            label="Control roundness"
            note="Pill applies to action buttons. Tabs stay square, while fields and option cards stop at Rounded"
          >
            <div className="settings-control-radius">
              <RadioGroup
                label="Control roundness"
                className="settings-control-radius__presets"
              >
                {CONTROL_RADIUS_PRESETS.map(({ id, label, radius }) => (
                  <button
                    type="button"
                    key={id}
                    role="radio"
                    aria-checked={controlRadius.preset === id}
                    tabIndex={controlRadius.preset === id ? 0 : -1}
                    className={controlRadius.preset === id ? "is-selected" : ""}
                    style={{ borderRadius: radius }}
                    data-control-radius-preview
                    onClick={() =>
                      setControlRadius((current) => ({
                        ...current,
                        preset: id,
                      }))
                    }
                  >
                    {label}
                  </button>
                ))}
                <button
                  type="button"
                  role="radio"
                  aria-checked={controlRadius.preset === "custom"}
                  tabIndex={controlRadius.preset === "custom" ? 0 : -1}
                  className={
                    controlRadius.preset === "custom" ? "is-selected" : ""
                  }
                  style={{ borderRadius: controlRadius.customPx }}
                  data-control-radius-preview
                  onClick={() =>
                    setControlRadius((current) => ({
                      ...current,
                      preset: "custom",
                    }))
                  }
                >
                  Custom
                </button>
              </RadioGroup>
              {controlRadius.preset === "custom" && (
                <label className="settings-control-radius__custom">
                  <span>Radius</span>
                  <span className="settings-control-radius__input">
                    <input
                      type="number"
                      min={CONTROL_RADIUS_CUSTOM_MIN}
                      max={CONTROL_RADIUS_CUSTOM_MAX}
                      step="1"
                      inputMode="numeric"
                      value={controlRadius.customPx}
                      aria-label="Custom control radius in pixels"
                      onChange={(event) =>
                        setControlRadius((current) => ({
                          ...current,
                          customPx: normalizeControlRadiusCustom(
                            event.target.value,
                          ),
                        }))
                      }
                    />
                    <span aria-hidden="true">px</span>
                  </span>
                </label>
              )}
            </div>
          </SettingRow>
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
    </>
  );
}
