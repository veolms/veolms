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
import { useCurrentUser } from "../../services/auth";
import { hasAdminRole } from "../../shell/workspaceRole";

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
 * Only admins choose a player theme for now (Settings and the player's own
 * settings menu offer it to them alone); everyone else plays in the default
 * one, whatever was chosen before the picker was taken away.
 */
export function useCanChoosePlayerTheme(): boolean {
  const { data: currentUser } = useCurrentUser();
  return hasAdminRole(currentUser?.roles);
}

export function useLearningPlayerTheme(): PlayerThemeDefinition {
  const [storedTheme, setTheme] = useState<string>(DEFAULT_PLAYER_THEME_ID);
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  // A plugin's themes can be registered after the player mounts.
  const themes = usePlayerThemes();
  const theme = useCanChoosePlayerTheme()
    ? (previewTheme ?? storedTheme)
    : DEFAULT_PLAYER_THEME_ID;

  useEffect(() => {
    const syncTheme = () => {
      setTheme(readLearningPreferences().videoPlayerTheme);
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
    const base =
      themes.find((entry) => entry.id === theme) ??
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
  }, [theme, themes]);
}
