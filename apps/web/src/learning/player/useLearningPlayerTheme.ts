import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PLAYER_THEME_ID,
  createPlayerTheme,
  resolvePlayerTheme,
  usePlayerThemes,
  type PlayerThemeDefinition,
} from "@veolms/video-player";
import {
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  readLearningPreferences,
} from "../../settings/settingsPreferences";
import { usePublicPlatformSettings } from "../../services/platform";
import { readPlatformAppearance } from "../../store/appearanceDefaults";

/** Fired with the theme shown for a moment (or null) while one is picked. */
const PLAYER_THEME_PREVIEW_EVENT = "veolms:player-theme-preview";

/**
 * Shows a theme on every player without saving it, while the arrow keys
 * move through the player's theme menu; null goes back to the saved one.
 */
export function previewPlayerTheme(themeId: string | null): void {
  window.dispatchEvent(
    new CustomEvent<string | null>(PLAYER_THEME_PREVIEW_EVENT, {
      detail: themeId,
    }),
  );
}

/**
 * The academy's player theme (Platform > Appearance), which everyone plays
 * in until they pick their own. The first render uses YouTube, as the
 * prerendered page does; then the default this browser last heard, then the
 * API's.
 */
export function useAcademyPlayerTheme(): string {
  const [cached, setCached] = useState<string>(DEFAULT_PLAYER_THEME_ID);
  const { data } = usePublicPlatformSettings();
  useEffect(() => {
    setCached(readPlatformAppearance().defaultVideoPlayerTheme);
  }, []);
  return data?.appearance.defaultVideoPlayerTheme ?? cached;
}

/**
 * The player theme the lessons list is drawn in (the page's column, the
 * Lessons drawer, the full-screen panel), as `data-lesson-theme`: every
 * theme but YouTube, which keeps the app's own look.
 */
export function useLessonListTheme(): string | undefined {
  const { id } = useLearningPlayerTheme();
  return id === DEFAULT_PLAYER_THEME_ID ? undefined : id;
}

export function useLearningPlayerTheme(): PlayerThemeDefinition {
  // Empty while this browser follows the academy's default.
  const [choice, setChoice] = useState("");
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const academyTheme = useAcademyPlayerTheme();
  // A plugin's themes can be registered after the player mounts.
  const themes = usePlayerThemes();
  const theme = previewTheme ?? (choice || academyTheme);

  useEffect(() => {
    const syncTheme = () => {
      setChoice(readLearningPreferences().playerThemeChoice);
      // A saved choice ends any preview.
      setPreviewTheme(null);
    };
    const syncPreview = (event: Event) =>
      setPreviewTheme((event as CustomEvent<string | null>).detail);
    const syncStorageTheme = (event: StorageEvent) => {
      if (event.key === LEARNING_PREFERENCES_KEY) syncTheme();
    };

    syncTheme();
    window.addEventListener(LEARNING_PREFERENCES_EVENT, syncTheme);
    window.addEventListener(PLAYER_THEME_PREVIEW_EVENT, syncPreview);
    window.addEventListener("storage", syncStorageTheme);
    return () => {
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, syncTheme);
      window.removeEventListener(PLAYER_THEME_PREVIEW_EVENT, syncPreview);
      window.removeEventListener("storage", syncStorageTheme);
    };
  }, []);

  return useMemo(() => {
    // A theme that is no longer offered (hidden, or its plugin is not
    // installed) plays as the academy's default, then as YouTube.
    const base =
      themes.find((entry) => entry.id === theme) ??
      themes.find((entry) => entry.id === academyTheme) ??
      resolvePlayerTheme(DEFAULT_PLAYER_THEME_ID);
    // Themes with a palette of their own keep it; only the default one is
    // recoloured with the app's accent and surfaces.
    if (!base.usesAppPalette) return base;
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
  }, [academyTheme, theme, themes]);
}
