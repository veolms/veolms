import { useCallback, useSyncExternalStore } from "react";

/**
 * How large the Discussions panel draws a discussion's text, as a multiple
 * of its usual size: the "Aa" slider beside the post's author. The same
 * range as a reading lesson's text size; kept in this browser.
 */
export const DISCUSSION_TEXT_SCALE_MIN = 0.85;
export const DISCUSSION_TEXT_SCALE_MAX = 1.6;
export const DISCUSSION_TEXT_SCALE_STEP = 0.05;

const STORAGE_KEY = "veolms-discussion-text-scale";
const listeners = new Set<() => void>();

const clampScale = (value: number) =>
  Number.isFinite(value)
    ? Math.min(
        DISCUSSION_TEXT_SCALE_MAX,
        Math.max(DISCUSSION_TEXT_SCALE_MIN, value),
      )
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

export function useDiscussionTextScale() {
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
