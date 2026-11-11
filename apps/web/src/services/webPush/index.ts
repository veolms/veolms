/**
 * Web push for chat. The state helpers are tiny and safe to import
 * anywhere; the rest (webPush.ts) is imported where it is used, or loaded
 * when the app is idle (`loadWebPush`).
 */
export {
  isWebPushActive,
  readSavedWebPush,
  subscribeSavedWebPush,
} from "./webPush.state";

export function loadWebPush() {
  return import("./webPush");
}

/**
 * Closes this browser's notification for a chat (opened or read here or
 * on another device). Needs no service worker code: the page can close
 * what its worker showed.
 */
export async function closeChatNotifications(roomId: string) {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return;
  }
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    if (!reg) return;
    for (const shown of await reg.getNotifications({ tag: `chat:${roomId}` })) {
      shown.close();
    }
  } catch {
    // Nothing to close.
  }
}
