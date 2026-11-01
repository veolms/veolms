import { useEffect, useState } from "react";
import {
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  readLearningPreferences,
} from "../settings/settingsPreferences";

/**
 * Whether lessons are numbered straight through the course (1 to the last
 * lesson) instead of from 1 again in every section, which is the default.
 * It follows the learning setting as it is changed, here or in another tab.
 */
export function useContinuousLessonNumbering(): boolean {
  const [continuous, setContinuous] = useState(false);

  useEffect(() => {
    const sync = () =>
      setContinuous(readLearningPreferences().continuousLessonNumbering);
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
  }, []);

  return continuous;
}
