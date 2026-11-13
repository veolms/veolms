import { useNativeBridge } from "@veolms/react-webview-bridge";
import { useEffect, useRef } from "react";

import type { NotificationLaunchData } from "./native-bridge-contracts";
import { nativeBridge } from "./nativeBridge";

/** The event native sends for a tap while this page handles taps. */
const NOTIFICATION_OPENED_EVENT = "notificationOpened";

let launchData: Promise<NotificationLaunchData | null> | undefined;

/**
 * The notification tap that opened (or reloaded) this page, or `null`.
 * Native answers it once per page load, so every caller shares that one
 * call (StrictMode runs effects twice in development). Calling it also tells
 * native this page handles taps: later taps arrive as the
 * `notificationOpened` event instead of a page reload.
 */
export function getLaunchDataOnce() {
  launchData ??= nativeBridge.notifications
    .getLaunchData()
    .catch((error: unknown) => {
      launchData = undefined; // a failure is not kept: the next caller asks again
      throw error;
    });
  return launchData;
}

/**
 * Calls `onTap` for every notification tap on this page: the one that
 * opened it, then each one while it is open. Subscribes to the event before
 * pulling the launch tap, so a tap in between is not lost (native events
 * are not buffered). Does nothing outside the native app.
 */
export function useNotificationTaps(
  onTap: (tap: NotificationLaunchData) => void,
) {
  const { bridge } = useNativeBridge();
  const latest = useRef(onTap);
  // The launch tap is handled once, though StrictMode subscribes twice.
  const launchHandled = useRef(false);

  useEffect(() => {
    latest.current = onTap;
  });

  useEffect(() => {
    if (!bridge) return;
    const unsubscribe = bridge.onEvent<NotificationLaunchData | null>(
      NOTIFICATION_OPENED_EVENT,
      (tap) => {
        if (tap) latest.current(tap);
      },
    );
    if (!launchHandled.current) {
      launchHandled.current = true;
      getLaunchDataOnce().then(
        (tap) => {
          if (tap) latest.current(tap);
        },
        (error: unknown) =>
          console.warn("[NativeBridge] getLaunchData() failed:", error),
      );
    }
    return unsubscribe;
  }, [bridge]);
}

/**
 * Tells native whether a chat is on screen: while it is, its pushes are not
 * drawn. Fire and forget; native forgets it on every page load.
 */
export function setNativeChatOnScreen(roomId: string, onScreen: boolean) {
  nativeBridge.notifications
    .setChatOnScreen(roomId, onScreen)
    .catch((error: unknown) =>
      console.warn("[NativeBridge] setChatOnScreen() failed:", error),
    );
}

/**
 * Removes a chat's phone notification: all of it, or with `readSeq` only
 * the messages read so far (a late push for an older one is then not
 * drawn). Fire and forget.
 */
export function closeNativeChatNotification(roomId: string, readSeq?: number) {
  nativeBridge.notifications
    .closeChatNotification(roomId, readSeq ?? null)
    .catch((error: unknown) =>
      console.warn("[NativeBridge] closeChatNotification() failed:", error),
    );
}
