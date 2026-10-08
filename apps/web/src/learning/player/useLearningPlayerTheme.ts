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
        // Mostly opaque, and a step darker than the app's surface (towards
        // its canvas colour): the menu has no blur behind it, so it has to
        // carry its own contrast over a bright picture.
        menuSurface:
          "color-mix(in srgb, color-mix(in srgb, var(--surface) 45%, var(--canvas)) 90%, transparent)",
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
