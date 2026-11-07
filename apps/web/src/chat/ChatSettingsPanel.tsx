import { BellIcon as Bell } from "@phosphor-icons/react/Bell";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { useCurrentUser } from "../services/auth";
import { useChatProfile, useUpdateChatProfile } from "../services/chat";
import {
  setChatPrefs,
  useChatPrefs,
  type ChatPattern,
  type ChatTextSize,
  type ChatWallpaper,
} from "../store/chatPrefs.store";
import { ChatAvatar } from "./ChatAvatar";
import {
  ChatSelect,
  ChatToggle,
  ListPanelHeader,
  SettingsRow,
} from "./ChatControls";
import { CHAT_TEXT_SIZES, CHAT_WALLPAPERS } from "./chatWallpapers";

type Page = "root" | "privacy" | "chats" | "wallpaper" | "notifications";

const chevron = (
  <CaretRight size={16} className="text-(--muted)" aria-hidden="true" />
);

function Heading({ children }: { children: ReactNode }) {
  return (
    <h3 className="m-0 px-4 pt-4 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
      {children}
    </h3>
  );
}

function RadioRow({
  checked,
  label,
  note,
  onSelect,
}: {
  checked: boolean;
  label: string;
  note?: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      onClick={onSelect}
      className="flex w-full cursor-pointer items-center gap-4 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-(--text) hover:bg-(--chat-hover)"
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-solid",
          checked ? "border-(--accent)" : "border-(--chat-line-strong)",
        )}
      >
        {checked ? (
          <span className="size-2.5 rounded-full bg-(--accent)" />
        ) : null}
      </span>
      <span>
        <span className="block text-[0.95rem]">{label}</span>
        {note ? (
          <span className="block text-[0.78rem] text-(--muted)">{note}</span>
        ) : null}
      </span>
    </button>
  );
}

