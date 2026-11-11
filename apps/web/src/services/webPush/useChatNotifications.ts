import { useEffect, useState, useSyncExternalStore } from "react";

import { useChatPrefs } from "../../store/chatPrefs.store";
import { readSavedWebPush, subscribeSavedWebPush } from "./webPush.state";

/**
 * Chat notifications on this device, for every place that offers the
 * switch (Chats › Settings › Notifications, the notifications page, account
 * Settings › Notifications): whether they are on, why they cannot be, and
 * turning them on or off. The browser asks only from a click.
 */

export type ChatNotificationPermission = NotificationPermission | "unsupported";
export type ChatNotificationSupport =
  "supported" | "install-first" | "in-app" | "unsupported";

export const CHAT_NOTIFICATIONS_BLOCKED_HELP =
  "Notifications are blocked for this site. To allow them, click the icon left of the address bar, open Site settings, set Notifications to Allow, then come back here.";

function readPermission(): ChatNotificationPermission {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

function loadWebPush() {
  return import("./webPush");
}

/** `userId`: the signed-in account (subscriptions are saved for it). */
export function useChatNotifications(userId: string | null | undefined) {
  const prefs = useChatPrefs();
  const [permission, setPermission] =
    useState<ChatNotificationPermission>(readPermission);
  const [support, setSupport] = useState<ChatNotificationSupport>("supported");
  const [busy, setBusy] = useState(false);
  const pushSaved = useSyncExternalStore(
    subscribeSavedWebPush,
    () => readSavedWebPush() !== null,
    () => false,
  );

  useEffect(() => {
    // The browser's answer, read again when the visitor comes back.
    const refresh = () => setPermission(readPermission());
    refresh();
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    void loadWebPush().then((webPush) => setSupport(webPush.webPushSupport()));
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const on = prefs.desktopAlerts && permission === "granted";
  const pushing = on && pushSaved;
  const blocked =
    permission === "denied" ||
    permission === "unsupported" ||
    support === "in-app" ||
    support === "install-first";

  const status =
    support === "in-app"
      ? "The ProCodrr app sends your notifications."
      : support === "install-first"
        ? "On iPhone and iPad, add ProCodrr to your Home Screen first (Share, then Add to Home Screen), and turn notifications on there."
        : permission === "unsupported"
          ? "This browser can’t show notifications."
          : permission === "denied"
            ? CHAT_NOTIFICATIONS_BLOCKED_HELP
            : pushing
              ? "On. New messages show up even when ProCodrr isn’t open."
              : on
                ? "On while a ProCodrr tab is open."
                : "Private messages, group messages and @mentions, as they arrive.";

  /** Turns them on or off; returns what to tell the visitor, if anything. */
  async function setOn(next: boolean): Promise<string | null> {
    const webPush = await loadWebPush();
    setBusy(true);
    try {
      if (!next) {
        await webPush.disableWebPush();
        return null;
      }
      if (!userId) return null;
      const result = await webPush.enableWebPush(userId);
      setPermission(readPermission());
      if (result.ok) return "Chat notifications are on";
      if (result.reason === "denied") return CHAT_NOTIFICATIONS_BLOCKED_HELP;
      if (result.reason === "off" || result.reason === "failed") {
        return "Notifications will show while a ProCodrr tab is open.";
      }
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendTest(): Promise<string> {
    const webPush = await loadWebPush();
    setBusy(true);
    try {
      const problem = await webPush.sendTestNotification();
      return problem ?? "Sent. It should appear in a few seconds.";
    } finally {
      setBusy(false);
    }
  }

  return {
    on,
    pushing,
    blocked,
    busy,
    permission,
    support,
    status,
    setOn,
    sendTest,
  };
}
