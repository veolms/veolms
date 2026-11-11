import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import { useCurrentUser } from "../services/auth";
import {
  loadWebPush,
  readSavedWebPush,
  subscribeSavedWebPush,
} from "../services/webPush";
import { setChatPrefs, useChatPrefs } from "../store/chatPrefs.store";
import { ChatToggle, SettingsRow } from "./ChatControls";

type Permission = NotificationPermission | "unsupported";
type Support = "supported" | "install-first" | "in-app" | "unsupported";

function readPermission(): Permission {
  return typeof Notification === "undefined"
    ? "unsupported"
    : Notification.permission;
}

/** The browser's answer, read again when the visitor comes back to the tab. */
function usePermission(): Permission {
  const [permission, setPermission] = useState<Permission>(readPermission);
  useEffect(() => {
    const refresh = () => setPermission(readPermission());
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  return permission;
}

function useSupport(): Support {
  const [support, setSupport] = useState<Support>("supported");
  useEffect(() => {
    void loadWebPush().then((webPush) => setSupport(webPush.webPushSupport()));
  }, []);
  return support;
}

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 px-4 pt-4 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
      {children}
    </h3>
  );
}

const BLOCKED_HELP =
  "Notifications are blocked for this site. To allow them, click the icon left of the address bar, open Site settings, set Notifications to Allow, then come back here.";

const timeInput =
  "h-9 w-24 rounded-full border-0 bg-(--chat-input) px-3 text-[0.85rem] font-medium text-(--text) [color-scheme:inherit]";

/**
 * Settings › Notifications (WhatsApp Web's, with Telegram's quiet hours and
 * a test button). Everything here is for this device; muting a chat is in
 * the chat's menu and follows you.
 */
export function ChatNotificationSettings({
  onToast,
}: {
  onToast: (message: string) => void;
}) {
  const prefs = useChatPrefs();
  const me = useCurrentUser();
  const permission = usePermission();
  const support = useSupport();
  const pushSaved = useSyncExternalStore(
    subscribeSavedWebPush,
    () => readSavedWebPush() !== null,
    () => false,
  );
  const [busy, setBusy] = useState(false);
  const on = prefs.desktopAlerts && permission === "granted";
  const pushing = on && pushSaved;

  const status =
    support === "in-app"
      ? "The ProCodrr app sends your notifications."
      : support === "install-first"
        ? "On iPhone and iPad, add ProCodrr to your Home Screen first (Share, then Add to Home Screen), and turn notifications on there."
        : permission === "unsupported"
          ? "This browser can’t show notifications."
          : permission === "denied"
            ? BLOCKED_HELP
            : pushing
              ? "On. New messages show up even when ProCodrr isn’t open."
              : on
                ? "On while a ProCodrr tab is open."
                : "Private messages, group messages and @mentions, as they arrive.";

  async function toggle(next: boolean) {
    const webPush = await loadWebPush();
    setBusy(true);
    try {
      if (!next) {
        await webPush.disableWebPush();
        return;
      }
      const userId = me.data?.id;
      if (!userId) return;
      const result = await webPush.enableWebPush(userId);
      if (result.ok) onToast("Notifications are on");
      else if (result.reason === "denied") onToast(BLOCKED_HELP);
      else if (result.reason === "off" || result.reason === "failed") {
        onToast("Notifications will show while a ProCodrr tab is open.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    const webPush = await loadWebPush();
    setBusy(true);
    try {
      const problem = await webPush.sendTestNotification();
      onToast(problem ?? "Sent. It should appear in a few seconds.");
    } finally {
      setBusy(false);
    }
  }

  const blocked =
    permission === "denied" ||
    permission === "unsupported" ||
    support === "in-app" ||
    support === "install-first";

  return (
    <>
      <SettingsRow title="Message notifications" note={status}>
        <ChatToggle
          checked={on}
          disabled={blocked || busy}
          label="Message notifications"
          onChange={(next) => void toggle(next)}
        />
      </SettingsRow>
      <SettingsRow
        title="Show previews"
        note="The sender and message text in notifications. Off: just “New message”."
      >
        <ChatToggle
          checked={prefs.previews}
          label="Show previews"
          onChange={(next) => setChatPrefs({ previews: next })}
        />
      </SettingsRow>
      {pushing ? (
        <SettingsRow
          title="Send a test notification"
          note="Checks that this browser receives them."
          onClick={busy ? undefined : () => void test()}
        />
      ) : null}

      <Heading>Sounds</Heading>
      <SettingsRow
        title="New message sound"
        note="A soft sound for a message in another chat, or while this tab is in the background."
      >
        <ChatToggle
          checked={prefs.messageSound}
          label="New message sound"
          onChange={(next) => setChatPrefs({ messageSound: next })}
        />
      </SettingsRow>
      <SettingsRow
        title="Sent message sound"
        note="A short pop when your message is sent."
      >
        <ChatToggle
          checked={prefs.sentSound}
          label="Sent message sound"
          onChange={(next) => setChatPrefs({ sentSound: next })}
        />
      </SettingsRow>

      <Heading>Quiet hours</Heading>
      <SettingsRow
        title="Quiet hours"
        note="Notifications still arrive, without sound."
      >
        <ChatToggle
          checked={prefs.quietHours !== null}
          label="Quiet hours"
          onChange={(next) =>
            setChatPrefs({
              quietHours: next ? { from: "22:00", to: "07:00" } : null,
            })
          }
        />
      </SettingsRow>
      {prefs.quietHours ? (
        <div className="flex items-center gap-3 px-4 py-2 text-[0.88rem] text-(--text-secondary)">
          <label className="flex items-center gap-2">
            From
            <input
              type="time"
              className={timeInput}
              value={prefs.quietHours.from}
              onChange={(event) =>
                event.target.value &&
                setChatPrefs({
                  quietHours: {
                    ...prefs.quietHours!,
                    from: event.target.value,
                  },
                })
              }
            />
          </label>
          <label className="flex items-center gap-2">
            to
            <input
              type="time"
              className={timeInput}
              value={prefs.quietHours.to}
              onChange={(event) =>
                event.target.value &&
                setChatPrefs({
                  quietHours: { ...prefs.quietHours!, to: event.target.value },
                })
              }
            />
          </label>
        </div>
      ) : null}

      <p className="m-0 px-4 pt-3 text-[0.8rem] leading-snug text-(--muted)">
        Mute a chat for 8 hours, a week or always from its menu; it stays muted
        on all your devices. In a group’s info you can choose to be notified
        only when someone @mentions you.
      </p>
    </>
  );
}
