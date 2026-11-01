import { useEffect } from "react";
import { useLocation } from "react-router";
import { trackPageView } from "./analytics-track";

/**
 * Reports each page the visitor opens (see `analytics-track.ts`). Lives
 * once in the root so every route is covered; a change of query string
 * alone (a tab, a filter) counts as the same page.
 */
export function AnalyticsPageViews() {
  const { pathname } = useLocation();
  useEffect(() => {
    trackPageView();
  }, [pathname]);
  return null;
}
