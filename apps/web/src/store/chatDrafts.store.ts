import { useSyncExternalStore } from "react";

/**
 * Unsent messages, per chat, kept on this device (WhatsApp and Telegram
 * keep a draft until it is sent): they survive switching chats and
 * reloading, and the chat list shows "Draft: …". Forgotten at sign-out
 * (store/accountBrowserState.ts).
 */
const STORAGE_KEY = "veolms.chat.drafts";
const MAX_DRAFTS = 50;
const MAX_LENGTH = 4_000;
const WRITE_DELAY_MS = 400;

let drafts: Map<string, string> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function load(): Map<string, string> {
  if (drafts) return drafts;
  drafts = new Map();
  if (typeof window === "undefined") return drafts;
  try {
    const saved = JSON.parse(
      window.localStorage.getItem(STORAGE_KEY) ?? "{}",
    ) as Record<string, unknown>;
    for (const [roomId, text] of Object.entries(saved)) {
      if (typeof text === "string" && text) drafts.set(roomId, text);
    }
  } catch {
    // Unreadable or blocked storage: drafts last for this visit.
  }
  return drafts;
}

function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(Object.fromEntries(load())),
      );
    } catch {
      // Private windows: kept for this visit only.
    }
  }, WRITE_DELAY_MS);
}

function changed() {
  save();
  for (const listener of listeners) listener();
}

export const chatDrafts = {
  get(roomId: string): string | undefined {
    return load().get(roomId);
  },
  set(roomId: string, text: string) {
    const all = load();
    if (!text.trim()) {
      if (!all.has(roomId)) return;
      all.delete(roomId);
    } else {
      // Newest last; the oldest drafts go first past the limit.
      all.delete(roomId);
      all.set(roomId, text.slice(0, MAX_LENGTH));
      while (all.size > MAX_DRAFTS) {
        const oldest = all.keys().next().value;
        if (oldest === undefined) break;
        all.delete(oldest);
      }
    }
    changed();
  },
  delete(roomId: string) {
    if (load().delete(roomId)) changed();
  },
};

export function forgetChatDrafts() {
  clearTimeout(timer);
  drafts = new Map();
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing kept to forget.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A chat's draft, kept current as it is typed (chat list). */
export function useChatDraft(roomId: string): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => chatDrafts.get(roomId),
    () => undefined,
  );
}
