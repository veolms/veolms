import { AtIcon as At } from "@phosphor-icons/react/At";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { UserCircleIcon as UserCircle } from "@phosphor-icons/react/UserCircle";
import type { ChatPersonCardResponse } from "@veolms/contracts";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router";

import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useBackDismiss } from "../navigation/useBackDismiss";
import { getPublicProfilePath } from "../profiles/ProfileLink";
import {
  useBlockUser,
  useChatPersonCard,
  useStartDirect,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { roomAvatarUrl } from "./chatIcon";
import { ROLE_LABEL } from "./chatFormat";
import { CHAT_THEME } from "./chatTheme";

export interface CardPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  role?: string;
}

const WHY_NOT: Record<
  NonNullable<ChatPersonCardResponse["messageBlocked"]>,
  string
> = {
  self: "",
  deleted: "This account was deleted.",
  blocked:
    "You can’t message each other while one of you has blocked the other.",
  staffFirst: "Instructors and admins write first; you can reply once they do.",
  notAllowed: "Private chats with this person aren’t allowed here.",
};

const CARD_WIDTH = 304;

/**
 * WhatsApp's contact pop-up, with Telegram's extras: tapping a name, a
 * picture or an @mention shows who it is, with Message, Mention and View
 * profile, and the groups you share. Beside the name on a wide screen, a
 * sheet from the bottom on a phone. Esc, Back or a tap outside closes it.
 */
