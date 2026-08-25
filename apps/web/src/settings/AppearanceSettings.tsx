import { DeviceMobile } from "@phosphor-icons/react/DeviceMobile";
import { Moon } from "@phosphor-icons/react/Moon";
import { Sun } from "@phosphor-icons/react/Sun";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { academyThemes } from "../themes";
import type { AcademyTheme } from "../themes";
import { themeRevealOriginFromClick } from "../shell/themeViewTransition";
import type { ThemeRevealOrigin } from "../shell/themeViewTransition";
import type { PageTabColors } from "./settingsPreferences";
import { ChoiceCard, RadioGroup } from "./SettingsControls";
import { MiniSurface } from "./SettingsPreviews";

const DeferredAppearanceSettings = lazy(
  () => import("./AppearanceDeferredSettings"),
);

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
  const [showDeferredSettings, setShowDeferredSettings] = useState(false);
  const deferredSentinelRef = useRef<HTMLDivElement>(null);
  const selectedColor = COLOR_THEMES.some((item) => item.id === academyTheme)
    ? academyTheme
    : "codex";

  useEffect(() => {
    const sentinel = deferredSentinelRef.current;
    if (!sentinel || showDeferredSettings) return;

    if (!("IntersectionObserver" in window)) {
      setShowDeferredSettings(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setShowDeferredSettings(true);
        observer.disconnect();
      },
      { rootMargin: "600px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [showDeferredSettings]);

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

      <div
        ref={deferredSentinelRef}
        className="settings-deferred-sentinel"
        aria-hidden="true"
      />
      {showDeferredSettings && (
        <Suspense fallback={null}>
          <DeferredAppearanceSettings
            pageTabColors={pageTabColors}
            onPageTabColorsChange={onPageTabColorsChange}
          />
        </Suspense>
      )}
    </div>
  );
}
