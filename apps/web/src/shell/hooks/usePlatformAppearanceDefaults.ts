import {
  useEffect,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from "react";
import { usePublicPlatformSettings } from "../../services/platform";
import {
  followsDefaultDisplayMode,
  rememberPlatformAppearance,
} from "../../store/appearanceDefaults";
import {
  getDefaultAcademyTheme,
  getInitialAcademyTheme,
  getThemeRotationPreferences,
} from "../../themes";
import type { ThemePreference } from "../academyShellTypes";

export interface UsePlatformAppearanceDefaultsArgs {
  storedPreferencesReady: boolean;
  setTheme: Dispatch<SetStateAction<ThemePreference>>;
  setAcademyTheme: Dispatch<SetStateAction<string>>;
  appliedThemeRef: RefObject<"light" | "dark" | null>;
}

/**
 * Brings the academy's default look (Platform > Appearance) up to date once
 * the API answers. The page opened in the defaults this browser last heard,
 * or the ones the build was made with; a visitor who has not picked their
 * own mode or theme moves to newer ones at once, and every later visit opens
 * in them.
 */
export function usePlatformAppearanceDefaults({
  storedPreferencesReady,
  setTheme,
  setAcademyTheme,
  appliedThemeRef,
}: UsePlatformAppearanceDefaultsArgs) {
  const { data } = usePublicPlatformSettings({
    enabled: storedPreferencesReady,
  });
  const appearance = data?.appearance;

  useEffect(() => {
    if (!appearance || !storedPreferencesReady) return;
    // Remembered first: what the shell saves next is then compared with the
    // new default, so following it is not taken for a choice of one's own.
    rememberPlatformAppearance(appearance);

    if (
      followsDefaultDisplayMode() &&
      // The mode on screen, as the shell last applied it.
      document.documentElement.dataset.appearance !==
        appearance.defaultDisplayMode
    ) {
      // A new default is not the visitor's doing: switch without the
      // circular reveal that a click on the theme switch plays.
      appliedThemeRef.current = null;
      setTheme(appearance.defaultDisplayMode);
    }
    // Theme rotation picks a theme for each visit itself.
    if (!getThemeRotationPreferences().enabled) {
      const initialTheme = getInitialAcademyTheme();
      if (initialTheme === getDefaultAcademyTheme()) {
        setAcademyTheme(initialTheme);
      }
    }
  }, [
    appearance,
    appliedThemeRef,
    setAcademyTheme,
    setTheme,
    storedPreferencesReady,
  ]);
}
