import {
  getAnalyticsSink,
  type AnalyticsEvent,
  type PlaybackSummary,
} from "@veolms/web-core";

/**
 * Core's side of visitor analytics: the moments it reports, handed to
 * whatever sink a plugin registered (see `registerAnalyticsSink` in
 * web-core). With no sink these are no-ops, so the open-source build
 * records nothing and costs nothing.
 */

const UTM_KEYS = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

function currentPath(): string {
  if (typeof window === "undefined") return "";
  return `${window.location.pathname}${window.location.search}`;
}

function readUtm(): Record<string, string> | undefined {
  if (typeof window === "undefined") return undefined;
  const params = new URLSearchParams(window.location.search);
  const utm: Record<string, string> = {};
  for (const key of UTM_KEYS) {
    const value = params.get(key);
    if (value) utm[key.slice(4)] = value.slice(0, 200);
  }
  return Object.keys(utm).length > 0 ? utm : undefined;
}

let referrerReported = false;

/**
 * Reports a page being opened. The referrer and utm parameters go with
 * the first page of the visit only; later pages are the visitor's own
 * moves within the site.
 */
export function trackPageView(): void {
  const sink = getAnalyticsSink();
  if (!sink) return;
  const event: AnalyticsEvent = {
    name: "page_view",
    at: new Date().toISOString(),
    path: currentPath(),
  };
  if (!referrerReported) {
    referrerReported = true;
    const referrer = document.referrer;
    if (referrer && !referrer.startsWith(window.location.origin)) {
      event.referrer = referrer.slice(0, 500);
    }
    const utm = readUtm();
    if (utm) event.utm = utm;
  }
  sink.track(event);
}

export function trackAnalyticsEvent(
  name: AnalyticsEvent["name"],
  fields: Omit<AnalyticsEvent, "name" | "at" | "path"> = {},
): void {
  const sink = getAnalyticsSink();
  if (!sink) return;
  sink.track({
    name,
    at: new Date().toISOString(),
    path: currentPath(),
    ...fields,
  });
}

export function trackPlayback(summary: PlaybackSummary): void {
  getAnalyticsSink()?.playback(summary);
}
