import { useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router";

/** React Router keeps each entry's position in this session in `idx`. */
function getHistoryIndex(): number | null {
  if (typeof window === "undefined") return null;
  const index = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof index === "number" ? index : null;
}

/**
 * Returns a function that leaves the course editor for the page the user
 * opened it from. Tab switches and lesson focus inside the editor each add a
 * history entry, so a single step back would only return to the previous
 * tab; this steps back past every entry the editor added. When the editor
 * was the first page of the visit (opened from a link or a reload), there is
 * no earlier page in the app, and `fallback` runs instead.
 */
export function usePageBeforeEditor(fallback: () => void) {
  const navigate = useNavigate();
  const entryIndexRef = useRef<number | null>(null);

  useEffect(() => {
    entryIndexRef.current = getHistoryIndex();
  }, []);

  return useCallback(() => {
    const entryIndex = entryIndexRef.current;
    const currentIndex = getHistoryIndex();
    if (
      entryIndex !== null &&
      currentIndex !== null &&
      entryIndex > 0 &&
      currentIndex >= entryIndex
    ) {
      void navigate(-(currentIndex - entryIndex + 1));
      return;
    }
    fallback();
  }, [fallback, navigate]);
}
