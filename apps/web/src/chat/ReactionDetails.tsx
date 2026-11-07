import { SmileyIcon as Smiley } from "@phosphor-icons/react/Smiley";
import type { ChatMessage } from "@veolms/contracts";
import { useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../components/ui/popover";
import { cn } from "../lib/utils";
import { useMessageReactions } from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import type { MessageAction } from "./MessageMenu";

/**
 * The reactions under a message, and what tapping them shows (WhatsApp):
 * "N reactions", a tab for all and one per emoji with its count, then who
 * reacted with what. Your own row reads "You · Click to remove".
 */
export function ReactionDetails({
  message,
  reactions,
  viewerId,
  outgoing,
  onAction,
}: {
  message: ChatMessage;
  /** Emoji → count, as on the message. */
  reactions: [string, number][];
  viewerId: string | null;
  outgoing: boolean;
  onAction: (action: MessageAction, message: ChatMessage) => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string>("all");
  const sorted = [...reactions].sort((a, b) => b[1] - a[1]);
  const total = sorted.reduce((sum, [, count]) => sum + count, 0);
  // The counts change when anyone reacts: load the list again then.
  const version = sorted.map(([emoji, count]) => `${emoji}${count}`).join("");
  const people = useMessageReactions(
    message.roomId,
    message.seq,
    version,
    open,
  );
  // A tab whose emoji is gone (its last reaction removed) falls back to all.
  const selected =
    tab === "all" || sorted.some(([emoji]) => emoji === tab) ? tab : "all";
  const list = (people.data?.reactions ?? []).filter(
    (person) => selected === "all" || person.emoji === selected,
  );
  const tabs: { id: string; label: string; count: number }[] = [
    ...(sorted.length > 1 ? [{ id: "all", label: "All", count: total }] : []),
    ...sorted.map(([emoji, count]) => ({ id: emoji, label: emoji, count })),
  ];
  const close = () => setOpen(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setTab("all");
      }}
    >
      <PopoverTrigger
        className={cn(
          "absolute -bottom-3.5 flex cursor-pointer items-center gap-0.5 rounded-full border-2 border-solid border-(--chat-bg) bg-(--chat-in) px-1.5 py-px text-[0.78rem] text-(--text-secondary) shadow-sm",
          outgoing ? "right-2" : "left-2",
        )}
        aria-label={`${total} ${total === 1 ? "reaction" : "reactions"}: ${sorted
          .map(([e, c]) => `${e} ${c}`)
          .join(", ")}. Show who reacted`}
      >
        {sorted.slice(0, 3).map(([emoji]) => (
          <span key={emoji}>{emoji}</span>
        ))}
        {total > 1 ? (
          <span className="ml-0.5 tabular-nums">{total}</span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align={outgoing ? "end" : "start"}
        className="flex w-[min(22rem,calc(100vw-1.5rem))] max-w-none flex-col overflow-hidden p-0"
      >
        <div className="px-4 pt-3.5">
          <p className="m-0 text-[0.82rem] text-(--muted)">
            {total} {total === 1 ? "reaction" : "reactions"}
          </p>
          <div
            role="tablist"
            aria-label="Reactions"
            className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-3"
          >
            <button
              type="button"
              aria-label="Add a reaction"
              onClick={() => {
                close();
                onAction("react-more", message);
              }}
              className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-solid border-(--border) bg-transparent text-(--text-secondary) hover:bg-(--hover)"
            >
              <Smiley size={19} aria-hidden="true" />
            </button>
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected === item.id}
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-full border border-solid px-3 text-[0.88rem] text-(--text)",
                  selected === item.id
                    ? "border-(--accent) bg-[color-mix(in_srgb,var(--accent)_16%,transparent)]"
                    : "border-(--border) bg-transparent hover:bg-(--hover)",
                )}
              >
                <span className={item.id === "all" ? "" : "text-[1.05rem]"}>
                  {item.label}
                </span>
                <span className="tabular-nums">{item.count}</span>
              </button>
            ))}
          </div>
        </div>
        <ul
          role="tabpanel"
          className="m-0 max-h-72 min-h-24 list-none overflow-y-auto border-t border-solid border-(--border) p-0 py-1"
        >
          {people.isPending
            ? Array.from({ length: Math.min(total, 4) }, (_, i) => (
                <li key={i} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="size-10 animate-pulse rounded-full bg-(--hover)" />
                  <span className="h-3.5 w-32 animate-pulse rounded bg-(--hover)" />
                </li>
              ))
            : list.map((person) => {
                const mine = person.id === viewerId;
                const row = (
                  <>
                    <ChatAvatar
                      name={person.name}
                      url={person.avatarUrl}
                      size="md"
                    />
                    <span className="min-w-0 flex-1 text-left">
                      <span className="block truncate text-[0.95rem] text-(--text)">
                        {mine ? "You" : person.name}
                      </span>
                      {mine ? (
                        <span className="block text-[0.8rem] text-(--muted)">
                          Click to remove
                        </span>
                      ) : null}
                    </span>
                    <span className="text-[1.4rem] leading-none">
                      {person.emoji}
                    </span>
                  </>
                );
                return (
                  <li key={person.id}>
                    {mine ? (
                      <button
                        type="button"
                        onClick={() => {
                          close();
                          onAction("react-remove", message);
                        }}
                        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-2.5 hover:bg-(--hover)"
                      >
                        {row}
                      </button>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-2.5">
                        {row}
                      </div>
                    )}
                  </li>
                );
              })}
          {people.isError ? (
            <li className="px-4 py-6 text-center text-[0.85rem] text-(--muted)">
              Couldn’t load reactions.
            </li>
          ) : null}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
