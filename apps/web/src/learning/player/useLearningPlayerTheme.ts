import { useEffect, useState } from "react";
import type { BuiltInPlayerThemeId } from "@veolms/video-player";
import {
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  readLearningPreferences,
} from "../../settings/settingsPreferences";

export function useLearningPlayerTheme(): BuiltInPlayerThemeId {
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

  return theme;
}
