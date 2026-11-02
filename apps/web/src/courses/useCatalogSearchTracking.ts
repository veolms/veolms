import { useEffect, useRef } from "react";
import { trackAnalyticsEvent } from "../lib/analytics-track";

// Long enough that typing a word is one search, not one per letter.
const SETTLE_MS = 1500;

/**
 * Reports a catalogue search once its results have settled: whether it
 * found anything, never what was typed (a search box gets names, emails
 * and anything else pasted into it).
 */
export function useCatalogSearchTracking(
  search: string,
  isLoading: boolean,
  resultCount: number,
) {
  const lastReportedRef = useRef("");

  useEffect(() => {
    const term = search.trim().toLowerCase();
    if (!term || isLoading || term === lastReportedRef.current) {
      return undefined;
    }
    const handle = window.setTimeout(() => {
      lastReportedRef.current = term;
      trackAnalyticsEvent("catalog_search", {
        props: { has_results: resultCount > 0 },
      });
    }, SETTLE_MS);
    return () => window.clearTimeout(handle);
  }, [search, isLoading, resultCount]);
}
