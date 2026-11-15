import { useSyncExternalStore } from "react";

/**
 * The site's name as pages show it: in titles, on the sign-in screens, in
 * notices, at checkout.
 *
 * Until the academy's own name is known it is the build's `VITE_SITE_NAME`
 * (or ProCodrr, the name the existing builds were made with); once the
 * public brand has been read (see `SiteNameSync`) it is the academy's name,
 * so one build can serve any academy.
 */
export const DEFAULT_SITE_NAME =
  (import.meta.env.VITE_SITE_NAME as string | undefined)?.trim() || "ProCodrr";

let current: string | null = null;
const listeners = new Set<() => void>();

/** The site's name now: the academy's, once known, else the build's. */
export function getSiteName(): string {
  return current ?? DEFAULT_SITE_NAME;
}

/** Sets the academy's name (empty keeps the build's). */
export function setSiteName(name: string): void {
  const next = name.trim() || null;
  if (next === current) return;
  current = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The site's name, re-rendering when the academy's own becomes known. */
export function useSiteName(): string {
  return useSyncExternalStore(subscribe, getSiteName, () => DEFAULT_SITE_NAME);
}

/** `text` with each `{site}` replaced by the site's name. */
export function withSiteName(text: string): string {
  return text.replaceAll("{site}", getSiteName());
}
