import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { useEffect } from "react";
import { createPortal } from "react-dom";

import { cn } from "../lib/utils";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { ChatAvatar } from "./ChatAvatar";
import { CHAT_THEME } from "./chatTheme";

/**
 * WhatsApp's profile photo pop-up: tapping a picture in the chat list shows
 * it large near the top, the name over it, and Message / Info underneath.
 * Without a photo, the same initials, large. Back, Esc or a tap outside
 * closes it.
 */
export function ProfilePhotoPreview({
  name,
  url,
  group,
  onMessage,
  onInfo,
  onClose,
}: {
  name: string;
  url: string | null;
  group: boolean;
  onMessage: () => void;
  onInfo: () => void;
  onClose: () => void;
}) {
  useBackDismiss({ open: true, onDismiss: onClose });
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  const action =
    "flex flex-1 cursor-pointer items-center justify-center gap-2 border-0 bg-transparent py-3.5 text-[0.88rem] font-semibold text-(--accent-ink) hover:bg-(--chat-hover)";

  return createPortal(
    <div
      className={cn(
        CHAT_THEME,
        "fixed inset-0 z-250 flex justify-center bg-black/55 px-6 pt-[12vh]",
      )}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${name}’s photo`}
        className="h-fit w-full max-w-72 overflow-hidden rounded-2xl bg-(--chat-panel) shadow-[0_24px_60px_rgb(0_0_0/0.45)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="relative aspect-square w-full bg-(--chat-input)">
          {url ? (
            <img src={url} alt={name} className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center">
              <ChatAvatar
                name={name}
                group={group}
                className="size-40 text-[3.2rem]"
              />
            </div>
          )}
          <div className="absolute inset-x-0 top-0 bg-linear-to-b from-black/55 to-transparent px-4 pt-3 pb-8">
            <span className="block truncate text-[1rem] font-semibold text-white">
              {name}
            </span>
          </div>
        </div>
        <div className="flex border-t border-solid border-(--chat-line)">
          <button type="button" className={action} onClick={onMessage}>
            <ChatCircleText size={20} aria-hidden="true" /> Message
          </button>
          <span className="w-px bg-(--chat-line)" aria-hidden="true" />
          <button type="button" className={action} onClick={onInfo}>
            <Info size={20} aria-hidden="true" /> Info
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
