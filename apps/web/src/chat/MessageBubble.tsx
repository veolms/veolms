import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type { ChatMessage } from "@veolms/contracts";
import { useRef, useState, type ReactNode } from "react";

import { cn } from "../lib/utils";
import { ChatAvatar } from "./ChatAvatar";
import { StatusTicks } from "./ChatTicks";
import { messageTime, nameTone, ROLE_LABEL } from "./chatFormat";
import { MessageAttachments, type ViewableMedia } from "./MessageAttachments";
import { MessageMenu, type MessageAction } from "./MessageMenu";
import { MessageText } from "./MessageText";
import { ReactionDetails } from "./ReactionDetails";
import { ReplyQuoteBody } from "./ReplyQuote";

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
  /** Choosing messages (Forward several): a tap ticks instead. */
  selected?: ReadonlySet<number> | null;
  onToggleSelect?: (seq: number) => void;
  /** A name, picture or @mention was clicked: show that person's card. */
  onOpenPerson?: (
    person: { id: string; name: string; avatarUrl: string | null },
    anchor: HTMLElement,
  ) => void;
  /** Who an @name in a message is (from the people the chat knows). */
  resolveMention?: (
    name: string,
    mentionIds: readonly string[],
  ) => { id: string; name: string; avatarUrl: string | null } | null;
}

const SWIPE_TO_REPLY_PX = 56;
/** Longer messages show this much, then "Read more". */
const LONG_MESSAGE_CHARS = 700;
/** Not folded for only a few more characters. */
const FOLD_SLACK = 200;

const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*\s*){1,3}$/u;

