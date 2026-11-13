/**
 * Web push for chat. The state helpers are tiny and safe to import
 * anywhere; the rest (webPush.ts) is imported where it is used, or loaded
 * when the app is idle (`loadWebPush`).
 */
import { closeNativeChatNotification } from "../../native-bridge";

export {
  isWebPushActive,
  readSavedWebPush,
  subscribeSavedWebPush,
} from "./webPush.state";

export function loadWebPush() {
  return import("./webPush");
}

/**
 * Closes a chat's notification (opened or read here or on another device):
 * the phone app's, then this browser's. In the app, `readSeq` removes only
 * the messages read so far. The browser needs no service worker code: the
 * page can close what its worker showed.
 */
export async function closeChatNotifications(roomId: string, readSeq?: number) {
  // First: the app's WebView may have no service worker.
  closeNativeChatNotification(roomId, readSeq);
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

export {
  CHAT_NOTIFICATIONS_BLOCKED_HELP,
  useChatNotifications,
} from "./useChatNotifications";
