import { CopyIcon as Copy } from "@phosphor-icons/react/Copy";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { XIcon as X } from "@phosphor-icons/react/X";
import { CHAT_FORWARD_MAX_MESSAGES } from "@veolms/contracts";
import { useEffect } from "react";

import { chatIconButton } from "./ChatControls";

/**
 * WhatsApp's bar while choosing messages: how many, Copy, Forward, and ✕
 * (or Esc) to stop. Takes the chat header's place.
 */
export function SelectionBar({
  count,
  onCancel,
  onCopy,
  onForward,
}: {
  count: number;
  onCancel: () => void;
  onCopy: () => void;
  onForward: () => void;
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
        {count} selected
      </span>
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
    </div>
  );
}
