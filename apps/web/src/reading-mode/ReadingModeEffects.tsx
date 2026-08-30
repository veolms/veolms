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
    let resizeFrame: number | null = null;
    const scheduleRefresh = () => {
      if (resizeFrame !== null) return;
      resizeFrame = window.requestAnimationFrame(() => {
        resizeFrame = null;
        refresh();
      });
    };
    window.addEventListener(READING_MODE_CHANGE_EVENT, refresh);
    window.addEventListener("resize", scheduleRefresh);
    window.addEventListener("storage", handleStorage);
    return () => {
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
      window.removeEventListener(READING_MODE_CHANGE_EVENT, refresh);
      window.removeEventListener("resize", scheduleRefresh);
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