/** How many emoji a message of only emoji has (1-3), else 0. */
function emojiOnlyCount(body: string): number {
  const text = body.trim();
  if (!text || text.length > 40 || !EMOJI_ONLY.test(text)) return 0;
  return [
    ...text.matchAll(
      /\p{Extended_Pictographic}(?:\p{Emoji_Modifier}|\uFE0F|\u200D\p{Extended_Pictographic})*/gu,
    ),
  ].length;
}

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
  onAction,
  onOpenMedia,
  onJumpTo,
}: {
  message: ChatMessage;
  ctx: BubbleContext;
  firstOfRun: boolean;
  onAction: (action: MessageAction, message: ChatMessage) => void;
  onOpenMedia: (items: ViewableMedia[], index: number) => void;
  onJumpTo: (seq: number, from?: number) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  // WhatsApp folds a very long message: the start, then "Read more".
  const [expanded, setExpanded] = useState(false);
  const collapsed =
    !expanded && message.body.length > LONG_MESSAGE_CHARS + FOLD_SLACK;
  const shownBody = collapsed
    ? message.body.slice(0, LONG_MESSAGE_CHARS).replace(/\s+\S*$/, "")
    : message.body;
  const bigEmoji = emojiOnlyCount(message.body);
  const [menuMounted, setMenuMounted] = useState(false);
  const openMenu = () => {
    setMenuMounted(true);
    setMenuOpen(true);
  };
  const [dragX, setDragX] = useState(0);
  const touch = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
    /** Held long enough: the menu opens when the finger lifts. */
    long: boolean;
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
  const chevron = (
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
  );
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
  const hasMedia =
    !deleted &&
    message.attachments.some((a) => a.kind === "image" || a.kind === "video");
  const onlyMedia =
    !deleted &&
    message.body === "" &&
    message.attachments.some((a) => a.kind === "image" || a.kind === "video");
  const selecting = Boolean(ctx.selected);
  const isSelected = Boolean(ctx.selected?.has(message.seq));
  const selectable = selecting && !deleted && message.seq > 0;

  return (
    <div
      id={`chat-message-${message.seq}`}
      className={cn(
        "group/message relative flex px-[4%] transition-colors duration-700",
        // Off-screen messages skip layout and paint (sizes are remembered),
        // so a chat with thousands of messages scrolls as lightly as a short one.
        "[contain-intrinsic-size:auto_56px] [content-visibility:auto]",
        // A long press opens the menu (WhatsApp), not the phone's own text
        // selection and callout; Copy is in the menu.
        "[-webkit-touch-callout:none] [@media(hover:none)]:select-none",
        outgoing ? "justify-end" : "justify-start",
        // Even gaps: 4px within one person's run, 10px between people.
        firstOfRun ? "mt-2.5" : "mt-1",
        reactions.length > 0 && "pb-3.5",
        selecting &&
          isSelected &&
          "bg-[color-mix(in_srgb,var(--accent)_14%,transparent)]",
      )}
      onContextMenu={(event) => {
        if (window.getSelection()?.toString()) return;
        event.preventDefault();
        // A finger still down: the long press opens it when it lifts.
        if (touch.current) return;
        // After the press ends, or the menu reads it as a press outside.
        setTimeout(openMenu, 0);
      }}
      onTouchStart={(event) => {
        const t = event.touches[0]!;
        const start = {
          x: t.clientX,
          y: t.clientY,
          timer: null as ReturnType<typeof setTimeout> | null,
          long: false,
        };
        start.timer = setTimeout(() => {
          start.long = true;
          navigator.vibrate?.(12);
        }, 450);
        touch.current = start;
      }}
      onTouchMove={(event) => {
        const start = touch.current;
        const t = event.touches[0]!;
        if (!start) return;
        const dx = t.clientX - start.x;
        if (Math.abs(t.clientY - start.y) > 10 || Math.abs(dx) > 10) {
          if (start.timer) clearTimeout(start.timer);
          start.timer = null;
          start.long = false;
        }
        if (dx > 0 && Math.abs(t.clientY - start.y) < 24 && !deleted) {
          setDragX(Math.min(dx, SWIPE_TO_REPLY_PX + 16));
        }
      }}
      onTouchEnd={(event) => {
        const start = touch.current;
        if (start?.timer) clearTimeout(start.timer);
        touch.current = null;
        if (dragX >= SWIPE_TO_REPLY_PX) onAction("reply", message);
        else if (start?.long && !deleted) {
          // Opened after the lift, so the lift is not a press outside it.
          event.preventDefault();
          setTimeout(openMenu, 0);
        }
        setDragX(0);
      }}
    >
      {selecting ? (
        <>
          <span
            aria-hidden="true"
            className={cn(
              "absolute top-1/2 left-2 z-20 flex size-5 -translate-y-1/2 items-center justify-center rounded-full border-2 border-solid",
              !selectable && "opacity-0",
              isSelected
                ? "border-(--accent) bg-(--accent) text-(--on-accent)"
                : "border-(--chat-line-strong) bg-(--chat-panel)",
            )}
          >
            {isSelected ? <Check size={11} weight="bold" /> : null}
          </span>
          {selectable ? (
            <button
              type="button"
              role="checkbox"
              aria-checked={isSelected}
              aria-label={`Select message: ${message.body.slice(0, 60) || "media"}`}
              onClick={() => ctx.onToggleSelect?.(message.seq)}
              className="absolute inset-0 z-10 cursor-pointer border-0 bg-transparent"
            />
          ) : null}
        </>
      ) : null}
      {dragX > 0 ? (
        <span
          aria-hidden="true"
          className="absolute top-1/2 left-2 flex size-8 -translate-y-1/2 items-center justify-center rounded-full bg-(--chat-in) text-(--muted)"
          style={{ opacity: dragX / SWIPE_TO_REPLY_PX }}
        >
          <ArrowBendUpLeft size={16} />
        </span>
      ) : null}
      {ctx.isGroup && !outgoing ? (
        // Groups: the sender's picture beside the first of their run
        // (WhatsApp, Telegram); tapping it shows their card.
        <span className="mr-1.5 w-8 shrink-0">
          {firstOfRun && message.sender ? (
            <button
              type="button"
              aria-label={`${message.sender.name}’s profile`}
              onClick={(event) =>
                ctx.onOpenPerson?.(message.sender!, event.currentTarget)
              }
              className="cursor-pointer rounded-full border-0 bg-transparent p-0"
            >
              <ChatAvatar
                name={message.sender.name}
                url={message.sender.avatarUrl}
                size="sm"
              />
            </button>
          ) : null}
        </span>
      ) : null}
      <div
        className={cn(
          "relative max-w-[min(65%,560px)] min-w-24 rounded-lg px-2 pt-1.5 pb-1 text-(length:--chat-text,0.92rem) leading-[1.38] text-(--text) shadow-[0_1px_0.5px_rgb(0_0_0/0.13)] max-[640px]:max-w-[85%]",
          outgoing ? "bg-(--chat-out)" : "bg-(--chat-in)",
          firstOfRun && (outgoing ? "rounded-tr-none" : "rounded-tl-none"),
          onlyMedia && "p-1",
          // A photo or video with a caption: the caption wraps at the
          // photo's width instead of widening the bubble (WhatsApp).
          hasMedia && !onlyMedia && "w-min max-w-[min(19rem,85vw)] min-w-0",
          reactions.length > 0 && "pb-3.5",
        )}
        data-bubble
        style={dragX ? { transform: `translateX(${dragX}px)` } : undefined}
      >
        {firstOfRun ? <Tail outgoing={outgoing} /> : null}

        {firstOfRun && ctx.isGroup && !outgoing && message.sender ? (
          <div className="mb-0.5 flex items-baseline gap-1.5 px-0.5 text-[0.8rem] font-semibold">
            {ctx.onOpenPerson ? (
              <button
                type="button"
                onClick={(event) =>
                  ctx.onOpenPerson!(message.sender!, event.currentTarget)
                }
                className={cn(
                  "cursor-pointer border-0 bg-transparent p-0 text-left font-semibold hover:underline",
                  nameTone(message.sender.id),
                )}
              >
                {message.sender.name}
              </button>
            ) : (
              <span className={nameTone(message.sender.id)}>
                {message.sender.name}
              </span>
            )}
            {roleLabel ? (
              <span className="text-[0.7rem] font-medium text-(--muted)">
                {roleLabel}
              </span>
            ) : null}
          </div>
        ) : null}

        {message.forwarded && !deleted ? (
          // WhatsApp: a small "Forwarded" over the message.
          <div className="mb-0.5 flex items-center gap-1 px-0.5 text-[0.74rem] text-(--muted) italic">
            <ShareFat size={12} aria-hidden="true" />
            Forwarded
          </div>
        ) : null}

        {message.replyTo && !deleted ? (
          <button
            type="button"
            onClick={() => onJumpTo(message.replyTo!.seq, message.seq)}
            className="mb-1 block w-full cursor-pointer overflow-hidden rounded-md border-0 border-l-4 border-solid border-(--accent) bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2 py-1 text-left"
          >
            <ReplyQuoteBody
              title={message.replyTo.senderName ?? "Message"}
              text={message.replyTo.preview}
              media={message.replyTo.media}
              deleted={message.replyTo.deleted}
            />
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
              <div
                className={cn(
                  "px-0.5 whitespace-pre-wrap break-words",
                  // WhatsApp: a message of only 1-3 emoji is shown large.
                  bigEmoji === 1 && "text-[2.6rem] leading-[1.15]",
                  bigEmoji > 1 && "text-[2rem] leading-[1.2]",
                )}
              >
                <MessageText
                  text={shownBody}
                  mentionsMe={mentionsMe}
                  onMention={
                    ctx.onOpenPerson && ctx.resolveMention
                      ? (name, anchor) => {
                          const person = ctx.resolveMention!(
                            name,
                            message.mentions,
                          );
                          if (person) ctx.onOpenPerson!(person, anchor);
                        }
                      : undefined
                  }
                />
                {collapsed ? (
                  <>
                    {"… "}
                    <button
                      type="button"
                      onClick={() => setExpanded(true)}
                      className="cursor-pointer border-0 bg-transparent p-0 text-[0.88em] font-semibold text-(--accent-ink) hover:underline"
                    >
                      Read more
                    </button>
                  </>
                ) : null}
                {/* Room for "Edited", the time and ticks, exactly as wide as
                    they are, so the last line never runs under them. */}
                <Meta
                  spacer
                  overlay={false}
                  edited={message.editedAt !== null}
                  pinned={message.pinned}
                  starred={ctx.starred.has(message.id)}
                  time={messageTime(message.createdAt)}
                  ticks={ticks}
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
            {menuMounted ? (
              <MessageMenu
                message={message}
                ctx={ctx}
                outgoing={outgoing}
                open={menuOpen}
                onOpenChange={setMenuOpen}
                onAction={(action) => onAction(action, message)}
                trigger={chevron}
              />
            ) : (
              // The menu itself mounts on first use: a chat of hundreds of
              // messages then draws without hundreds of menus.
              <button
                type="button"
                aria-label="Message options"
                aria-haspopup="menu"
                onClick={openMenu}
                className="cursor-pointer border-0 bg-transparent p-0"
              >
                {chevron}
              </button>
            )}
          </div>
        ) : null}

        {reactions.length > 0 ? (
          <ReactionDetails
            message={message}
            reactions={reactions}
            viewerId={ctx.viewerId}
            outgoing={outgoing}
            onAction={onAction}
          />
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
  spacer = false,
}: {
  overlay: boolean;
  edited: boolean;
  pinned: boolean;
  starred: boolean;
  time: string;
  ticks: ReactNode;
  /** An invisible copy at the end of the text that keeps its room free. */
  spacer?: boolean;
}) {
  if (spacer) {
    return (
      <span
        aria-hidden="true"
        className="invisible ml-2 inline-flex items-center gap-1 align-baseline text-[0.68rem] leading-none tabular-nums select-none"
      >
        {starred ? <Star size={11} /> : null}
        {pinned ? <PushPin size={11} /> : null}
        {edited ? <span>Edited</span> : null}
        <span>{time}</span>
        {ticks}
      </span>
    );
  }
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
