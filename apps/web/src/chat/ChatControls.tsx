import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { XIcon as X } from "@phosphor-icons/react/X";
import type { ReactNode } from "react";

import { cn } from "../lib/utils";

/** A round 40 px icon button (WhatsApp's header and panel icons). */
export const chatIconButton =
  "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) transition-colors hover:bg-(--chat-hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-(--accent)";

/** WhatsApp's on/off switch. */
export function ChatToggle({
  checked,
  label,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10.5 shrink-0 cursor-pointer rounded-full border-0 transition-colors disabled:cursor-default disabled:opacity-50",
        checked ? "bg-(--accent)" : "bg-(--chat-line-strong)",
      )}
    >
      <span
        className={cn(
          "absolute top-0.75 size-4.5 rounded-full shadow-sm transition-[left]",
          checked ? "left-5.25 bg-(--on-accent)" : "left-0.75 bg-white",
        )}
      />
    </button>
  );
}

/**
 * The header of a panel that slides over the chat list (New chat,
 * Settings, Course groups…): a back arrow and a title, as in WhatsApp.
 */
export function ListPanelHeader({
  title,
  onBack,
  children,
}: {
  title: string;
  onBack: () => void;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-2 px-3">
      <button
        type="button"
        className={chatIconButton}
        onClick={onBack}
        aria-label="Back"
      >
        <ArrowLeft size={21} />
      </button>
      <h2 className="m-0 min-w-0 flex-1 truncate text-[1.15rem] font-semibold text-(--text)">
        {title}
      </h2>
      {children}
    </div>
  );
}

/** The header of a drawer on the right (group info, message info). */
export function DrawerHeader({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex h-16 shrink-0 items-center gap-3 border-b border-solid border-(--chat-line) px-3">
      <button
        type="button"
        className={chatIconButton}
        onClick={onClose}
        aria-label="Close"
      >
        <X size={20} />
      </button>
      <h2 className="m-0 text-[1.05rem] font-semibold text-(--text)">
        {title}
      </h2>
    </div>
  );
}

/** A settings row: title, optional note, and a control or chevron. */
export function SettingsRow({
  title,
  note,
  icon,
  onClick,
  children,
  danger = false,
}: {
  title: string;
  note?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
  children?: ReactNode;
  danger?: boolean;
}) {
  const body = (
    <>
      {icon ? (
        <span
          className={cn(
            "flex size-6 shrink-0 items-center justify-center",
            danger ? "text-red-500" : "text-(--muted)",
          )}
          aria-hidden="true"
        >
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1">
        <span
          className={cn(
            "block text-[0.95rem]",
            danger ? "text-red-500" : "text-(--text)",
          )}
        >
          {title}
        </span>
        {note ? (
          <span className="mt-0.5 block text-[0.8rem] leading-snug text-(--muted)">
            {note}
          </span>
        ) : null}
      </span>
      {children}
    </>
  );
  const className =
    "flex w-full items-center gap-4 rounded-xl px-4 py-3.5 text-left";
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        className,
        "cursor-pointer border-0 bg-transparent hover:bg-(--chat-hover)",
      )}
    >
      {body}
    </button>
  ) : (
    <div className={className}>{body}</div>
  );
}