export function PersonCard({
  person,
  anchor,
  viewerId,
  onMention,
  onOpenChat,
  onClose,
  onToast,
}: {
  person: CardPerson;
  anchor: HTMLElement | null;
  viewerId: string | null;
  /** Put "@name" in the message being written (groups only). */
  onMention?: (person: CardPerson) => void;
  onOpenChat: (roomId: string) => void;
  onClose: () => void;
  onToast: (message: string) => void;
}) {
  const navigate = useNavigate();
  const card = useChatPersonCard(person.id);
  const startDirect = useStartDirect();
  const block = useBlockUser();
  const boxRef = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null,
  );
  const [sheet, setSheet] = useState(
    () => typeof window !== "undefined" && window.innerWidth < 640,
  );
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

  // Beside the name: right of it when there is room, else left; kept on screen.
  useLayoutEffect(() => {
    const narrow = window.innerWidth < 640;
    setSheet(narrow);
    if (narrow || !anchor || !boxRef.current) return;
    const at = anchor.getBoundingClientRect();
    const height = boxRef.current.offsetHeight;
    const edge = 8;
    let left = at.right + 8;
    if (left + CARD_WIDTH > window.innerWidth - edge)
      left = at.left - CARD_WIDTH - 8;
    if (left < edge)
      left = Math.min(at.left, window.innerWidth - CARD_WIDTH - edge);
    const top = Math.max(
      edge,
      Math.min(at.top - 12, window.innerHeight - height - edge),
    );
    setPlace({ left: Math.max(edge, left), top });
  }, [anchor, card.data]);

  const data = card.data;
  const shown = data?.person ?? person;
  const self = person.id === viewerId;
  const role = person.role ? ROLE_LABEL[person.role] : undefined;
  const profilePath = getPublicProfilePath(data?.person.username);
  const blockedReason = data?.messageBlocked ?? null;

  function message() {
    if (data?.directRoomId) {
      onClose();
      onOpenChat(data.directRoomId);
      return;
    }
    startDirect.mutate(person.id, {
      onSuccess: ({ room }) => {
        onClose();
        onOpenChat(room.id);
      },
      onError: (error) => onToast(getApiError(error).message),
    });
  }

  const action =
    "flex flex-1 cursor-pointer flex-col items-center gap-1 rounded-xl border border-solid border-(--chat-line) bg-transparent px-2 py-2.5 text-[0.78rem] font-medium text-(--accent-ink) hover:bg-(--chat-hover) disabled:cursor-not-allowed disabled:opacity-45";

  return createPortal(
    <div
      className={cn(
        CHAT_THEME,
        "fixed inset-0 z-250",
        sheet && "flex items-end bg-black/45",
      )}
      onClick={onClose}
    >
      <div
        ref={boxRef}
        role="dialog"
        aria-modal="true"
        aria-label={shown.name}
        onClick={(event) => event.stopPropagation()}
        style={
          sheet
            ? undefined
            : {
                width: CARD_WIDTH,
                left: place?.left ?? -9999,
                top: place?.top ?? 0,
              }
        }
        className={cn(
          "overflow-hidden bg-(--chat-panel) text-(--text) shadow-[0_18px_50px_rgb(0_0_0/0.45)]",
          sheet
            ? "max-h-[85vh] w-full overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
            : "fixed max-h-[80vh] overflow-y-auto rounded-2xl border border-solid border-(--chat-line)",
        )}
      >
        {sheet ? (
          <div
            className="mx-auto mt-2 h-1 w-10 rounded-full bg-(--chat-line-strong)"
            aria-hidden="true"
          />
        ) : null}
        <div className="flex flex-col items-center px-5 pt-5 pb-3 text-center">
          <ChatAvatar
            name={shown.name}
            url={shown.avatarUrl}
            size="xl"
            className="size-20 text-[1.6rem]"
          />
          <span className="mt-3 block max-w-full truncate text-[1.08rem] font-semibold">
            {self ? `${shown.name} (You)` : shown.name}
          </span>
          <span className="mt-0.5 flex items-center gap-1.5 text-[0.8rem] text-(--muted)">
            {data?.person.username ? (
              <span>@{data.person.username}</span>
            ) : null}
            {role ? (
              <span className="rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] px-2 py-px text-[0.7rem] font-semibold text-(--accent-ink)">
                {role}
              </span>
            ) : null}
          </span>
        </div>

        <div className="flex gap-2 px-4 pb-3">
          {!self ? (
            <button
              type="button"
              className={action}
              onClick={message}
              disabled={
                !data ||
                startDirect.isPending ||
                (blockedReason !== null && !data.directRoomId)
              }
              title={blockedReason ? WHY_NOT[blockedReason] : undefined}
            >
              <ChatCircleText size={20} aria-hidden="true" />
              Message
            </button>
          ) : null}
          {onMention && !self ? (
            <button
              type="button"
              className={action}
              onClick={() => {
                onClose();
                onMention(person);
              }}
            >
              <At size={20} aria-hidden="true" />
              Mention
            </button>
          ) : null}
          {profilePath ? (
            <button
              type="button"
              className={action}
              onClick={() => {
                onClose();
                navigate(profilePath);
              }}
            >
              <UserCircle size={20} aria-hidden="true" />
              Profile
            </button>
          ) : null}
        </div>

        {blockedReason && blockedReason !== "self" && !data?.directRoomId ? (
          <p className="m-0 px-5 pb-3 text-center text-[0.76rem] leading-snug text-(--muted)">
            {WHY_NOT[blockedReason]}
          </p>
        ) : null}

        {card.isLoading ? (
          <div className="space-y-2 px-5 pb-5" aria-hidden="true">
            <div className="h-3 w-32 animate-pulse rounded bg-(--chat-line)" />
            <div className="h-9 animate-pulse rounded-lg bg-(--chat-line)" />
          </div>
        ) : null}

        {data && data.commonGroups.length > 0 ? (
          <div className="border-t border-solid border-(--chat-line) pt-2 pb-2">
            <p className="m-0 px-5 pb-1 text-[0.76rem] font-medium text-(--muted)">
              {self
                ? "Your groups"
                : `${data.commonGroups.length} group${data.commonGroups.length === 1 ? "" : "s"} in common`}
            </p>
            <ul className="m-0 list-none p-0">
              {data.commonGroups.slice(0, 6).map((group) => (
                <li key={group.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenChat(group.id);
                    }}
                    className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-1.5 text-left text-(--text) hover:bg-(--chat-hover)"
                  >
                    <ChatAvatar
                      name={group.title}
                      url={roomAvatarUrl({
                        kind: "course",
                        peer: null,
                        iconUrl: group.iconUrl,
                      })}
                      group
                      size="sm"
                    />
                    <span className="min-w-0 flex-1 truncate text-[0.86rem]">
                      {group.title}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {data && !self && data.messageBlocked !== "deleted" ? (
          <div className="border-t border-solid border-(--chat-line)">
            <button
              type="button"
              disabled={block.isPending}
              onClick={() =>
                block.mutate(
                  { userId: person.id, blocked: !data.blockedByMe },
                  {
                    onSuccess: () =>
                      onToast(
                        data.blockedByMe
                          ? `${shown.name} unblocked`
                          : `${shown.name} blocked`,
                      ),
                    onError: (error) => onToast(getApiError(error).message),
                  },
                )
              }
              className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-5 py-3 text-left text-[0.86rem] text-red-500 hover:bg-(--chat-hover)"
            >
              <Prohibit size={18} aria-hidden="true" />
              {data.blockedByMe ? "Unblock" : "Block"} {shown.name}
            </button>
          </div>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}
