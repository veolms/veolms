import { ChecksIcon as Checks } from "@phosphor-icons/react/Checks";
import type { ChatMessage, ChatPerson } from "@veolms/contracts";

import { getApiError } from "../lib/api-error";
import { useMessageInfo } from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { DrawerHeader } from "./ChatControls";
import { messageTime } from "./chatFormat";

/**
 * WhatsApp's "Message info" for your own message: the message, then who
 * has read it (blue ticks) and who has only received it (grey ticks).
 * Refreshes every few seconds while open.
 */
export function MessageInfoPanel({
  roomId,
  message,
  isDirect,
  onClose,
}: {
  roomId: string;
  message: ChatMessage;
  isDirect: boolean;
  onClose: () => void;
}) {
  const info = useMessageInfo(roomId, message.seq);
  const data = info.data;
  const preview =
    message.body ||
    (message.attachments[0]?.kind === "audio"
      ? "Voice message"
      : message.attachments[0]?.kind === "image"
        ? "Photo"
        : message.attachments[0]?.kind === "video"
          ? "Video"
          : (message.attachments[0]?.name ?? ""));

  return (
    <aside
      aria-label="Message info"
      className="flex h-full min-h-0 w-full flex-col bg-(--chat-panel)"
    >
      <DrawerHeader title="Message info" onClose={onClose} />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="relative bg-(--chat-bg) px-6 py-8">
          <div className="chat-wallpaper" aria-hidden="true" />
          <div className="relative ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-none bg-(--chat-out) px-2.5 py-1.5 text-[0.92rem] text-(--text) shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]">
            <span className="line-clamp-6 whitespace-pre-wrap break-words">
              {preview}
            </span>
            <span className="mt-0.5 block text-right text-[0.68rem] text-(--muted)">
              {messageTime(message.createdAt)}
            </span>
          </div>
        </div>

        {info.isError ? (
          <p className="m-0 px-6 py-6 text-[0.88rem] text-(--muted)">
            {getApiError(info.error).message}
          </p>
        ) : !data ? (
          <p className="m-0 px-6 py-6 text-[0.88rem] text-(--muted)">
            Loading…
          </p>
        ) : (
          <>
            {data.receiptsHidden ? null : (
              <Section
                title="Read by"
                read
                people={data.readBy}
                empty={isDirect ? "Not read yet" : "Nobody yet"}
                single={isDirect}
              />
            )}
            {isDirect && data.readBy.length > 0 ? null : (
              <Section
                title={data.receiptsHidden ? "Delivered" : "Delivered to"}
                people={data.deliveredTo}
                empty={
                  data.readBy.length > 0 && !data.receiptsHidden
                    ? isDirect
                      ? "Read"
                      : "Everyone who received it has read it"
                    : "Not delivered yet"
                }
                single={isDirect}
              />
            )}
            {data.receiptsHidden ? (
              <p className="m-0 px-6 pb-4 text-[0.8rem] leading-snug text-(--muted)">
                Read receipts are turned off in this chat, so “read” isn’t
                shown.
              </p>
            ) : null}
            {data.waiting > 0 && !isDirect ? (
              <p className="m-0 px-6 py-4 text-[0.82rem] text-(--muted)">
                {data.waiting.toLocaleString()} more{" "}
                {data.waiting === 1 ? "member hasn’t" : "members haven’t"}{" "}
                received it yet.
              </p>
            ) : null}
          </>
        )}
      </div>
    </aside>
  );
}

function Section({
  title,
  people,
  empty,
  read = false,
  single,
}: {
  title: string;
  people: ChatPerson[];
  empty: string;
  read?: boolean;
  single: boolean;
}) {
  return (
    <section className="border-b-8 border-solid border-(--chat-bg) py-3">
      <h3 className="m-0 flex items-center gap-2 px-6 py-2 text-[0.86rem] font-semibold text-(--text)">
        <Checks
          size={18}
          weight="bold"
          className={read ? "text-(--chat-read)" : "text-(--muted)"}
          aria-hidden="true"
        />
        {title}
        {!single && people.length > 0 ? (
          <span className="font-normal text-(--muted)">{people.length}</span>
        ) : null}
      </h3>
      {people.length === 0 ? (
        <p className="m-0 px-6 pb-2 text-[0.84rem] text-(--muted)">{empty}</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {people.map((person) => (
            <li key={person.id} className="flex items-center gap-3 px-6 py-2">
              <ChatAvatar name={person.name} url={person.avatarUrl} size="md" />
              <span className="min-w-0 flex-1 truncate text-[0.92rem] text-(--text)">
                {person.name}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
