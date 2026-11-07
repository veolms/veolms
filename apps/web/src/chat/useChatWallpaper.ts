import { useSyncExternalStore } from "react";

const STORAGE_KEY = "veolms.chat.doodles";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

let current: boolean | null = null;

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  if (current === null) current = read();
  return current;
}

/** WhatsApp's "Wallpaper doodles": the pattern behind messages, on by default. */
export function useChatWallpaper(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(subscribe, snapshot, () => true);
  return [
    on,
    (next) => {
      current = next;
      try {
        window.localStorage.setItem(STORAGE_KEY, next ? "on" : "off");
      } catch {
        // Private windows: kept for this visit only.
      }
      for (const listener of listeners) listener();
    },
  ];
}