/**
 * WhatsApp's Settings, in the chat list's place: your profile, then
 * Privacy, Chats (Enter is send, text size, wallpaper), Notifications
 * (sounds, desktop alerts, previews), Keyboard shortcuts and Blocked.
 * Privacy and Enter is send follow you; the rest stays on this device.
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
  const prefs = useChatPrefs();
  const values = profile.data ?? {
    showPresence: true,
    readReceipts: true,
    enterToSend: true,
  };
  const save = (patch: Partial<typeof values>) =>
    update.mutate(patch, {
      onError: () => onToast("Couldn’t save that. Try again."),
    });
  const panel = (title: string, back: Page, body: ReactNode) => (
    <div className="flex h-full min-h-0 flex-col">
      <ListPanelHeader title={title} onBack={() => setPage(back)} />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-6">{body}</div>
    </div>
  );

  if (page === "privacy") {
    return panel(
      "Privacy",
      "root",
      <>
        <Heading>Last seen and online</Heading>
        <div role="radiogroup" aria-label="Who can see my last seen and online">
          <RadioRow
            checked={values.showPresence}
            label="Everyone I chat with"
            onSelect={() => save({ showPresence: true })}
          />
          <RadioRow
            checked={!values.showPresence}
            label="Nobody"
            onSelect={() => save({ showPresence: false })}
          />
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
      </>,
    );
  }

  if (page === "wallpaper") {
    return panel(
      "Wallpaper",
      "chats",
      <>
        <div
          className="relative mx-3 mt-1 h-36 overflow-hidden rounded-2xl"
          style={{ background: CHAT_WALLPAPERS[prefs.wallpaper].value }}
          data-chat-pattern={prefs.pattern}
          aria-hidden="true"
        >
          <div className="chat-wallpaper" />
          <div className="relative flex h-full flex-col justify-center gap-2 px-4">
            <span className="w-fit max-w-[70%] rounded-lg rounded-tl-none bg-(--chat-in) px-3 py-1.5 text-[0.82rem] text-(--text) shadow-sm">
              Is the quiz open today?
            </span>
            <span className="ml-auto w-fit max-w-[70%] rounded-lg rounded-tr-none bg-(--chat-out) px-3 py-1.5 text-[0.82rem] text-(--text) shadow-sm">
              Yes, until 9 PM 👍
            </span>
          </div>
        </div>
        <Heading>Colour</Heading>
        <div
          role="radiogroup"
          aria-label="Wallpaper colour"
          className="grid grid-cols-4 gap-3 px-4 pt-1"
        >
          {(Object.keys(CHAT_WALLPAPERS) as ChatWallpaper[]).map((id) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={prefs.wallpaper === id}
              onClick={() => setChatPrefs({ wallpaper: id })}
              className="flex cursor-pointer flex-col items-center gap-1.5 border-0 bg-transparent p-0 text-[0.74rem] text-(--muted)"
            >
              <span
                className={cn(
                  "relative flex aspect-square w-full items-center justify-center rounded-xl border-2 border-solid",
                  prefs.wallpaper === id
                    ? "border-(--accent)"
                    : "border-(--chat-line)",
                )}
                style={{ background: CHAT_WALLPAPERS[id].value }}
              >
                {prefs.wallpaper === id ? (
                  <Check
                    size={18}
                    weight="bold"
                    className="text-(--accent-ink)"
                    aria-hidden="true"
                  />
                ) : null}
              </span>
              {CHAT_WALLPAPERS[id].label}
            </button>
          ))}
        </div>
        <Heading>Pattern</Heading>
        <div role="radiogroup" aria-label="Wallpaper pattern">
          {(
            [
              ["doodles", "Learning doodles", "Books, pencils, code and ideas"],
              ["dots", "Dots", "A quiet dotted grid"],
              ["none", "None", "Just the colour"],
            ] as Array<[ChatPattern, string, string]>
          ).map(([id, label, note]) => (
            <RadioRow
              key={id}
              checked={prefs.pattern === id}
              label={label}
              note={note}
              onSelect={() => setChatPrefs({ pattern: id })}
            />
          ))}
        </div>
      </>,
    );
  }

  if (page === "chats") {
    return panel(
      "Chats",
      "root",
      <>
        <SettingsRow
          title="Enter is send"
          note="Off: Enter starts a new line and Ctrl + Enter sends."
        >
          <ChatToggle
            checked={values.enterToSend}
            label="Enter is send"
            onChange={(on) => save({ enterToSend: on })}
          />
        </SettingsRow>
        <SettingsRow title="Message text size" note="On this device">
          <ChatSelect<ChatTextSize>
            ariaLabel="Message text size"
            value={prefs.textSize}
            onValueChange={(size) => setChatPrefs({ textSize: size })}
            options={(Object.keys(CHAT_TEXT_SIZES) as ChatTextSize[]).map(
              (size) => [size, CHAT_TEXT_SIZES[size].label] as const,
            )}
            width="w-32"
          />
        </SettingsRow>
        <SettingsRow
          title="Wallpaper"
          note={`${CHAT_WALLPAPERS[prefs.wallpaper].label} · ${
            prefs.pattern === "doodles"
              ? "doodles"
              : prefs.pattern === "dots"
                ? "dots"
                : "no pattern"
          }`}
          icon={<ImageSquare size={21} />}
          onClick={() => setPage("wallpaper")}
        >
          {chevron}
        </SettingsRow>
        <p className="m-0 px-4 pt-2 text-[0.8rem] leading-snug text-(--muted)">
          Chats follow the app’s theme and colours, set in your profile’s
          appearance settings.
        </p>
      </>,
    );
  }

  if (page === "notifications") {
    const permission =
      typeof Notification === "undefined"
        ? "unsupported"
        : Notification.permission;
    return panel(
      "Notifications",
      "root",
      <>
        <SettingsRow
          title="Sounds"
          note="A soft sound for a new message in another chat, or while this tab is in the background."
        >
          <ChatToggle
            checked={prefs.sounds}
            label="Sounds"
            onChange={(on) => setChatPrefs({ sounds: on })}
          />
        </SettingsRow>
        <SettingsRow
          title="Desktop alerts"
          note={
            permission === "denied"
              ? "Your browser blocks notifications for this site. Allow them in the browser’s site settings."
              : permission === "unsupported"
                ? "This browser can’t show notifications."
                : "Private messages and @mentions while the app is in the background."
          }
        >
          <ChatToggle
            checked={prefs.desktopAlerts && permission === "granted"}
            disabled={permission === "denied" || permission === "unsupported"}
            label="Desktop alerts"
            onChange={(on) => {
              if (!on) {
                setChatPrefs({ desktopAlerts: false });
                return;
              }
              void Notification.requestPermission().then((result) => {
                setChatPrefs({ desktopAlerts: result === "granted" });
                if (result !== "granted") {
                  onToast("Notifications weren’t allowed by the browser.");
                }
              });
            }}
          />
        </SettingsRow>
        <SettingsRow
          title="Show previews"
          note="The message text in desktop alerts."
        >
          <ChatToggle
            checked={prefs.previews}
            label="Show previews"
            onChange={(on) => setChatPrefs({ previews: on })}
          />
        </SettingsRow>
        <p className="m-0 px-4 pt-2 text-[0.8rem] leading-snug text-(--muted)">
          Mute a chat, or get only @mentions, from its menu or its info.
        </p>
      </>,
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
          {chevron}
        </SettingsRow>
        <SettingsRow
          title="Chats"
          note="Enter is send, text size, wallpaper"
          icon={<ChatsCircle size={21} />}
          onClick={() => setPage("chats")}
        >
          {chevron}
        </SettingsRow>
        <SettingsRow
          title="Notifications"
          note="Sounds, desktop alerts, previews"
          icon={<Bell size={21} />}
          onClick={() => setPage("notifications")}
        >
          {chevron}
        </SettingsRow>
        <SettingsRow
          title="Keyboard shortcuts"
          note="Find chats and act on them without the mouse"
          icon={<Keyboard size={21} />}
          onClick={onShowShortcuts}
        >
          {chevron}
        </SettingsRow>
        <SettingsRow
          title="Blocked people"
          note="Block someone from their chat’s menu; unblock them there too."
          icon={<Prohibit size={21} />}
        />
        <p className="m-0 flex items-start gap-2 px-4 pt-4 text-[0.78rem] leading-snug text-(--muted)">
          <Check size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          Changes save as you make them.
        </p>
      </div>
    </div>
  );
}
