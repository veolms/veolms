import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { useState } from "react";

import { ElevatedCard } from "../components/ElevatedCard";
import { useCurrentUser } from "../services/auth";
import { useChatNotifications } from "../services/webPush";

/**
 * The notifications page's offer to turn on chat notifications for this
 * device, so they need not be found in Chats › Settings. Gone once they are
 * on, and in the Android app (it has its own).
 */
export function ChatNotificationsCard({
  onNotice,
}: {
  onNotice?: (message: string) => void;
}) {
  const me = useCurrentUser();
  const chat = useChatNotifications(me.data?.id);
  const [message, setMessage] = useState<string | null>(null);
  if (chat.on || chat.support === "in-app") return null;

  async function allow() {
    const result = await chat.setOn(true);
    if (result) {
      setMessage(result);
      onNotice?.(result);
    }
  }

  return (
    <ElevatedCard
      aria-labelledby="chat-notifications-heading"
      className="p-5 md:p-6"
    >
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--accent) text-(--on-accent,#ffffff)">
          <ChatsCircle size={19} weight="fill" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h3
            id="chat-notifications-heading"
            className="m-0 text-base font-bold tracking-tight text-(--text)"
          >
            Chat notifications
          </h3>
          <p className="mt-1 text-xs leading-snug text-(--text-secondary)">
            {chat.blocked
              ? chat.status
              : "Get new messages and @mentions on this device, even when ProCodrr isn’t open."}
          </p>
          {message && !chat.blocked ? (
            <p className="mt-2 text-xs text-(--muted)" role="status">
              {message}
            </p>
          ) : null}
        </div>
      </div>
      {chat.blocked ? null : (
        <button
          type="button"
          onClick={() => void allow()}
          disabled={chat.busy}
          className="mt-4 inline-flex cursor-pointer items-center gap-1.5 rounded-xl bg-(--accent) px-4 py-2 text-xs font-semibold text-(--on-accent,#ffffff) shadow-sm transition-all hover:opacity-90 active:scale-[0.98] disabled:cursor-default disabled:opacity-60 sm:text-sm"
        >
          Allow notifications
        </button>
      )}
    </ElevatedCard>
  );
}
