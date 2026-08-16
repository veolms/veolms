import { useEffect } from "react";
import {
  applyReadingModePreferences,
  READING_MODE_CHANGE_EVENT,
  READING_MODE_STORAGE_KEY,
  readReadingModePreferences,
} from "./readingModePreferences";

export function ReadingModeEffects() {
  useEffect(() => {
    const refresh = () =>
      applyReadingModePreferences(readReadingModePreferences());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === READING_MODE_STORAGE_KEY || event.key === null) {
        refresh();
      }
    };

    refresh();
    window.addEventListener(READING_MODE_CHANGE_EVENT, refresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(READING_MODE_CHANGE_EVENT, refresh);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  return (
    <>
      <div
        className="reading-mode-effects reading-mode-effects__texture"
        data-reading-mode-effects
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__temperature"
        aria-hidden="true"
      />
      <div
        className="reading-mode-effects reading-mode-effects__colors"
        aria-hidden="true"
      />
    </>
  );
}
