import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { XIcon as X } from "@phosphor-icons/react/X";
import { CHAT_FORWARD_MAX_MESSAGES } from "@veolms/contracts";
import { useEffect } from "react";

import { chatIconButton } from "./ChatControls";

/**
 * WhatsApp's bar while choosing messages: how many, Copy, Forward, Delete and ✕
 * (or Esc) to stop. With one message chosen (a long press chooses it, as
 * on WhatsApp's phone app) it also has Reply, Star and ⋮ (the message's
 * other actions). Takes the chat header's place.
 */
export function SelectionBar({
  count,
  onCancel,
  onCopy,
  onForward,
  onDelete,
  single,
}: {
  count: number;
  /** Only with one message chosen: its own actions. */
  single?: {
    onReply?: () => void;
    starred: boolean;
    onStar: () => void;
    onMore: () => void;
  } | null;
  onCancel: () => void;
  onCopy: () => void;
  onForward: () => void;
  onDelete: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      onCancel();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onCancel]);

  const tooMany = count > CHAT_FORWARD_MAX_MESSAGES;
  return (
    <div
      role="toolbar"
      aria-label="Selected messages"
      className="z-10 flex h-16 shrink-0 items-center gap-1 border-b border-solid border-(--chat-line) bg-(--chat-panel) px-2 @[720px]/chat:px-4"
    >
      <button
        type="button"
        className={chatIconButton}
        aria-label="Cancel selection"
        onClick={onCancel}
      >
        <X size={20} />
      </button>
      <span className="min-w-0 flex-1 truncate pl-1 text-[0.98rem] font-medium text-(--text)">
        {/* WhatsApp: just the number on a phone, where the actions need
            the room; the word stays for screen readers. */}
        {count}
        <span className="@max-[480px]/chat:sr-only"> selected</span>
      </span>
      {single?.onReply ? (
        <button
          type="button"
          className={chatIconButton}
          aria-label="Reply"
          title="Reply"
          onClick={single.onReply}
        >
          <ArrowBendUpLeft size={20} />
        </button>
      ) : null}
      {single ? (
        <button
          type="button"
          className={chatIconButton}
          aria-label={single.starred ? "Unstar" : "Star"}
          aria-pressed={single.starred}
          title={single.starred ? "Unstar" : "Star"}
          onClick={single.onStar}
        >
          <Star size={20} weight={single.starred ? "fill" : "regular"} />
        </button>
      ) : null}
      <button
        type="button"
        className={chatIconButton}
        aria-label="Copy text"
        title="Copy text"
        onClick={onCopy}
      >
        <Copy size={20} />
      </button>
      <button
        type="button"
        className={chatIconButton}
        aria-label="Forward"
        title={
          tooMany
            ? `Up to ${CHAT_FORWARD_MAX_MESSAGES} messages at a time`
            : "Forward"
        }
        disabled={tooMany}
        onClick={onForward}
      >
        <ShareFat size={20} />
      </button>
      <button
        type="button"
        className={chatIconButton}
        aria-label="Delete"
        title="Delete"
        onClick={onDelete}
      >
        <Trash size={20} />
      </button>
      {single ? (
        <button
          type="button"
          className={chatIconButton}
          aria-label="More options"
          title="More"
          onClick={single.onMore}
        >
          <DotsThreeVertical size={20} weight="bold" />
        </button>
      ) : null}
    </div>
  );
}
