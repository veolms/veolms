import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import type { ReactNode } from "react";

/** A laptop with two speech bubbles, in the palette's accent. */
function ChatIllustration() {
  return (
    <svg
      viewBox="0 0 240 160"
      className="h-auto w-60 max-w-[70%]"
      aria-hidden="true"
    >
      <rect
        x="38"
        y="34"
        width="164"
        height="102"
        rx="10"
        className="fill-(--chat-in) stroke-(--chat-line-strong)"
        strokeWidth="2"
      />
      <rect
        x="50"
        y="46"
        width="140"
        height="78"
        rx="4"
        className="fill-(--chat-bg)"
      />
      <path d="M20 136h200l-10 12H30z" className="fill-(--chat-line-strong)" />
      <rect
        x="62"
        y="58"
        width="74"
        height="22"
        rx="8"
        className="fill-(--chat-in)"
      />
      <rect
        x="104"
        y="88"
        width="74"
        height="22"
        rx="8"
        className="fill-(--chat-out)"
      />
      <path
        d="M152 18h56a10 10 0 0 1 10 10v26a10 10 0 0 1-10 10h-34l-14 12v-12h-8a10 10 0 0 1-10-10V28a10 10 0 0 1 10-10z"
        className="fill-(--accent)"
      />
      <circle cx="166" cy="41" r="4" className="fill-(--on-accent)" />
      <circle cx="180" cy="41" r="4" className="fill-(--on-accent)" />
      <circle cx="194" cy="41" r="4" className="fill-(--on-accent)" />
    </svg>
  );
}

function Action({
  icon,
  label,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-24 cursor-pointer flex-col items-center gap-2 border-0 bg-transparent p-0 text-[0.8rem] text-(--text-secondary) hover:text-(--text)"
    >
      <span className="flex size-14 items-center justify-center rounded-full bg-(--chat-in) text-(--text) shadow-[0_1px_2px_rgb(0_0_0/0.12)] transition-transform group-hover:scale-105">
        {icon}
      </span>
      {label}
    </button>
  );
}

/**
 * What the chat area shows with no chat open (WhatsApp's welcome screen):
 * a plain surface, no wallpaper, a picture, a line about Chats, quick
 * actions and a note on who can read chats.
 */
export function ChatHome({
  isStaff,
  onNewChat,
  onStarred,
  onSettings,
  onCourseGroups,
}: {
  isStaff: boolean;
  onNewChat: () => void;
  onStarred: () => void;
  onSettings: () => void;
  onCourseGroups: () => void;
}) {
  return (
    <div className="relative flex flex-1 flex-col items-center justify-center bg-[color-mix(in_srgb,var(--text)_2.5%,var(--chat-bg))] px-8 pt-10 pb-20 text-center">
      <ChatIllustration />
      <h2 className="m-0 mt-8 text-[1.9rem] font-light tracking-[-0.01em] text-(--text)">
        Chats
      </h2>
      <p className="m-0 mt-3 max-w-md text-[0.92rem] leading-relaxed text-(--muted)">
        Talk with your course groups, classmates and teachers. Pick a chat on
        the left, or start a new one.
      </p>
      <div className="mt-8 flex flex-wrap justify-center gap-5">
        <Action
          icon={<NotePencil size={22} />}
          label="New chat"
          onClick={onNewChat}
        />
        {isStaff ? (
          <Action
            icon={<UsersThree size={22} />}
            label="Course groups"
            onClick={onCourseGroups}
          />
        ) : null}
        <Action icon={<Star size={22} />} label="Starred" onClick={onStarred} />
        <Action
          icon={<GearSix size={22} />}
          label="Settings"
          onClick={onSettings}
        />
      </div>
      <p className="absolute right-6 bottom-8 left-6 m-0 flex items-center justify-center gap-1.5 text-[0.8rem] text-(--muted)">
        <LockSimple size={14} aria-hidden="true" />
        Only people in a chat can read it. Admins see a private message only if
        it’s reported.
      </p>
    </div>
  );
}
