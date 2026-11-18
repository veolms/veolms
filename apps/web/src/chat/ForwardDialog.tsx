import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { PaperPlaneRightIcon as PaperPlaneRight } from "@phosphor-icons/react/PaperPlaneRight";
import { CHAT_FORWARD_MAX_CHATS } from "@veolms/contracts";
import { useMemo, useState } from "react";

import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useChatRooms, useForwardMessages } from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { ChatDialog } from "./ChatDialogs";
import { roomAvatarUrl } from "./chatIcon";

/**
 * WhatsApp's "Forward message to": search your chats, tick up to five, and
 * send. The messages go in order, marked "Forwarded"; files go along
 * without uploading again.
 */
export function ForwardDialog({
  fromRoomId,
  seqs,
  onClose,
  onDone,
  onToast,
}: {
  fromRoomId: string;
  seqs: readonly number[];
  onClose: () => void;
  /** Sent somewhere: leave selection, and open the chat if it was one. */
  onDone: (roomIds: string[]) => void;
  onToast: (message: string) => void;
}) {
  const rooms = useChatRooms();
  const forward = useForwardMessages();
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<string[]>([]);

  const list = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (rooms.data?.rooms ?? [])
      .filter((room) => room.me.canPost !== false)
      .filter((room) => !term || room.title.toLowerCase().includes(term));
  }, [rooms.data, search]);

  function toggle(roomId: string) {
    setPicked((current) => {
      if (current.includes(roomId))
        return current.filter((id) => id !== roomId);
      if (current.length >= CHAT_FORWARD_MAX_CHATS) {
        onToast(`You can forward to up to ${CHAT_FORWARD_MAX_CHATS} chats.`);
        return current;
      }
      return [...current, roomId];
    });
  }

  function send() {
    forward.mutate(
      { fromRoomId, seqs: [...seqs], toRoomIds: picked },
      {
        onSuccess: ({ results }) => {
          const failed = results.filter((r) => r.error);
          const done = results.filter((r) => !r.error).map((r) => r.roomId);
          if (failed.length === 0) {
            onToast(
              picked.length === 1
                ? "Forwarded"
                : `Forwarded to ${picked.length} chats`,
            );
          } else {
            const names = failed
              .map(
                (r) =>
                  rooms.data?.rooms.find((room) => room.id === r.roomId)
                    ?.title ?? "a chat",
              )
              .join(", ");
            onToast(`Not forwarded to ${names}: ${failed[0]!.error}`);
          }
          onDone(done);
        },
        onError: (error) => onToast(getApiError(error).message),
      },
    );
  }

  const names = picked
    .map((id) => rooms.data?.rooms.find((room) => room.id === id)?.title)
    .filter(Boolean)
    .join(", ");

  return (
    <ChatDialog
      title={`Forward ${seqs.length === 1 ? "message" : `${seqs.length} messages`} to`}
      onClose={onClose}
    >
      <label className="mb-2 flex h-10 items-center gap-2 rounded-xl bg-(--chat-input) px-3">
        <MagnifyingGlass
          size={16}
          className="text-(--muted)"
          aria-hidden="true"
        />
        <span className="sr-only">Search chats</span>
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search chats"
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
        />
      </label>
      <ul
        className="m-0 -mx-2 max-h-[45vh] list-none overflow-y-auto p-0"
        aria-label="Chats"
      >
        {list.map((room) => {
          const on = picked.includes(room.id);
          return (
            <li key={room.id}>
              <button
                type="button"
                role="checkbox"
                aria-checked={on}
                onClick={() => toggle(room.id)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2 py-2 text-left text-(--text) hover:bg-(--chat-hover)"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-solid",
                    on
                      ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                      : "border-(--chat-line-strong)",
                  )}
                >
                  {on ? <Check size={12} weight="bold" /> : null}
                </span>
                <ChatAvatar
                  name={room.title}
                  url={roomAvatarUrl(room)}
                  group={room.kind !== "direct"}
                  size="md"
                />
                <span className="min-w-0 flex-1 truncate text-[0.92rem]">
                  {room.title}
                </span>
              </button>
            </li>
          );
        })}
        {list.length === 0 ? (
          <li className="px-2 py-6 text-center text-[0.85rem] text-(--muted)">
            No chats found
          </li>
        ) : null}
      </ul>
      <div className="mt-3 flex items-center gap-3">
        <span className="min-w-0 flex-1 truncate text-[0.82rem] text-(--muted)">
          {names || `Pick up to ${CHAT_FORWARD_MAX_CHATS} chats`}
        </span>
        <button
          type="button"
          onClick={send}
          disabled={picked.length === 0 || forward.isPending}
          aria-label="Forward"
          className="inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-(--accent) text-(--on-accent) hover:bg-(--accent-hover) disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PaperPlaneRight size={19} weight="fill" />
        </button>
      </div>
    </ChatDialog>
  );
}
