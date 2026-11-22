import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { useState } from "react";

import { useCurrentUser } from "../services/auth";
import { useChatNotifications } from "../services/webPush";
import { SettingRow, SettingsToggle } from "./SettingsControls";

/**
 * Settings › Notifications › Delivery: chat messages on this device (the
 * same switch as Chats › Settings › Notifications). The browser asks when
 * it is turned on; the note says why it cannot be, when it cannot.
 */
export function ChatChannelRow() {
  const me = useCurrentUser();
  const chat = useChatNotifications(me.data?.id);
  const [message, setMessage] = useState<string | null>(null);
  if (chat.support === "in-app") return null;

  return (
    <SettingRow
      icon={ChatsCircle}
      label="Chat messages on this device"
      note={message ?? chat.status}
    >
      <SettingsToggle
        checked={chat.on}
        onChange={(next) => {
          void chat.setOn(next).then(setMessage);
        }}
        label="Chat messages on this device"
        disabled={chat.blocked || chat.busy}
      />
    </SettingRow>
  );
}
