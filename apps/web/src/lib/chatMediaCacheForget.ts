/**
 * Where chat photos and videos are kept on this device (lib/chatMediaCache.ts),
 * and the sign-out step that deletes them. Kept apart from the cache itself:
 * signing out happens on every page, the cache only matters in Chats and
 * Settings.
 */

export const CHAT_MEDIA_CACHE_NAME = "veolms-chat-media-v1";
export const CHAT_MEDIA_DB_NAME = "veolms-chat-media";
/** Tells every open tab (this one included) the cache was emptied. */
export const CHAT_MEDIA_CHANNEL = "veolms-chat-media";

export function announceChatMediaCleared(): void {
  if (typeof BroadcastChannel === "undefined") return;
  try {
    const channel = new BroadcastChannel(CHAT_MEDIA_CHANNEL);
    channel.postMessage("cleared");
    channel.close();
  } catch {
    // No other tab to tell.
  }
}

/** Sign-out: the account's chat photos and videos go. */
export function forgetChatMediaCache(): void {
  if (typeof window === "undefined" || !window.isSecureContext) return;
  try {
    void window.caches?.delete(CHAT_MEDIA_CACHE_NAME).catch(() => false);
    if (typeof indexedDB !== "undefined") {
      indexedDB.deleteDatabase(CHAT_MEDIA_DB_NAME);
    }
  } catch {
    // Unavailable storage holds nothing to forget.
  }
  announceChatMediaCleared();
}
