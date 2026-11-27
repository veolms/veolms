import { PlusIcon as Plus } from "@phosphor-icons/react/Plus";
import { useLayoutEffect, useRef, useState } from "react";

import { cn } from "../lib/utils";
import { QUICK_REACTIONS } from "./MessageMenu";

/**
 * WhatsApp's reaction bar on a long-pressed message: the quick reactions
 * and "+" float over the chat just above the chosen message (below it when
 * there is no room above). It shows while that one message is selected;
 * picking an emoji reacts and ends the selection.
 */
export function SelectionReactionBar({
  outgoing,
  inset,
  mine,
  onPick,
  onMore,
}: {
  outgoing: boolean;
  /** Left inset for someone else's message in a group (their picture). */
  inset: boolean;
  /** The emoji you already reacted with: picking it again takes it back. */
  mine: string | null;
  onPick: (emoji: string) => void;
  onMore: () => void;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);

  // Above the message unless that is under the chat's header.
  useLayoutEffect(() => {
    const bar = barRef.current;
    const thread = bar?.closest("[data-chat-thread]");
    if (!bar || !thread) return;
    setBelow(
      bar.getBoundingClientRect().top < thread.getBoundingClientRect().top + 4,
    );
  }, []);

  return (
    <div
      ref={barRef}
      role="toolbar"
      aria-label="React to message"
      className={cn(
        "absolute z-40 flex items-center gap-0.5 rounded-full bg-(--chat-panel) p-1 shadow-[0_2px_10px_rgb(0_0_0/0.22)]",
        "animate-in fade-in zoom-in-90 duration-150 motion-reduce:animate-none",
        below ? "top-full mt-1 origin-top" : "bottom-full mb-0.5 origin-bottom",
        outgoing
          ? "right-[4%]"
          : inset
            ? "left-[calc(4%+2.375rem)]"
            : "left-[4%]",
      )}
    >
      {QUICK_REACTIONS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          aria-label={mine === emoji ? `Remove ${emoji}` : `React ${emoji}`}
          aria-pressed={mine === emoji}
          onClick={() => onPick(emoji)}
          className={cn(
            "flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-[1.35rem] leading-none transition-transform active:scale-90",
            "hover:bg-(--chat-selected) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)",
            mine === emoji && "bg-(--chat-selected)",
          )}
        >
          {emoji}
        </button>
      ))}
      <button
        type="button"
        aria-label="More reactions"
        onClick={onMore}
        className="flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent p-0 text-(--text-secondary) hover:bg-(--chat-selected) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--accent)"
      >
        <Plus size={18} weight="bold" />
      </button>
    </div>
  );
}
