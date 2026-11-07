import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { useState } from "react";

import { cn } from "../lib/utils";
import { useCurrentUser } from "../services/auth";
import { useChatProfile, useUpdateChatProfile } from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { ChatToggle, ListPanelHeader, SettingsRow } from "./ChatControls";
import { useChatWallpaper } from "./useChatWallpaper";

type Page = "root" | "privacy" | "chats";

/**
 * WhatsApp's Settings, in the chat list's place: your profile, then
 * Privacy (last seen and online, read receipts), Chats (Enter is send,
 * wallpaper doodles), Keyboard shortcuts and Blocked people.
 */
export function ChatSettingsPanel({
  onBack,
  onShowShortcuts,
  onToast,
}: {
  onBack: () => void;
  onShowShortcuts: () => void;
  onToast: (message: string) => void;
}) {
  const [page, setPage] = useState<Page>("root");
  const me = useCurrentUser();
  const profile = useChatProfile();
  const update = useUpdateChatProfile();
  const [doodles, setDoodles] = useChatWallpaper();
  const values = profile.data ?? {
    showPresence: true,
    readReceipts: true,
    enterToSend: true,
  };
  const save = (patch: Partial<typeof values>) =>
    update.mutate(patch, {
      onError: () => onToast("Couldn’t save that. Try again."),
    });

  if (page === "privacy") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ListPanelHeader title="Privacy" onBack={() => setPage("root")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <h3 className="m-0 px-4 pt-3 pb-1 text-[0.8rem] font-semibold text-(--muted)">
            Last seen and online
          </h3>
          <div
            role="radiogroup"
            aria-label="Who can see my last seen and online"
          >
            {[
              { value: true, label: "Everyone I chat with" },
              { value: false, label: "Nobody" },
            ].map((option) => (
              <button
                key={option.label}
                type="button"
                role="radio"
                aria-checked={values.showPresence === option.value}
                onClick={() => save({ showPresence: option.value })}
                className="flex w-full cursor-pointer items-center gap-4 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-[0.95rem] text-(--text) hover:bg-(--chat-hover)"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-solid",
                    values.showPresence === option.value
                      ? "border-(--accent)"
                      : "border-(--chat-line-strong)",
                  )}
                >
                  {values.showPresence === option.value ? (
                    <span className="size-2.5 rounded-full bg-(--accent)" />
                  ) : null}
                </span>
                {option.label}
              </button>
            ))}
          </div>
          <p className="m-0 px-4 pt-1 pb-4 text-[0.8rem] leading-snug text-(--muted)">
            If you don’t share your last seen and online, you won’t see other
            people’s either.
          </p>

          <div className="my-1 h-px bg-(--chat-line)" />
          <SettingsRow
            title="Read receipts"
            note="If turned off, you won’t send or receive blue ticks in private chats. Groups always show them."
          >
            <ChatToggle
              checked={values.readReceipts}
              label="Read receipts"
              onChange={(on) => save({ readReceipts: on })}
            />
          </SettingsRow>
        </div>
      </div>
    );
  }

  if (page === "chats") {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <ListPanelHeader title="Chats" onBack={() => setPage("root")} />
        <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
          <SettingsRow
            title="Enter is send"
            note="Enter sends your message. Shift + Enter always starts a new line."
          >
            <ChatToggle
              checked={values.enterToSend}
              label="Enter is send"
              onChange={(on) => save({ enterToSend: on })}
            />
          </SettingsRow>
          <SettingsRow
            title="Wallpaper doodles"
            note="The quiet pattern behind your messages, on this device."
          >
            <ChatToggle
              checked={doodles}
              label="Wallpaper doodles"
              onChange={setDoodles}
            />
          </SettingsRow>
          <p className="m-0 px-4 pt-2 text-[0.8rem] leading-snug text-(--muted)">
            Chats follow the app’s theme and colours, set in your profile’s
            appearance settings.
          </p>
        </div>
      </div>
    );
  }

  const user = me.data;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListPanelHeader title="Settings" onBack={onBack} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">
        {user ? (
          <div className="mb-2 flex items-center gap-4 rounded-xl px-4 py-4">
            <ChatAvatar
              name={user.displayName}
              url={user.avatarSrcSet.at(-1)?.url ?? null}
              className="size-16 text-[1.2rem]"
            />
            <span className="min-w-0">
              <span className="block truncate text-[1.05rem] font-medium text-(--text)">
                {user.displayName}
              </span>
              <span className="block truncate text-[0.84rem] text-(--muted)">
                {user.email ?? `@${user.username}`}
              </span>
            </span>
          </div>
        ) : null}
        <div className="mb-1 h-px bg-(--chat-line)" />
        <SettingsRow
          title="Privacy"
          note="Last seen and online, read receipts"
          icon={<LockSimple size={21} />}
          onClick={() => setPage("privacy")}
        >
          <CaretRight size={16} className="text-(--muted)" aria-hidden="true" />
        </SettingsRow>
        <SettingsRow
          title="Chats"
          note="Enter is send, wallpaper"
          icon={<ChatsCircle size={21} />}
          onClick={() => setPage("chats")}
        >
          <CaretRight size={16} className="text-(--muted)" aria-hidden="true" />
        </SettingsRow>
        <SettingsRow
          title="Keyboard shortcuts"
          note="Find chats and act on them without the mouse"
          icon={<Keyboard size={21} />}
          onClick={onShowShortcuts}
        >
          <CaretRight size={16} className="text-(--muted)" aria-hidden="true" />
        </SettingsRow>
        <SettingsRow
          title="Blocked people"
          note="Block someone from their chat’s menu; unblock them there too."
          icon={<Prohibit size={21} />}
        />
        <p className="m-0 flex items-start gap-2 px-4 pt-4 text-[0.78rem] leading-snug text-(--muted)">
          <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Changes save as you make them and apply on all your devices.
        </p>
      </div>
    </div>
  );
}
