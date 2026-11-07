import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { ChatMessage } from "@veolms/contracts";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { StatusTicks } from "./ChatTicks";
import { messageTime, nameTone, ROLE_LABEL } from "./chatFormat";
import { MessageAttachments, type ViewableMedia } from "./MessageAttachments";
import { MessageMenu, type MessageAction } from "./MessageMenu";
import { MessageText } from "./MessageText";

export interface BubbleContext {
  viewerId: string | null;
  isGroup: boolean;
  isDirect: boolean;
  /** How far the others have read / received (null: not shown). */
  peerReadSeq: number | null;
  peerDeliveredSeq: number | null;
  canModerate: boolean;
  isHelper: boolean;
  starred: ReadonlySet<string>;
  myReactions: ReadonlyMap<string, string>;
}

const SWIPE_TO_REPLY_PX = 56;

/**
 * One message, WhatsApp-style: a bubble with a tail on the first of a run,
 * the sender's name (groups), reply quote, files, text, then time, "Edited"
 * and ticks in the corner. Hover shows the chevron menu; right-click and
 * long-press open it too; swipe right replies (touch).
 */
export function MessageBubble({
  message,
  ctx,
  firstOfRun,
  highlighted,
  onAction,
  onOpenMedia,
  onJumpTo,
}: {
  message: ChatMessage;
  ctx: BubbleContext;
  firstOfRun: boolean;
  highlighted: boolean;
  onAction: (action: MessageAction, message: ChatMessage) => void;
  onOpenMedia: (items: ViewableMedia[], index: number) => void;
  onJumpTo: (seq: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dragX, setDragX] = useState(0);
  const touch = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);
  const outgoing = message.sender?.id === ctx.viewerId;

  if (message.kind === "system") {
    return (
      <div className="my-1.5 flex justify-center px-4">
        <span className="rounded-lg bg-(--chat-in) px-3 py-1.5 text-center text-[0.78rem] text-(--text-secondary) shadow-sm">
          {message.body}
        </span>
      </div>
    );
  }

  const deleted = message.deleted !== null;
  const ticks =
    outgoing && !deleted ? <Ticks message={message} ctx={ctx} /> : null;
  const roleLabel = message.sender
    ? ROLE_LABEL[message.sender.role]
    : undefined;
  const mentionsMe = Boolean(
    ctx.viewerId && message.mentions.includes(ctx.viewerId),
  );
  const reactions = Object.entries(message.reactions).filter(
    ([, count]) => count > 0,
  );
  const onlyMedia =
    !deleted &&
    message.body === "" &&
    message.attachments.some((a) => a.kind === "image" || a.kind === "video");

  return (
    <div
      id={`chat-message-${message.seq}`}
      className={cn(
        "group/message relative flex px-[4%] transition-colors duration-700",
        outgoing ? "justify-end" : "justify-start",
        firstOfRun ? "mt-2" : "mt-0.5",
        reactions.length > 0 && "mb-3",
        highlighted && "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
      )}
      onContextMenu={(event) => {
        if (window.getSelection()?.toString()) return;
        event.preventDefault();
        // After the press ends, or the menu reads it as a press outside.
        setTimeout(() => setMenuOpen(true), 0);
      }}
      onTouchStart={(event) => {
        const t = event.touches[0]!;
        touch.current = {
          x: t.clientX,
          y: t.clientY,
          timer: setTimeout(() => setMenuOpen(true), 480),
        };
      }}
      onTouchMove={(event) => {
        const start = touch.current;
        const t = event.touches[0]!;
        if (!start) return;
        const dx = t.clientX - start.x;
        if (Math.abs(t.clientY - start.y) > 10 || Math.abs(dx) > 10) {
          if (start.timer) clearTimeout(start.timer);
          start.timer = null;
        }
        if (dx > 0 && Math.abs(t.clientY - start.y) < 24 && !deleted) {
          setDragX(Math.min(dx, SWIPE_TO_REPLY_PX + 16));
        }
      }}
      onTouchEnd={() => {
        if (touch.current?.timer) clearTimeout(touch.current.timer);
        touch.current = null;
        if (dragX >= SWIPE_TO_REPLY_PX) onAction("reply", message);
        setDragX(0);
      }}
    >
      {dragX > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-(--chat-in) text-(--muted)"
          style={{ opacity: dragX / SWIPE_TO_REPLY_PX }}
        >
          <ArrowBendUpLeft size={16} />
        </span>
      ) : null}
      <div
        className={cn(
          "relative max-w-[min(65%,560px)] min-w-24 rounded-lg px-2 pt-1.5 pb-1 text-(length:--chat-text,0.92rem) leading-[1.38] text-(--text) shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] max-[640px]:max-w-[85%]",
          outgoing ? "bg-(--chat-out)" : "bg-(--chat-in)",
          firstOfRun && (outgoing ? "rounded-tr-none" : "rounded-tl-none"),
          onlyMedia && "p-1",
          reactions.length > 0 && "pb-3.5",
        )}
        style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        {firstOfRun ? <Tail outgoing={outgoing} /> : null}

        {firstOfRun && ctx.isGroup && !outgoing && message.sender ? (
          <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5 text-[0.8rem] font-semibold">
            <span className={nameTone(message.sender.id)}>
              {message.sender.name}
            </span>
            {roleLabel ? (
              <span className="text-[0.7rem] font-medium text-(--muted)">
                {roleLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {message.replyTo && !deleted ? (
          <button
            type="button"
            onClick={() => onJumpTo(message.replyTo!.seq)}
            className="mb-1 block w-full cursor-pointer rounded-md border-0 border-l-4 border-solid border-(--accent) bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2 py-1 text-left"
          >
            <span className="block text-[0.76rem] font-semibold text-(--accent-ink)">
              {message.replyTo.senderName ?? "Message"}
            </span>
            <span className="line-clamp-2 block text-[0.8rem] text-(--text-secondary)">
              {message.replyTo.deleted
                ? "This message was deleted"
                : message.replyTo.preview || "Media"}
            </span>
          </button>
        ) : null}

        {deleted ? (
          <div className="flex items-center gap-1.5 pr-14 text-[0.88rem] text-(--muted) italic">
            <Prohibit size={15} aria-hidden="true" />
            {message.deleted!.by === "admin"
              ? `This message was deleted by admin${message.deleted!.byName ? ` ${message.deleted!.byName}` : ""}`
              : outgoing
                ? "You deleted this message"
                : "This message was deleted"}
          </div>
        ) : (
          <>
            {message.attachments.length > 0 ? (
              <MessageAttachments
                attachments={message.attachments}
                outgoing={outgoing}
                onOpenMedia={onOpenMedia}
              />
            ) : null}
            {message.body ? (
              <div className="px-0.5 whitespace-pre-wrap break-words">
                <MessageText text={message.body} mentionsMe={mentionsMe} />
                {/* Room for the time so the last line does not run under it. */}
                <span
                  aria-hidden="true"
                  className={cn("inline-block", outgoing ? "w-22" : "w-14")}
                />
              </div>
            ) : null}
          </>
        )}

        <Meta
          overlay={onlyMedia}
          edited={!deleted && message.editedAt !== null}
          pinned={message.pinned}
          starred={ctx.starred.has(message.id)}
          time={messageTime(message.createdAt)}
          ticks={ticks}
        />

        {!deleted ? (
          <div
            className={cn(
              "absolute top-0 right-0 opacity-0 transition-opacity group-hover/message:opacity-100 focus-within:opacity-100",
              menuOpen && "opacity-100",
            )}
          >
            <MessageMenu
              message={message}
              ctx={ctx}
              outgoing={outgoing}
              open={menuOpen}
              onOpenChange={setMenuOpen}
              onAction={(action) => onAction(action, message)}
              trigger={
                <span
                  className={cn(
                    // WhatsApp: the chevron sits on a soft fade of the bubble.
                    "inline-flex h-6 w-8 items-start justify-end rounded-tr-lg pt-1 pr-1 text-(--muted)",
                    outgoing
                      ? "bg-[radial-gradient(at_top_right,var(--chat-out)_55%,transparent_75%)]"
                      : "bg-[radial-gradient(at_top_right,var(--chat-in)_55%,transparent_75%)]",
                  )}
                >
                  <CaretDown size={14} weight="bold" />
                </span>
              }
            />
          </div>
        ) : null}

        {reactions.length > 0 ? (
          <button
            type="button"
            onClick={() => onAction("react-toggle", message)}
            className={cn(
              "absolute -bottom-3.5 flex cursor-pointer items-center gap-0.5 rounded-full border-2 border-solid border-(--chat-bg) bg-(--chat-in) px-1.5 py-px text-[0.78rem] text-(--text-secondary) shadow-sm",
              outgoing ? "right-2" : "left-2",
            )}
            aria-label={`Reactions: ${reactions.map(([e, c]) => `${e} ${c}`).join(", ")}`}
          >
            {reactions
              .sort((a, b) => b[1] - a[1])
              .slice(0, 3)
              .map(([emoji]) => (
                <span key={emoji}>{emoji}</span>
              ))}
            {reactions.reduce((sum, [, c]) => sum + c, 0) > 1 ? (
              <span className="ml-0.5 tabular-nums">
                {reactions.reduce((sum, [, c]) => sum + c, 0)}
              </span>
            ) : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

function Tail({ outgoing }: { outgoing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 13"
      className={cn(
        "absolute top-0 h-3.25 w-2",
        outgoing
          ? "-right-2 fill-(--chat-out)"
          : "-left-2 -scale-x-100 fill-(--chat-in)",
      )}
    >
      <path d="M0 0h8L1.5 9.5C1 10.3 0 10 0 9z" />
    </svg>
  );
}

function Meta({
  overlay,
  edited,
  pinned,
  starred,
  time,
  ticks,
}: {
  overlay: boolean;
  edited: boolean;
  pinned: boolean;
  starred: boolean;
  time: string;
  ticks: ReactNode;
}) {
  return (
    <span
      className={cn(
        "float-right -mt-3.5 ml-2 flex items-center gap-1 text-[0.68rem] leading-none tabular-nums",
        overlay
          ? "absolute right-2.5 bottom-2 mt-0 rounded-full bg-black/40 px-1.5 py-0.5 text-white"
          : "relative top-1 text-(--muted)",
      )}
    >
      {starred ? <Star size={11} weight="fill" aria-label="Starred" /> : null}
      {pinned ? <PushPin size={11} weight="fill" aria-label="Pinned" /> : null}
      {edited ? <span>Edited</span> : null}
      <span>{time}</span>
      {ticks}
    </span>
  );
}

/** Clock, ✓ sent, ✓✓ delivered, blue ✓✓ read (groups: by everyone). */
function Ticks({ message, ctx }: { message: ChatMessage; ctx: BubbleContext }) {
  return (
    <StatusTicks
      seq={message.seq}
      deliveredSeq={ctx.peerDeliveredSeq}
      readSeq={ctx.peerReadSeq}
    />
  );
}

export function FailedMark() {
  return (
    <WarningCircle
      size={15}
      weight="fill"
      className="text-red-500"
      aria-label="Not sent"
    />
  );
}
