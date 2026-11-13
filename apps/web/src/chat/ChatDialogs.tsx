import {
  CHAT_DELETE_FOR_EVERYONE_HOURS,
  CHAT_HELPER_MAX_MUTE_MINUTES,
  type ChatMessage,
  type ChatMuteFor,
  type ChatReason,
} from "@veolms/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { cn } from "../lib/utils";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { CHAT_THEME } from "./chatTheme";

/** A centred dialog in WhatsApp's shape: title, text, actions right-aligned. */
export function ChatDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    panelRef.current
      ?.querySelector<HTMLElement>("button, input, select, textarea")
      ?.focus();
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-250 flex items-center justify-center bg-black/50 p-4",
        CHAT_THEME,
      )}
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-2xl bg-(--surface) p-6 text-(--text) shadow-[0_24px_60px_rgb(0_0_0/0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="m-0 mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Dialog buttons: outlined; a tint and the accent edge on hover. */
const pill =
  "h-10 cursor-pointer rounded-full border border-solid border-(--chat-line-strong) bg-transparent px-5 text-[0.88rem] font-semibold text-(--accent-ink) transition-colors hover:border-(--accent) hover:bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent) active:scale-[0.98] disabled:opacity-50";
/** The one that can't be undone: solid red, darker on hover. */
const dangerPill =
  "h-10 cursor-pointer rounded-full border border-solid border-red-500 bg-red-500 px-5 text-[0.88rem] font-semibold text-white transition-colors hover:border-red-600 hover:bg-red-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500 active:scale-[0.98] disabled:opacity-50";
/** Cancel: quiet, a soft background on hover. */
const quietPill =
  "h-10 cursor-pointer rounded-full border-0 bg-transparent px-5 text-[0.88rem] font-semibold text-(--text-secondary) transition-colors hover:bg-(--chat-hover) hover:text-(--text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent)";

/** WhatsApp's "Clear this chat?" / "Delete this chat?" */
export function ClearChatDialog({
  mode,
  name,
  onConfirm,
  onClose,
}: {
  mode: "clear" | "delete";
  name: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <ChatDialog
      title={
        mode === "delete" ? `Delete chat with ${name}?` : "Clear this chat?"
      }
      onClose={onClose}
    >
      <p className="m-0 text-[0.9rem] leading-relaxed text-(--text-secondary)">
        {mode === "delete"
          ? "It is removed from your chats, with its messages, on all your devices. They keep their copy. If either of you writes again, it comes back with the new messages only."
          : "All messages are removed for you, on all your devices. Others in the chat keep theirs."}
      </p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={pill} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={dangerPill} onClick={onConfirm}>
          {mode === "delete" ? "Delete chat" : "Clear chat"}
        </button>
      </div>
    </ChatDialog>
  );
}

/**
 * WhatsApp's "Mute notifications": 8 hours, 1 week or always. Muted
 * chats make no sound or notification on any of your devices; the chat
 * stays in your list and its unread count still shows.
 */
export function MuteChatDialog({
  onMute,
  onClose,
}: {
  onMute: (muteFor: ChatMuteFor) => void;
  onClose: () => void;
}) {
  const [choice, setChoice] = useState<Exclude<ChatMuteFor, "off">>("8h");
  const options = [
    ["8h", "8 hours"],
    ["1w", "1 week"],
    ["always", "Always"],
  ] as const;
  return (
    <ChatDialog title="Mute notifications for…" onClose={onClose}>
      <p className="m-0 mb-3 text-[0.9rem] leading-relaxed text-(--text-secondary)">
        No sound or notification for this chat, on all your devices. You can
        still see its new messages.
      </p>
      <fieldset className="m-0 mb-3 border-0 p-0">
        <legend className="sr-only">For how long</legend>
        {options.map(([value, label]) => (
          <label
            key={value}
            className="flex cursor-pointer items-center gap-3 py-1.5 text-[0.92rem]"
          >
            <input
              type="radio"
              name="chat-mute-for"
              checked={choice === value}
              onChange={() => setChoice(value)}
              className="size-4.5 accent-(--accent)"
            />
            {label}
          </label>
        ))}
      </fieldset>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={pill} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={pill} onClick={() => onMute(choice)}>
          Mute
        </button>
      </div>
    </ChatDialog>
  );
}

export function DeleteMessageDialog({
  message,
  own,
  asAdmin,
  onDelete,
  onClose,
}: {
  message: ChatMessage;
  own: boolean;
  asAdmin: boolean;
  onDelete: (scope: "everyone" | "me") => void;
  onClose: () => void;
}) {
  const canForEveryone =
    (own &&
      Date.now() - new Date(message.createdAt).getTime() <
        CHAT_DELETE_FOR_EVERYONE_HOURS * 3_600_000) ||
    asAdmin;
  return (
    <ChatDialog
      title={
        own
          ? "Delete message?"
          : `Delete ${message.sender?.name ?? "this"}'s message?`
      }
      onClose={onClose}
    >
      {/* Which message, so the wrong one is not deleted. */}
      <div className="mb-3 rounded-lg border-l-4 border-solid border-(--chat-line-strong) bg-[color-mix(in_srgb,var(--text)_6%,transparent)] px-3 py-2">
        <p className="m-0 line-clamp-3 text-[0.88rem] break-words text-(--text-secondary)">
          {message.body ||
            (message.attachments[0]?.kind === "image"
              ? "📷 Photo"
              : message.attachments[0]?.kind === "video"
                ? "🎥 Video"
                : message.attachments[0]?.kind === "audio"
                  ? "🎤 Voice message"
                  : `📄 ${message.attachments[0]?.name ?? "Message"}`)}
        </p>
      </div>
      <p className="m-0 mb-5 text-[0.85rem] leading-snug text-(--muted)">
        {!own && asAdmin
          ? "Everyone will see “This message was deleted by admin”. Group admins can restore it for 7 days."
          : canForEveryone
            ? "“Delete for everyone” removes it for everyone in this chat. “Delete for me” removes it only for you."
            : "It is removed only for you; others still see it."}
      </p>
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" className={quietPill} onClick={onClose}>
          Cancel
        </button>
        <button type="button" className={pill} onClick={() => onDelete("me")}>
          Delete for me
        </button>
        {canForEveryone ? (
          <button
            type="button"
            className={dangerPill}
            onClick={() => onDelete("everyone")}
          >
            Delete for everyone
          </button>
        ) : null}
      </div>
    </ChatDialog>
  );
}

const DURATIONS = [
  { label: "1 hour", minutes: 60 },
  { label: "24 hours", minutes: 1440 },
  { label: "1 week", minutes: 10080 },
  { label: "Always", minutes: null },
] as const;

export const REASONS: Array<{ value: ChatReason; label: string }> = [
  { value: "spam", label: "Spam or promotion" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "scam", label: "Scam or phishing" },
  { value: "inappropriate", label: "Inappropriate content" },
  { value: "other", label: "Something else" },
];

/** Mute or remove a member (WhatsApp's "Mute notifications" layout). */
export function RestrictDialog({
  name,
  mode,
  helperOnly,
  canRestrictEverywhere,
  onSubmit,
  onClose,
}: {
  name: string;
  mode: "mute" | "ban";
  helperOnly: boolean;
  canRestrictEverywhere: boolean;
  onSubmit: (input: {
    durationMinutes: number | null;
    reason: ChatReason;
    everywhere: boolean;
  }) => void;
  onClose: () => void;
}) {
  const options = helperOnly
    ? DURATIONS.filter(
        (d) => d.minutes !== null && d.minutes <= CHAT_HELPER_MAX_MUTE_MINUTES,
      )
    : DURATIONS;
  const [duration, setDuration] = useState<number | null>(
    options[1]?.minutes ?? 60,
  );
  const [reason, setReason] = useState<ChatReason>("spam");
  const [everywhere, setEverywhere] = useState(false);
  return (
    <ChatDialog
      title={
        mode === "mute"
          ? `Mute ${name} in this group?`
          : `Remove ${name} from the group?`
      }
      onClose={onClose}
    >
      <p className="m-0 mb-3 text-[0.88rem] text-(--text-secondary)">
        {mode === "mute"
          ? `${name} can still read, but can't send messages.`
          : `${name} won't see this group or its messages.`}
      </p>
      {mode === "mute" ? (
        <fieldset className="m-0 mb-3 border-0 p-0">
          <legend className="sr-only">For how long</legend>
          {options.map((option) => (
            <label
              key={option.label}
              className="flex cursor-pointer items-center gap-3 py-1.5 text-[0.92rem]"
            >
              <input
                type="radio"
                name="mute-duration"
                checked={duration === option.minutes}
                onChange={() => setDuration(option.minutes)}
                className="size-4.5 accent-(--accent)"
              />
              {option.label}
            </label>
          ))}
        </fieldset>
      ) : null}
      <div className="mb-3">
        <div className="mb-1.5 text-[0.82rem] text-(--muted)">Reason</div>
        <div
          role="radiogroup"
          aria-label="Reason"
          className="flex flex-wrap gap-2"
        >
          {REASONS.map((r) => (
            <button
              key={r.value}
              type="button"
              role="radio"
              aria-checked={reason === r.value}
              onClick={() => setReason(r.value)}
              className={cn(
                "h-8 cursor-pointer rounded-full border border-solid px-3 text-[0.82rem] font-medium",
                reason === r.value
                  ? "border-transparent bg-(--accent-soft) text-(--accent-ink)"
                  : "border-(--chat-line-strong) bg-transparent text-(--text-secondary) hover:bg-(--chat-hover)",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      {canRestrictEverywhere && !helperOnly ? (
        <label className="mb-4 flex cursor-pointer items-center gap-3 text-[0.9rem]">
          <input
            type="checkbox"
            checked={everywhere}
            onChange={(e) => setEverywhere(e.target.checked)}
            className="size-4.5 accent-(--accent)"
          />
          In all chats (admins are notified)
        </label>
      ) : null}
      <div className="flex justify-end gap-2">
        <button type="button" className={pill} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={
            mode === "ban"
              ? dangerPill
              : cn(
                  pill,
                  "bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover)",
                )
          }
          onClick={() =>
            onSubmit({
              durationMinutes: mode === "ban" ? null : duration,
              reason,
              everywhere,
            })
          }
        >
          {mode === "mute" ? "Mute" : "Remove"}
        </button>
      </div>
    </ChatDialog>
  );
}

export function ReportDialog({
  name,
  privateChat,
  onSubmit,
  onClose,
}: {
  name: string;
  privateChat: boolean;
  onSubmit: (input: {
    reason: ChatReason;
    details: string;
    block: boolean;
  }) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState<ChatReason>("spam");
  const [details, setDetails] = useState("");
  const [block, setBlock] = useState(true);
  return (
    <ChatDialog title={`Report ${name}?`} onClose={onClose}>
      <p className="m-0 mb-3 text-[0.88rem] text-(--text-secondary)">
        This message and the few before it go to{" "}
        {privateChat ? "the platform admins" : "the group's admins"}. {name}{" "}
        won’t be told who reported.
      </p>
      <fieldset className="m-0 mb-2 border-0 p-0">
        <legend className="sr-only">Reason</legend>
        {REASONS.map((r) => (
          <label
            key={r.value}
            className="flex cursor-pointer items-center gap-3 py-1 text-[0.9rem]"
          >
            <input
              type="radio"
              name="report-reason"
              checked={reason === r.value}
              onChange={() => setReason(r.value)}
              className="size-4.5 accent-(--accent)"
            />
            {r.label}
          </label>
        ))}
      </fieldset>
      <label className="mb-3 block">
        <span className="sr-only">Details</span>
        <textarea
          rows={2}
          value={details}
          maxLength={1000}
          onChange={(e) => setDetails(e.target.value)}
          placeholder="Anything that helps (optional)"
          className="w-full resize-none rounded-lg border border-solid border-(--chat-line-strong) bg-(--chat-input) px-3 py-2 text-[0.9rem] text-(--text)"
        />
      </label>
      <label className="mb-4 flex cursor-pointer items-center gap-3 text-[0.9rem]">
        <input
          type="checkbox"
          checked={block}
          onChange={(e) => setBlock(e.target.checked)}
          className="size-4.5 accent-(--accent)"
        />
        Also block {name}
      </label>
      <div className="flex justify-end gap-2">
        <button type="button" className={pill} onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          className={dangerPill}
          onClick={() => onSubmit({ reason, details, block })}
        >
          Report
        </button>
      </div>
    </ChatDialog>
  );
}
