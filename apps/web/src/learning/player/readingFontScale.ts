import { useCallback, useSyncExternalStore } from "react";

/**
 * How large a reading lesson's text is drawn, as a multiple of its usual
 * size. The learner sets it with the slider in the reading's controls; it
 * is kept in this browser, and the full player and the miniature of the
 * same reading read the one value, so the miniature keeps the full
 * player's line breaks.
 */
export const READING_FONT_SCALE_MIN = 0.85;
export const READING_FONT_SCALE_MAX = 1.6;
export const READING_FONT_SCALE_STEP = 0.05;

const STORAGE_KEY = "veolms-reading-font-scale";
const listeners = new Set<() => void>();

const clampScale = (value: number) =>
  Number.isFinite(value)
    ? Math.min(READING_FONT_SCALE_MAX, Math.max(READING_FONT_SCALE_MIN, value))
    : 1;

let current: number | null = null;

function readScale(): number {
  if (current !== null) return current;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    current = stored === null ? 1 : clampScale(Number(stored));
  } catch {
    current = 1;
  }
  return current;
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export function useReadingFontScale() {
  const scale = useSyncExternalStore(subscribe, readScale, () => 1);
  const setScale = useCallback((value: number) => {
    current = Math.round(clampScale(value) * 100) / 100;
    try {
      window.localStorage.setItem(STORAGE_KEY, String(current));
    } catch {
      // Private windows and blocked storage: kept for this page only.
    }
    listeners.forEach((listener) => listener());
  }, []);
  return [scale, setScale] as const;
}
