import { useEffect, useMemo, useState } from "react";
import {
  createPlayerTheme,
  resolvePlayerTheme,
  type BuiltInPlayerThemeId,
  type PlayerThemeDefinition,
} from "@veolms/video-player";
import {
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  readLearningPreferences,
} from "../../settings/settingsPreferences";

export function useLearningPlayerTheme(): PlayerThemeDefinition {
  const [theme, setTheme] = useState<BuiltInPlayerThemeId>("youtube");

  useEffect(() => {
    const syncTheme = () =>
      setTheme(readLearningPreferences().videoPlayerTheme);
    const syncStorageTheme = (event: StorageEvent) => {
      if (event.key === LEARNING_PREFERENCES_KEY) syncTheme();
    };

    syncTheme();
    window.addEventListener(LEARNING_PREFERENCES_EVENT, syncTheme);
    window.addEventListener("storage", syncStorageTheme);
    return () => {
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, syncTheme);
      window.removeEventListener("storage", syncStorageTheme);
    };
  }, []);

  return useMemo(() => {
    const base = resolvePlayerTheme(theme);
    return createPlayerTheme({
      id: base.id,
      label: base.label,
      description: base.description,
      base,
      tokens: {
        accent: "var(--accent)",
        accentContrast: "var(--on-accent, #fff)",
        menuSurface: "color-mix(in srgb, var(--surface) 46%, transparent)",
        menuSolidSurface: "var(--surface)",
        menuText: "var(--text)",
        menuTextMuted: "var(--text-secondary)",
        menuBorder: "transparent",
        timelineTrack: "color-mix(in srgb, var(--text) 30%, transparent)",
        timelineBuffered: "color-mix(in srgb, var(--text) 46%, transparent)",
      },
    });
  }, [theme]);
}
