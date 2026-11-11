/**
 * What this browser last saved as its push subscription, kept small so the
 * chat stream can ask "does the service worker show notifications here?"
 * without loading the rest of web push (webPush.ts).
 */

const SAVED_KEY = "veolms.webpush";

export interface SavedWebPush {
  endpoint: string;
  /** The account it was saved for: another sign-in saves it again. */
  userId: string;
  savedAt: number;
}

const listeners = new Set<() => void>();

export function readSavedWebPush(): SavedWebPush | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(SAVED_KEY) ?? "null",
    ) as SavedWebPush | null;
    return saved && typeof saved.endpoint === "string" ? saved : null;
  } catch {
    return null;
  }
}

export function writeSavedWebPush(saved: SavedWebPush | null) {
  try {
    if (saved) window.localStorage.setItem(SAVED_KEY, JSON.stringify(saved));
    else window.localStorage.removeItem(SAVED_KEY);
  } catch {
    // Private windows: nothing is remembered; the next visit saves again.
  }
  for (const listener of listeners) listener();
}

export function subscribeSavedWebPush(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * The service worker shows this browser's chat notifications (subscribed
 * and allowed): the tab's own desktop alerts step aside, so nothing shows
 * twice, and the chat stream need not stay open in a hidden tab.
 */
export function isWebPushActive(): boolean {
  return (
    readSavedWebPush() !== null &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}
