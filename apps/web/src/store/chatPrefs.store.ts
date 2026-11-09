import { useSyncExternalStore } from "react";

/**
 * Chat preferences kept on this device (WhatsApp keeps these per device
 * too): wallpaper colour and pattern, message text size, sounds, desktop
 * alerts and message previews. Privacy and "Enter is send" live on the
 * server (they follow you); these follow the device.
 */
export const CHAT_WALLPAPER_IDS = [
  "default",
  "ocean",
  "teal",
  "mint",
  "forest",
  "sand",
  "peach",
  "sunset",
  "rose",
  "plum",
  "violet",
  "lavender",
  "navy",
  "midnight",
  "coffee",
  "slate",
  "aurora",
  "dusk",
  "lagoon",
  "ember",
] as const;
export type ChatWallpaper = (typeof CHAT_WALLPAPER_IDS)[number];
export const CHAT_PATTERN_IDS = [
  "doodles",
  "code",
  "science",
  "space",
  "geometric",
  "waves",
  "grid",
  "dots",
  "none",
] as const;
export type ChatPattern = (typeof CHAT_PATTERN_IDS)[number];
export type ChatTextSize = "small" | "medium" | "large";

export interface ChatPrefs {
  wallpaper: ChatWallpaper;
  pattern: ChatPattern;
  textSize: ChatTextSize;
  /** A soft sound for a new message in another chat or a hidden tab. */
  sounds: boolean;
  /** The browser's notifications while the tab is in the background. */
  desktopAlerts: boolean;
  /** Show the message text in those notifications. */
  previews: boolean;
}

const STORAGE_KEY = "veolms.chat.prefs";
const DEFAULTS: ChatPrefs = {
  wallpaper: "default",
  pattern: "doodles",
  textSize: "medium",
  sounds: true,
  desktopAlerts: false,
  previews: true,
};

let current: ChatPrefs | null = null;
const listeners = new Set<() => void>();

function read(): ChatPrefs {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<ChatPrefs>;
    const prefs = { ...DEFAULTS, ...saved };
    // A choice this version doesn't have (an older or newer app) falls back.
    if (!CHAT_WALLPAPER_IDS.includes(prefs.wallpaper)) {
      prefs.wallpaper = DEFAULTS.wallpaper;
    }
    if (!CHAT_PATTERN_IDS.includes(prefs.pattern)) {
      prefs.pattern = DEFAULTS.pattern;
    }
    return prefs;
  } catch {
    return DEFAULTS;
  }
}

export function getChatPrefs(): ChatPrefs {
  if (typeof window === "undefined") return DEFAULTS;
  if (current === null) current = read();
  return current;
}

export function setChatPrefs(patch: Partial<ChatPrefs>) {
  current = { ...getChatPrefs(), ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    // Private windows: kept for this visit only.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatPrefs(): ChatPrefs {
  return useSyncExternalStore(subscribe, getChatPrefs, () => DEFAULTS);
}
