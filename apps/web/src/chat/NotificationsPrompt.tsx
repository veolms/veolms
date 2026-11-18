import { BellRingingIcon as BellRinging } from "@phosphor-icons/react/BellRinging";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useState } from "react";

import { useCurrentUser } from "../services/auth";
import { loadWebPush } from "../services/webPush";
import { useChatPrefs } from "../store/chatPrefs.store";

const DISMISSED_KEY = "veolms.chat.notifyPromptDismissed";

/** Whether this browser can show desktop notifications for the site. */
function canAsk(): boolean {
  if (typeof window === "undefined" || typeof Notification === "undefined") {
    return false;
  }
  // The Android app has its own notifications (FCM); not inside it.
  const installedOnAndroid =
    /Android/i.test(navigator.userAgent) &&
    window.matchMedia?.("(display-mode: standalone)").matches;
  return !installedOnAndroid;
}

function dismissedBefore(): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * WhatsApp Web's banner over the chat list: "Get notified of new messages",
 * with a button that asks the browser. Shown until notifications are on,
 * refused or the banner is closed; Settings › Notifications has the switch.
 */
export function NotificationsPrompt({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const prefs = useChatPrefs();
  const me = useCurrentUser();
  const [hidden, setHidden] = useState(() => !canAsk() || dismissedBefore());
  const [permission, setPermission] = useState(() =>
    typeof Notification === "undefined" ? "denied" : Notification.permission,
  );
  if (hidden || permission === "denied") return null;
  if (permission === "granted" && prefs.desktopAlerts) return null;

  function dismiss() {
    setHidden(true);
    try {
      window.localStorage.setItem(DISMISSED_KEY, "1");
    } catch {
      // Private window: hidden for this visit.
    }
  }

  async function turnOn() {
    const userId = me.data?.id;
    if (!userId) return;
    // Loaded with the chat page already: the click still counts as asking.
    const webPush = await loadWebPush();
    const result = await webPush.enableWebPush(userId);
    setPermission(Notification.permission);
    if (result.ok) {
      onToast("Notifications are on, even with ProCodrr closed");
    } else if (result.reason === "denied") {
      onToast(
        "Notifications are blocked for this site. Allow them in the browser’s site settings.",
      );
    } else if (result.reason === "off" || result.reason === "failed") {
      onToast("Notifications will show while a ProCodrr tab is open.");
    }
  }

  return (
    <div className="mx-3 mb-2 flex shrink-0 items-center gap-3 rounded-xl bg-[color-mix(in_srgb,var(--accent)_12%,var(--chat-panel))] px-3 py-2.5">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-(--accent) text-(--on-accent)">
        <BellRinging size={20} weight="fill" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[0.88rem] font-medium text-(--text)">
          Get notified of new messages
        </span>
        <button
          type="button"
          onClick={() => void turnOn()}
          className="cursor-pointer border-0 bg-transparent p-0 text-left text-[0.8rem] font-semibold text-(--accent-ink) hover:underline"
        >
          Turn on notifications ›
        </button>
      </span>
      <button
        type="button"
        aria-label="Not now"
        onClick={dismiss}
        className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--chat-hover) hover:text-(--text)"
      >
        <X size={16} />
      </button>
    </div>
  );
}
