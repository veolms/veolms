import { useSyncExternalStore } from "react";

/**
 * Chat preferences kept on this device (WhatsApp keeps these per device
 * too): wallpaper colour and pattern, message text size, sounds, desktop
 * alerts and message previews. Privacy and "Enter is send" live on the
 * server (they follow you); these follow the device.
 */
export type ChatWallpaper =
  | "default"
  | "ocean"
  | "forest"
  | "sunset"
  | "rose"
  | "violet"
  | "sand"
  | "slate";
export type ChatPattern = "doodles" | "dots" | "none";
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
    return { ...DEFAULTS, ...saved };
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
