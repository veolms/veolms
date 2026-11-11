import { type ReactNode } from "react";

import { useCurrentUser } from "../services/auth";
import { useChatNotifications } from "../services/webPush";
import { setChatPrefs, useChatPrefs } from "../store/chatPrefs.store";
import { ChatToggle, SettingsRow } from "./ChatControls";

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 px-4 pt-4 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
      {children}
    </h3>
  );
}

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
  const chat = useChatNotifications(me.data?.id);
  const { on, pushing, blocked, busy, status } = chat;

  async function toggle(next: boolean) {
    const message = await chat.setOn(next);
    if (message) onToast(message);
  }

  async function test() {
    onToast(await chat.sendTest());
  }

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
