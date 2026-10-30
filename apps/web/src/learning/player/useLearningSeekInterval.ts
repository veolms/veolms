import { useEffect, useState } from "react";
import {
  LEARNING_PREFERENCES_EVENT,
  LEARNING_PREFERENCES_KEY,
  LEARNING_SEEK_INTERVAL_DEFAULT,
  readLearningPreferences,
} from "../../settings/settingsPreferences";

/**
 * The "Skip interval" from Settings → Learning. It follows changes made in
 * this tab or another one: the lesson player stays mounted while the learner
 * visits Settings, so a value read once would go stale.
 */
export function useLearningSeekInterval(): number {
  const [seconds, setSeconds] = useState(LEARNING_SEEK_INTERVAL_DEFAULT);

  useEffect(() => {
    const sync = () =>
      setSeconds(readLearningPreferences().seekIntervalSeconds);
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

  return seconds;
}
