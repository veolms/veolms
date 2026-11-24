import { ArrowBendUpLeftIcon as ArrowBendUpLeft } from "@phosphor-icons/react/ArrowBendUpLeft";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { InfoIcon as Info } from "@phosphor-icons/react/Info";
import { ShareFatIcon as ShareFat } from "@phosphor-icons/react/ShareFat";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { WarningCircleIcon as WarningCircle } from "@phosphor-icons/react/WarningCircle";
import type {
  AssistantCard as AssistantCardData,
  ChatMessage,
} from "@veolms/contracts";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router";

import { cn } from "../lib/utils";
import { ContextMenu, ContextMenuTrigger } from "../components/ui/context-menu";
import { ChatAvatar } from "./ChatAvatar";
import { StatusTicks } from "./ChatTicks";
import { teamBadge } from "../team/teamBadge";
import { messageTime, nameTone } from "./chatFormat";
import { MessageAttachments, type ViewableMedia } from "./MessageAttachments";
import {
  MessageContextMenu,
  MessageMenu,
  type MessageAction,
} from "./MessageMenu";
import { MessageText } from "./MessageText";
import { ReactionDetails } from "./ReactionDetails";
import { quoteTitle, ReplyQuoteBody } from "./ReplyQuote";
import { AssistantCard } from "./assistant/AssistantCard";
import { useSwipeToReply } from "./useSwipeToReply";

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
  /** In an assistant chat: status cards by the number of their message. */
  assistantCards?: ReadonlyMap<number, AssistantCardData>;
  /** A status card's Stop failed. */
  onAssistantError?: (message: string) => void;
  /** "More" in the selection bar: open this message's menu. */
  menuRequest?: { seq: number; token: number } | null;
  /** The message viewport: menus stay here, clear of the header and composer. */
  menuBoundary?: HTMLElement | null;
}

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
 * and ticks in the corner. Hover shows the chevron menu and right-click
 * opens it; a long press selects the message, as on WhatsApp's phone app
 * (the selection bar then has its actions); swipe right replies (touch).
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
  const navigate = useNavigate();
  // WhatsApp folds a very long message: the start, then "Read more".
  const [expanded, setExpanded] = useState(false);
  const collapsed =
    !expanded && message.body.length > LONG_MESSAGE_CHARS + FOLD_SLACK;
  const shownBody = collapsed
    ? message.body.slice(0, LONG_MESSAGE_CHARS).replace(/\s+\S*$/, "")
    : message.body;
  const bigEmoji = emojiOnlyCount(message.body);
  // An assistant's status card: drawn from the card's own data.
  const card = ctx.assistantCards?.get(message.seq) ?? null;
  const [menuMounted, setMenuMounted] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [menuOffset, setMenuOffset] = useState<{ x: number; y: number } | null>(
    null,
  );
  const menuTriggerRef = useRef<HTMLDivElement>(null);
  const openMenu = () => {
    setMenuMounted(true);
    setMenuOpen(true);
  };
  // "More" in the selection bar asks for this message's menu.
  const menuToken =
    ctx.menuRequest?.seq === message.seq ? ctx.menuRequest.token : 0;
  useEffect(() => {
    if (!menuToken) return;
    setMenuMounted(true);
    setMenuOpen(true);
  }, [menuToken]);
  const touch = useRef<{
    x: number;
    y: number;
    timer: ReturnType<typeof setTimeout> | null;
    /** Held long enough: the message is selected when the finger lifts. */
    long: boolean;
  } | null>(null);
  const outgoing = message.sender?.id === ctx.viewerId;
  // Swiping replies (any message) or shows your own message's info, as on
  // WhatsApp; not while choosing messages, nor on a deleted one.
  const swipeable =
    message.kind !== "system" && message.deleted === null && !ctx.selected;
  const swipe = useSwipeToReply({
    canReply: swipeable,
    canInfo: swipeable && outgoing && message.seq > 0,
  });

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
    ? teamBadge(message.sender.role, message.sender.title)
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
    // "This file was deleted" sits under the photos, where the time goes.
    !message.removedFiles?.length &&
    message.attachments.some((a) => a.kind === "image" || a.kind === "video");
  const selecting = Boolean(ctx.selected);
  const isSelected = Boolean(ctx.selected?.has(message.seq));
  const selectable = selecting && !deleted && message.seq > 0;
  // The pointer, expressed relative to the message, so the menu follows its
  // row if the chat scrolls while it is open.
  const menuTrigger = menuTriggerRef.current;
  const menuAnchor =
    menuOffset && menuTrigger
      ? {
          getBoundingClientRect: () => {
            const rect = menuTrigger.getBoundingClientRect();
            return DOMRect.fromRect({
              x: rect.left + menuOffset.x,
              y: rect.top + menuOffset.y,
              width: 0,
              height: 0,
            });
          },
          contextElement: menuTrigger,
        }
      : undefined;

  return (
    <ContextMenu
      disabled={deleted}
      open={contextMenuOpen}
      onOpenChange={(nextOpen, details) => {
        if (nextOpen) {
          const event = details.event;
          // Base UI also opens on long press; here a long press selects the
          // message, and selected text keeps its own browser menu.
          const touchOpen =
            "touches" in event ||
            ("pointerType" in event &&
              (event as PointerEvent).pointerType === "touch");
          if (touchOpen || window.getSelection()?.toString()) {
            details.cancel();
            return;
          }
          const eventRect = menuTriggerRef.current?.getBoundingClientRect();
          const point = details.event as MouseEvent;
          setMenuOffset(
            eventRect && "clientX" in point && "clientY" in point
              ? {
                  x: point.clientX - eventRect.left,
                  y: point.clientY - eventRect.top,
                }
              : { x: eventRect?.width ?? 0, y: eventRect?.height ?? 0 },
          );
        }
        setContextMenuOpen(nextOpen);
      }}
    >
      <ContextMenuTrigger
        render={
          <div
            ref={menuTriggerRef}
            id={`chat-message-${message.seq}`}
            className={cn(
              "group/message relative flex px-[4%] transition-colors duration-700",
              // Off-screen messages skip layout and paint (sizes are remembered),
              // so a chat with thousands of messages scrolls as lightly as a short one.
              "[contain-intrinsic-size:auto_56px] [content-visibility:auto]",
              // A long press selects the message (WhatsApp), not the phone's own
              // text selection and callout; Copy is in the selection bar.
              "[-webkit-touch-callout:none] [@media(hover:none)]:select-none",
              // A sideways drag is the swipe to reply, never a sideways scroll;
              // up and down (and a pinch) stay the browser's.
              "touch-pan-y touch-pinch-zoom",
              outgoing ? "justify-end" : "justify-start",
              // Even gaps: 4px within one person's run, 10px between people.
              // Padding, not margin: a selected or highlighted row is tinted
              // edge to edge with no gaps between rows (WhatsApp).
              firstOfRun ? "pt-2.5" : "pt-1",
              reactions.length > 0 && "pb-3.5",
              selecting &&
                isSelected &&
                "bg-[color-mix(in_srgb,var(--accent)_20%,transparent)]",
            )}
            onContextMenu={(event) => {
              if (window.getSelection()?.toString()) event.preventDefault();
            }}
            onTouchStart={(event) => {
              const t = event.touches[0]!;
              // A second finger (a pinch): neither a long press nor a swipe.
              if (event.touches.length > 1) {
                if (touch.current?.timer) clearTimeout(touch.current.timer);
                touch.current = null;
                swipe.end(true);
                return;
              }
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
              swipe.begin(t, event.target);
            }}
            onTouchMove={(event) => {
              const start = touch.current;
              const t = event.touches[0]!;
              if (!start) return;
              if (
                Math.abs(t.clientY - start.y) > 10 ||
                Math.abs(t.clientX - start.x) > 10
              ) {
                if (start.timer) clearTimeout(start.timer);
                start.timer = null;
                start.long = false;
              }
              swipe.move(t);
            }}
            onTouchEnd={(event) => {
              const start = touch.current;
              if (start?.timer) clearTimeout(start.timer);
              touch.current = null;
              const swiped = swipe.end();
              if (swiped) onAction(swiped, message);
              else if (start?.long && !deleted && message.seq > 0) {
                // WhatsApp: a long press selects the message (or adds it to the
                // selection). No click follows the lift, so the row's selection
                // button under the finger does not toggle it straight back.
                event.preventDefault();
                if (!ctx.selected?.has(message.seq))
                  ctx.onToggleSelect?.(message.seq);
              }
            }}
            onTouchCancel={() => {
              if (touch.current?.timer) clearTimeout(touch.current.timer);
              touch.current = null;
              swipe.end(true);
            }}
          />
        }
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
        {swipe.icon ? (
          // In the gap the swiped bubble leaves (moved by useSwipeToReply).
          <span
            ref={swipe.iconRef}
            aria-hidden="true"
            className="pointer-events-none absolute flex size-8 items-center justify-center rounded-full bg-(--chat-panel) text-(--text-secondary) opacity-0 shadow-[0_1px_2px_rgb(0_0_0/0.18)]"
            style={{ left: swipe.icon.left, top: swipe.icon.top }}
          >
            {swipe.icon.action === "reply" ? (
              <ArrowBendUpLeft size={17} weight="bold" />
            ) : (
              <Info size={17} weight="bold" />
            )}
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
          ref={swipe.bubbleRef}
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
              onClick={() =>
                message.replyTo!.roomId
                  ? // "Reply privately": the quote is in the group (opened at
                    // it, as "Copy link" does).
                    void navigate(
                      `/chat/${message.replyTo!.roomId}?seq=${message.replyTo!.seq}`,
                    )
                  : onJumpTo(message.replyTo!.seq, message.seq)
              }
              className="mb-1 block w-full cursor-pointer overflow-hidden rounded-md border-0 border-l-4 border-solid border-(--accent) bg-[color-mix(in_srgb,var(--text)_7%,transparent)] px-2 py-1 text-left"
            >
              <ReplyQuoteBody
                title={quoteTitle(
                  message.replyTo.senderName ?? "Message",
                  message.replyTo.roomName,
                )}
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
              {message.removedFiles?.length ? (
                // WhatsApp: the message stays; its file is gone for everyone
                // (the sender deleted it to free their storage).
                <div className="px-0.5 text-[0.88rem] break-words text-(--muted) italic">
                  <Prohibit
                    size={15}
                    aria-hidden="true"
                    className="mr-1.5 inline-block align-[-0.15em]"
                  />
                  {message.removedFiles.length === 1
                    ? "This file was deleted"
                    : `${message.removedFiles.length} files were deleted`}
                  {/* The last line: room for the time and ticks, exactly as
                    wide as they are (as text has), so they never run into
                    the words on a narrow phone. */}
                  {!message.body && !card ? (
                    <Meta
                      spacer
                      overlay={false}
                      edited={message.editedAt !== null}
                      pinned={message.pinned}
                      starred={ctx.starred.has(message.id)}
                      time={messageTime(message.createdAt)}
                      ticks={ticks}
                    />
                  ) : null}
                </div>
              ) : null}
              {card ? (
                <div className="px-0.5">
                  <AssistantCard
                    card={card}
                    onError={ctx.onAssistantError ?? (() => {})}
                  />
                  <Meta
                    spacer
                    overlay={false}
                    edited={false}
                    pinned={message.pinned}
                    starred={ctx.starred.has(message.id)}
                    time={messageTime(message.createdAt)}
                    ticks={ticks}
                  />
                </div>
              ) : message.body ? (
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
            // A status card changes as the work goes on: not an "edit".
            edited={!deleted && !card && message.editedAt !== null}
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
      </ContextMenuTrigger>
      {!deleted ? (
        <MessageContextMenu
          message={message}
          ctx={ctx}
          outgoing={outgoing}
          anchor={menuAnchor}
          boundary={ctx.menuBoundary}
          onAction={(action) => onAction(action, message)}
        />
      ) : null}
    </ContextMenu>
  );
}

function Tail({ outgoing }: { outgoing: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 8 13"
      className={cn(
        // chat-tail: the blink on a message opened from a link reaches the
        // tail too (chat.css), not only the bubble.
        "chat-tail absolute top-0 h-3.25 w-2",
        outgoing
          ? "-right-2 fill-(--chat-out) [--tail-fill:var(--chat-out)]"
          : "-left-2 -scale-x-100 fill-(--chat-in) [--tail-fill:var(--chat-in)]",
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
