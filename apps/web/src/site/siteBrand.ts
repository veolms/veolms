import type { PlatformBrandingSettings } from "@veolms/contracts/platform-settings-defaults";
import { useSyncExternalStore } from "react";

/**
 * The academy's own artwork for its website (Platform > General): a logo
 * for light pages, one for dark pages, a square icon.
 *
 * Loading screens and the browser tab show it before the API has answered,
 * so the artwork this browser last heard of is kept here and used at once;
 * `SiteBrandSync` brings it up to date when the public settings arrive.
 * Pages prerendered at build time show the build's own artwork until then.
 */

/**
 * Whether this build has artwork of its own (the ProCodrr logo and icon)
 * for an academy that has uploaded none. A build serving many academies
 * sets VITE_BUILT_IN_LOGO=false, and shows each academy's name instead.
 */
export const BUILD_HAS_OWN_ARTWORK =
  (import.meta.env.VITE_BUILT_IN_LOGO as string | undefined)?.trim() !==
  "false";

export type SiteBrandAssets = PlatformBrandingSettings;

const STORAGE_KEY = "veolms-platform-branding";

const NO_ASSETS: SiteBrandAssets = Object.freeze({
  logoLightUrl: null,
  logoDarkUrl: null,
  iconUrl: null,
});

/** An address an image may be shown from; anything else is none. */
function imageAddress(value: unknown): string | null {
  if (typeof value !== "string" || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normalize(value: unknown): SiteBrandAssets {
  if (!value || typeof value !== "object") return NO_ASSETS;
  const { logoLightUrl, logoDarkUrl, iconUrl } = value as Record<
    string,
    unknown
  >;
  return {
    logoLightUrl: imageAddress(logoLightUrl),
    logoDarkUrl: imageAddress(logoDarkUrl),
    iconUrl: imageAddress(iconUrl),
  };
}

function readStored(): SiteBrandAssets {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? normalize(JSON.parse(raw)) : NO_ASSETS;
  } catch {
    return NO_ASSETS;
  }
}

function sameAssets(a: SiteBrandAssets, b: SiteBrandAssets): boolean {
  return (
    a.logoLightUrl === b.logoLightUrl &&
    a.logoDarkUrl === b.logoDarkUrl &&
    a.iconUrl === b.iconUrl
  );
}

let current: SiteBrandAssets | null = null;
const listeners = new Set<() => void>();

/** The artwork now: the latest heard from the API, or remembered here. */
export function getSiteBrandAssets(): SiteBrandAssets {
  if (current === null) {
    current = typeof window === "undefined" ? NO_ASSETS : readStored();
  }
  return current;
}

/** Sets the artwork the API answered, and remembers it for the next visit. */
export function setSiteBrandAssets(value: unknown): void {
  const next = normalize(value);
  if (sameAssets(next, getSiteBrandAssets())) return;
  current = next;
  try {
    if (sameAssets(next, NO_ASSETS)) {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
  } catch {
    // Storage may be full or blocked; the artwork still shows this visit.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The academy's artwork, re-rendering when it changes. A page being
 * hydrated first renders it as prerendered (none), then as remembered.
 */
export function useSiteBrandAssets(): SiteBrandAssets {
  return useSyncExternalStore(subscribe, getSiteBrandAssets, () => NO_ASSETS);
}
