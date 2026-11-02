import { useEffect, useState } from "react";
import {
  LEARNING_PREFERENCE_DEFAULTS,
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  readLearningPreferences,
  type LearningPreferences,
} from "../settings/settingsPreferences";

/**
 * One learning setting, as it is now and as it changes, here (the settings
 * page, the curriculum's menus) or in another tab. Until the page runs it
 * is the default, which is what a page built ahead of time was drawn with.
 */
export function useLearningPreferenceValue<K extends keyof LearningPreferences>(
  key: K,
): LearningPreferences[K] {
  const [value, setValue] = useState<LearningPreferences[K]>(
    LEARNING_PREFERENCE_DEFAULTS[key],
  );

  useEffect(() => {
    const sync = () => setValue(readLearningPreferences()[key]);
    const syncStorage = (event: StorageEvent) => {
      if (event.key === LEARNING_PREFERENCES_KEY) sync();
    };

    sync();
    window.addEventListener(LEARNING_PREFERENCES_EVENT, sync);
    window.addEventListener("storage", syncStorage);
    return () => {
      window.removeEventListener(LEARNING_PREFERENCES_EVENT, sync);
      window.removeEventListener("storage", syncStorage);
    };
  }, [key]);

  return value;
}
