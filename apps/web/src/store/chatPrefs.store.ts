import { useSyncExternalStore } from "react";

/**
 * Chat preferences kept on this device (WhatsApp keeps these per device
 * too): wallpaper colour and pattern, message text size, sounds,
 * notifications, message previews and quiet hours. Privacy, "Enter is
 * send" and each chat's mute live on the server (they follow you); these
 * follow the device.
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
  messageSound: boolean;
  /** A short pop when your message is sent (one tick). */
  sentSound: boolean;
  /**
   * Notifications on this device: pushed (shown with the tab closed) where
   * the browser can, else while a tab is open in the background.
   */
  desktopAlerts: boolean;
  /** Show the message text in those notifications. */
  previews: boolean;
  /** Notifications arrive without sound between these times (device time). */
  quietHours: { from: string; to: string } | null;
  /**
   * Enter is send on a phone (WhatsApp: off, Enter starts a new line and
   * the send button sends). Computers use the account's setting.
   */
  phoneEnterToSend: boolean;
}

const STORAGE_KEY = "veolms.chat.prefs";
const DEFAULTS: ChatPrefs = {
  wallpaper: "default",
  pattern: "doodles",
  textSize: "medium",
  messageSound: true,
  sentSound: true,
  desktopAlerts: false,
  previews: true,
  quietHours: null,
  phoneEnterToSend: false,
};

/** A phone or tablet: touch only, no mouse (Enter starts a new line there). */
export function isTouchOnlyDevice(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(hover: none) and (pointer: coarse)").matches === true
  );
}

let current: ChatPrefs | null = null;
const listeners = new Set<() => void>();

function read(): ChatPrefs {
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Partial<ChatPrefs> & { sounds?: boolean };
    // Before the two sound switches there was one ("sounds").
    if (saved.sounds === false && saved.messageSound === undefined) {
      saved.messageSound = false;
      saved.sentSound = false;
    }
    delete saved.sounds;
    const prefs = { ...DEFAULTS, ...saved };
    const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/u;
    if (
      prefs.quietHours &&
      !(hhmm.test(prefs.quietHours.from) && hhmm.test(prefs.quietHours.to))
    ) {
      prefs.quietHours = null;
    }
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

/** Within quiet hours now ("22:00"–"07:00" runs overnight). */
export function inQuietHours(
  quietHours: ChatPrefs["quietHours"],
  now = new Date(),
): boolean {
  if (!quietHours) return false;
  const minutes = (value: string) => {
    const [h = 0, m = 0] = value.split(":").map(Number);
    return h * 60 + m;
  };
  const from = minutes(quietHours.from);
  const to = minutes(quietHours.to);
  const at = now.getHours() * 60 + now.getMinutes();
  if (from === to) return false;
  return from < to ? at >= from && at < to : at >= from || at < to;
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

export function subscribeChatPrefs(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChatPrefs(): ChatPrefs {
  return useSyncExternalStore(subscribeChatPrefs, getChatPrefs, () => DEFAULTS);
}
