import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
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
import { useHydrated } from "../../courses/viewerCourseState";
import {
  readEarlyLessonListTheme,
  rememberPlayerTheme,
} from "./playerThemeEarlyState";

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

const subscribeToNothing = () => () => {};

const readCachedAcademyTheme = () =>
  readPlatformAppearance().defaultVideoPlayerTheme;
const readPrerenderedTheme = () => DEFAULT_PLAYER_THEME_ID;

/**
 * The academy's player theme (Platform > Appearance), which everyone plays
 * in until they pick their own. The prerendered page and its hydration use
 * YouTube; anything drawn after starts with the default this browser last
 * heard; the API's answer wins once it comes.
 */
export function useAcademyPlayerTheme(): string {
  const cached = useSyncExternalStore(
    subscribeToNothing,
    readCachedAcademyTheme,
    readPrerenderedTheme,
  );
  const { data } = usePublicPlatformSettings();
  return data?.appearance.defaultVideoPlayerTheme ?? cached;
}

const subscribeToThemeChoice = (onChange: () => void) => {
  const onStorage = (event: StorageEvent) => {
    if (event.key === LEARNING_PREFERENCES_KEY) onChange();
  };
  window.addEventListener(LEARNING_PREFERENCES_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(LEARNING_PREFERENCES_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
};
const readThemeChoice = () => readLearningPreferences().playerThemeChoice;
const readNoThemeChoice = () => "";

/**
 * The player theme the lessons list is drawn in (the page's column, the
 * Lessons drawer, the full-screen panel), as `data-lesson-theme`: every
 * theme but YouTube, which keeps the app's own look.
 */
export function useLessonListTheme(): string | undefined {
  const { id } = useLearningPlayerTheme();
  const hydrated = useHydrated();
  // The prerendered list is given its theme by the head script before it is
  // painted; hydration reads back the same value, so nothing changes.
  if (!hydrated) return readEarlyLessonListTheme();
  return id === DEFAULT_PLAYER_THEME_ID ? undefined : id;
}

export function useLearningPlayerTheme(): PlayerThemeDefinition {
  // Empty while this browser follows the academy's default, and in the
  // prerendered page and its hydration (drawn as YouTube, see
  // playerThemeEarlyState). A player drawn after that starts in the saved
  // theme, with no YouTube frame first.
  const choice = useSyncExternalStore(
    subscribeToThemeChoice,
    readThemeChoice,
    readNoThemeChoice,
  );
  const [previewTheme, setPreviewTheme] = useState<string | null>(null);
  const academyTheme = useAcademyPlayerTheme();
  const hydrated = useHydrated();
  // A plugin's themes can be registered after the player mounts.
  const themes = usePlayerThemes();
  const theme = previewTheme ?? (choice || academyTheme);

  useEffect(() => {
    // A saved choice ends any preview.
    const endPreview = () => setPreviewTheme(null);
    const syncPreview = (event: Event) =>
      setPreviewTheme((event as CustomEvent<string | null>).detail);
    const endPreviewFromStorage = (event: StorageEvent) => {
      if (event.key === LEARNING_PREFERENCES_KEY) endPreview();
    };
    window.addEventListener(LEARNING_PREFERENCES_EVENT, endPreview);
    window.addEventListener(PLAYER_THEME_PREVIEW_EVENT, syncPreview);
    window.addEventListener("storage", endPreviewFromStorage);
    return () => {
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, endPreview);
      window.removeEventListener(PLAYER_THEME_PREVIEW_EVENT, syncPreview);
      window.removeEventListener("storage", endPreviewFromStorage);
    };
  }, []);

  const resolved = useMemo(() => {
    // A theme that is no longer offered (hidden, or its plugin is not
    // installed) plays as the academy's default, then as YouTube.
    const base =
      themes.find((entry) => entry.id === theme) ??
      themes.find((entry) => entry.id === academyTheme) ??
      resolvePlayerTheme(DEFAULT_PLAYER_THEME_ID);
    return inAppPalette(base);
  }, [academyTheme, theme, themes]);

  // What the next reload's head script draws the page in.
  useEffect(() => {
    if (hydrated && previewTheme === null) rememberPlayerTheme(resolved.id);
  }, [hydrated, previewTheme, resolved.id]);

  return resolved;
}

/**
 * Themes with a palette of their own keep it; only the default one is
 * recoloured with the app's accent and surfaces.
 */
function inAppPalette(base: PlayerThemeDefinition): PlayerThemeDefinition {
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
}

/**
 * The mini player's theme: YouTube in the app's colours, whatever theme the
 * lesson player wears (the user's call), so its round play, pause, expand
 * and close keys look the same in every theme.
 */
export const MINI_PLAYER_THEME: PlayerThemeDefinition = inAppPalette(
  resolvePlayerTheme(DEFAULT_PLAYER_THEME_ID),
);
