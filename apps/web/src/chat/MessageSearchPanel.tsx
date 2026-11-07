import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useEffect, useState, type ReactNode } from "react";

import { useDebounce } from "../hooks/useDebounce";
import { getApiError } from "../lib/api-error";
import { useMessageSearch } from "../services/chat";
import { DrawerHeader } from "./ChatControls";
import { listTime } from "./chatFormat";

/** The text with every match of `term` marked. */
function highlight(text: string, term: string): ReactNode {
  if (!term) return text;
  const lower = text.toLowerCase();
  const needle = term.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  for (;;) {
    const at = lower.indexOf(needle, from);
    if (at < 0) break;
    parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={at}
        className="rounded-sm bg-[color-mix(in_srgb,var(--accent)_30%,transparent)] px-0.5 text-(--text)"
      >
        {text.slice(at, at + needle.length)}
      </mark>,
    );
    from = at + needle.length;
  }
  parts.push(text.slice(from));
  return parts;
}

/** A window of the message around the first match, for long messages. */
function around(text: string, term: string, width = 140): string {
  const at = text.toLowerCase().indexOf(term.toLowerCase());
  if (text.length <= width || at < 0) return text;
  const start = Math.max(0, at - 40);
  return `${start > 0 ? "…" : ""}${text.slice(start, start + width)}…`;
}

/**
 * WhatsApp's "Search messages" for one chat: words anywhere in a message,
 * newest first, more as you scroll; picking one jumps to it. Uses the
 * chat's text index on the server, so it stays fast in groups with years
 * of messages.
 */
export function MessageSearchPanel({
  roomId,
  onClose,
  onJumpTo,
}: {
  roomId: string;
  onClose: () => void;
  onJumpTo: (seq: number) => void;
}) {
  const [text, setText] = useState("");
  const term = useDebounce(text.trim(), 250);
  const search = useMessageSearch(roomId, term);
  const results = (search.data?.pages ?? []).flatMap((page) => page.messages);

  useEffect(() => setText(""), [roomId]);

  return (
    <aside
      aria-label="Search messages"
      className="flex h-full min-h-0 w-full flex-col bg-(--chat-panel)"
    >
      <DrawerHeader title="Search messages" onClose={onClose} />
      <label className="mx-3 my-2 flex h-10 shrink-0 items-center gap-3 rounded-full bg-(--chat-input) px-4 focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-(--accent)">
        <MagnifyingGlass
          size={17}
          className="shrink-0 text-(--muted)"
          aria-hidden="true"
        />
        <span className="sr-only">Search in this chat</span>
        <input
          autoFocus
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.stopPropagation();
              if (text) setText("");
              else onClose();
            }
            if (event.key === "Enter" && results[0]) onJumpTo(results[0].seq);
          }}
          placeholder="Search…"
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
        />
        {text ? (
          <button
            type="button"
            onClick={() => setText("")}
            aria-label="Clear search"
            className="inline-flex size-6 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:text-(--text)"
          >
            <X size={15} />
          </button>
        ) : null}
      </label>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-2 pb-4"
        onScroll={(event) => {
          const box = event.currentTarget;
          if (
            box.scrollHeight - box.scrollTop - box.clientHeight < 200 &&
            search.hasNextPage &&
            !search.isFetchingNextPage
          ) {
            void search.fetchNextPage();
          }
        }}
      >
        {term.length < 2 ? (
          <p className="m-0 px-6 py-10 text-center text-[0.86rem] text-(--muted)">
            Search for messages in this chat by any word in them.
          </p>
        ) : search.isError ? (
          <p className="m-0 px-6 py-10 text-center text-[0.86rem] text-(--muted)">
            {getApiError(search.error).message}
          </p>
        ) : search.isLoading ? (
          <p className="m-0 px-6 py-10 text-center text-[0.86rem] text-(--muted)">
            Searching…
          </p>
        ) : results.length === 0 ? (
          <p className="m-0 px-6 py-10 text-center text-[0.86rem] text-(--muted)">
            No messages found for “{term}”.
          </p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-0.5 p-0">
            {results.map((message) => (
              <li key={message.id}>
                <button
                  type="button"
                  onClick={() => onJumpTo(message.seq)}
                  className="flex w-full cursor-pointer flex-col gap-1 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-(--text) hover:bg-(--chat-hover)"
                >
                  <span className="flex items-center gap-2 text-[0.76rem] text-(--muted)">
                    <span className="min-w-0 flex-1 truncate font-semibold text-(--accent-ink)">
                      {message.sender?.name ?? "Someone"}
                    </span>
                    {listTime(message.createdAt)}
                  </span>
                  <span className="line-clamp-3 text-[0.88rem] text-(--text-secondary)">
                    {highlight(around(message.body, term), term)}
                  </span>
                </button>
              </li>
            ))}
            {search.isFetchingNextPage ? (
              <li className="px-4 py-3 text-center text-[0.8rem] text-(--muted)">
                Loading more…
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </aside>
  );
}
