import { AtIcon as At } from "@phosphor-icons/react/At";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { LockSimpleIcon as LockSimple } from "@phosphor-icons/react/LockSimple";
import type { ChatMessage } from "@veolms/contracts";
import {
  Fragment,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { LoadingSpinnerIcon } from "../components/LoadingSpinner";
import { cn } from "../lib/utils";
import type { ChatThread, OutgoingMessage } from "../services/chat";
import { dayLabel, sameDay } from "./chatFormat";
import { FailedMark, MessageBubble, type BubbleContext } from "./MessageBubble";
import type { MessageAction } from "./MessageMenu";
import type { ViewableMedia } from "./MessageAttachments";

const STICK_PX = 140;
/** How long a message opened from a link, reply or search blinks. */
const FLASH_MS = 2_600;

/** A message to bring into view (and blink), and the one it was opened from. */
export interface MessageFocus {
  seq: number;
  token: number;
  /** A reply's own message: the down arrow returns there first. */
  from?: number;
}

/** Puts a message in the middle of the list. */
function centre(box: HTMLElement, row: HTMLElement) {
  box.scrollTop = Math.max(
    0,
    row.offsetTop - box.clientHeight / 2 + row.offsetHeight / 2,
  );
}

/** WhatsApp's blink on a message just opened: restarts if already on. */
function flash(row: HTMLElement) {
  const bubble = row.querySelector<HTMLElement>("[data-bubble]") ?? row;
  bubble.classList.remove("chat-flash");
  void bubble.offsetWidth;
  bubble.classList.add("chat-flash");
  setTimeout(() => bubble.classList.remove("chat-flash"), FLASH_MS);
}
const RUN_GAP_MS = 5 * 60_000;

/** A message on its way, drawn as a bubble (clock tick, local previews). */
function asMessage(
  outgoing: OutgoingMessage,
  viewer: BubbleContext["viewerId"],
): ChatMessage {
  return {
    id: outgoing.clientId,
    roomId: outgoing.roomId,
    seq: 0,
    eventSeq: 0,
    kind: "text",
    sender: viewer
      ? { id: viewer, name: "You", avatarUrl: null, role: "learner" }
      : null,
    body: outgoing.body,
    replyTo: outgoing.replyTo ? { ...outgoing.replyTo, deleted: false } : null,
    mentions: outgoing.mentions,
    mentionAll: outgoing.mentionAll,
    reactions: {},
    attachments: outgoing.files.map((file) => ({
      id: file.localId,
      kind: file.kind,
      name: file.name,
      mimeType: file.mimeType,
      size: file.file.size,
      width: file.width ?? null,
      height: file.height ?? null,
      durationMs: file.durationMs ?? null,
      waveform: file.waveform ?? null,
      url: file.previewUrl ?? "blob:pending",
    })),
    pinned: false,
    createdAt: outgoing.createdAt,
    editedAt: null,
    deleted: null,
  };
}

export function MessageList({
  thread,
  outgoing,
  ctx,
  unreadAfterSeq,
  focus,
  loadingOlder,
  onLoadOlder,
  onAction,
  onOpenMedia,
  onJumpTo,
  onAtBottom,
  onRetry,
  onDiscard,
  typing = [],
}: {
  /** Who is typing now: a bubble of moving dots under the last message. */
  typing?: readonly string[];
  thread: ChatThread;
  outgoing: OutgoingMessage[];
  ctx: BubbleContext;
  /** Your read position when the chat opened: the "unread" divider goes after it. */
  unreadAfterSeq: number;
  /** Bring this message into view and blink it. */
  focus: MessageFocus | null;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onAction: (action: MessageAction, message: ChatMessage) => void;
  onOpenMedia: (items: ViewableMedia[], index: number) => void;
  onJumpTo: (seq: number, from?: number) => void;
  onAtBottom: (lastSeq: number) => void;
  onRetry: (clientId: string) => void;
  onDiscard: (clientId: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const firstSeqRef = useRef<number | null>(null);
  const heightBeforeRef = useRef(0);
  const initialisedRef = useRef(false);
  /**
   * Where the view is held while rows settle: rows render at a guessed
   * height (content-visibility) and photos load after the first paint, so
   * the list keeps growing for a moment. Until the reader scrolls, the view
   * stays at the bottom (or at the unread divider), as in WhatsApp.
   */
  const anchorRef = useRef<"bottom" | "divider" | { seq: number } | null>(
    "bottom",
  );
  /** Held somewhere other than the bottom until the reader scrolls. */
  const held = () =>
    anchorRef.current !== null && anchorRef.current !== "bottom";
  const contentRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  /** After following a reply to its quote: the message to come back to. */
  const [returnSeq, setReturnSeq] = useState<number | null>(null);
  /** @mentions of you already jumped to (or scrolled past) this visit. */
  const [seenMentions, setSeenMentions] = useState<ReadonlySet<number>>(
    () => new Set(),
  );
  const [newBelow, setNewBelow] = useState(0);
  const lastSeq = thread.messages.at(-1)?.seq ?? 0;
  const lastSeenSeqRef = useRef(lastSeq);
  const lastSeqRef = useRef(lastSeq);
  lastSeqRef.current = lastSeq;
  const onAtBottomRef = useRef(onAtBottom);
  onAtBottomRef.current = onAtBottom;

  /** The newest message is on screen (the list's bottom is in view). */
  function bottomInView(): boolean {
    const box = scrollRef.current;
    if (!box) return false;
    return box.scrollHeight - box.scrollTop - box.clientHeight < STICK_PX;
  }

  /**
   * Seen is what is on screen, as in WhatsApp: once the newest message is
   * in view, the chat is read (blue ticks for the sender), whether or not
   * the view is held at the unread divider. A chat too short to scroll
   * never gets a scroll event, so this is also checked after the first
   * paint, when rows settle and when the tab comes back into view.
   */
  function readIfInView() {
    if (lastSeqRef.current > 0 && bottomInView()) {
      onAtBottomRef.current(lastSeqRef.current);
    }
  }
  // Only messages already there when the chat opened count as unread:
  // one arriving while you watch is read.
  const openedAtSeqRef = useRef(lastSeq);
  if (openedAtSeqRef.current === 0 && lastSeq > 0)
    openedAtSeqRef.current = lastSeq;

  const pending = useMemo(() => {
    // Already in the chat (the live stream can bring it before the send
    // reply): drawn once, not twice for a moment.
    const arrived = new Set(
      thread.messages
        .map((m) => m.clientId)
        .filter((id): id is string => Boolean(id)),
    );
    return outgoing
      .filter((o) => !arrived.has(o.clientId))
      .map((o) => ({
        outgoing: o,
        message: asMessage(o, ctx.viewerId),
      }));
  }, [outgoing, ctx.viewerId, thread.messages]);
  const unreadCount = thread.messages.filter(
    (m) =>
      m.seq > unreadAfterSeq &&
      m.seq <= openedAtSeqRef.current &&
      m.sender?.id !== ctx.viewerId,
  ).length;

  // First paint: at the first unread message, else at the bottom.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || initialisedRef.current || thread.messages.length === 0) return;
    initialisedRef.current = true;
    const divider = box.querySelector<HTMLElement>("[data-unread-divider]");
    if (divider && unreadCount > 0) {
      anchorRef.current = "divider";
      atBottomRef.current = false;
      box.scrollTop = Math.max(0, divider.offsetTop - 80);
    } else {
      anchorRef.current = "bottom";
      box.scrollTop = box.scrollHeight;
    }
    readIfInView();
  }, [thread.messages.length, unreadCount]); // eslint-disable-line react-hooks/exhaustive-deps

  // Rows growing to their real height (and photos loading) keep the view
  // where it was put: at the bottom while the reader is there, or at the
  // unread divider until they scroll.
  useEffect(() => {
    const box = scrollRef.current;
    const content = contentRef.current;
    if (!box || !content || typeof ResizeObserver === "undefined") return;
    // A row switching between skipped and drawn (content-visibility) changes
    // the list by a fraction of a pixel; acting on that put the reader back
    // at the bottom on every frame of a swipe (the chat "shook", seen on an
    // Android phone at devicePixelRatio 3). Only a real change of 1px or
    // more counts; small steps that add up still do.
    let lastHeight = content.getBoundingClientRect().height;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry?.contentRect.height ?? lastHeight;
      if (Math.abs(height - lastHeight) < 1) return;
      lastHeight = height;
      if (!initialisedRef.current) return;
      const anchor = anchorRef.current;
      if (anchor === "divider") {
        const divider = box.querySelector<HTMLElement>("[data-unread-divider]");
        if (divider) box.scrollTop = Math.max(0, divider.offsetTop - 80);
      } else if (anchor && typeof anchor === "object") {
        const row = document.getElementById(`chat-message-${anchor.seq}`);
        if (row) centre(box, row);
      } else if (atBottomRef.current) {
        box.scrollTop = box.scrollHeight;
      }
      readIfInView();
    });
    observer.observe(content);
    // The reader taking over ends the hold at the divider or a message.
    const release = () => {
      if (anchorRef.current !== "bottom") anchorRef.current = null;
    };
    box.addEventListener("wheel", release, { passive: true });
    box.addEventListener("touchmove", release, { passive: true });
    box.addEventListener("keydown", release);
    box.addEventListener("pointerdown", release);
    const onShown = () => {
      if (document.visibilityState === "visible") readIfInView();
    };
    document.addEventListener("visibilitychange", onShown);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onShown);
      box.removeEventListener("wheel", release);
      box.removeEventListener("touchmove", release);
      box.removeEventListener("keydown", release);
      box.removeEventListener("pointerdown", release);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // A message asked for (notification, reply quote, search, pin, @): in the
  // middle of the list, blinking, held there while rows settle. Waits for
  // the message when it is still being fetched.
  const handledFocusRef = useRef(0);
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || !focus || handledFocusRef.current === focus.token) return;
    const row = document.getElementById(`chat-message-${focus.seq}`);
    if (!row) return;
    handledFocusRef.current = focus.token;
    initialisedRef.current = true;
    anchorRef.current = { seq: focus.seq };
    atBottomRef.current = false;
    centre(box, row);
    flash(row);
    setReturnSeq(focus.from ?? null);
    setSeenMentions((seen) =>
      seen.has(focus.seq) ? seen : new Set([...seen, focus.seq]),
    );
  }, [focus, thread.messages]);

  // Older history loaded above: keep the reader where they were.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    const first = thread.messages[0]?.seq ?? null;
    if (
      box &&
      firstSeqRef.current !== null &&
      first !== null &&
      first < firstSeqRef.current
    ) {
      box.scrollTop += box.scrollHeight - heightBeforeRef.current;
    }
    firstSeqRef.current = first;
    if (box) heightBeforeRef.current = box.scrollHeight;
  }, [thread.messages]);

  // New messages: follow them when already at the bottom, else count them.
  useLayoutEffect(() => {
    const box = scrollRef.current;
    if (!box || !initialisedRef.current) return;
    const mineJustSent = pending.length > 0;
    if (atBottomRef.current || mineJustSent) {
      box.scrollTop = box.scrollHeight;
      lastSeenSeqRef.current = lastSeq;
      setNewBelow(0);
    } else if (lastSeq > lastSeenSeqRef.current) {
      setNewBelow(
        thread.messages.filter(
          (m) =>
            m.seq > lastSeenSeqRef.current && m.sender?.id !== ctx.viewerId,
        ).length,
      );
    }
  }, [lastSeq, pending.length, thread.messages, ctx.viewerId]);

  useEffect(() => {
    if (lastSeq <= 0) return;
    if (atBottomRef.current) onAtBottom(lastSeq);
    else readIfInView();
  }, [lastSeq, onAtBottom]); // eslint-disable-line react-hooks/exhaustive-deps

  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
    const atBottom = distance < STICK_PX;
    // Held at the divider or a message, a scroll the page made (not the
    // reader) leaves the bottom flag alone.
    if (!held()) atBottomRef.current = atBottom;
    setShowJump(distance > 400);
    if (atBottom && !held()) {
      lastSeenSeqRef.current = lastSeq;
      setNewBelow(0);
      setReturnSeq(null);
      if (unreadMentions.length > 0) {
        setSeenMentions(new Set([...seenMentions, ...unreadMentions]));
      }
    }
    // Read once the newest message is in view, even while held.
    if (atBottom && lastSeq > 0) onAtBottom(lastSeq);
    // About two screens before the top: older messages are usually in
    // before the reader gets there, so scrolling up a long group never
    // stops at a spinner.
    if (
      box.scrollTop < box.clientHeight * 2 &&
      thread.hasMoreBefore &&
      !loadingOlder
    ) {
      heightBeforeRef.current = box.scrollHeight;
      onLoadOlder();
    }
  }

  // Telegram's @ button: unread messages that mention you, oldest first.
  const unreadMentions = ctx.viewerId
    ? thread.messages
        .filter(
          (m) =>
            m.seq > unreadAfterSeq &&
            m.deleted === null &&
            m.sender?.id !== ctx.viewerId &&
            (m.mentions.includes(ctx.viewerId!) || m.mentionAll) &&
            !seenMentions.has(m.seq),
        )
        .map((m) => m.seq)
    : [];

  function toBottom() {
    const box = scrollRef.current;
    if (!box) return;
    if (returnSeq !== null) {
      const row = document.getElementById(`chat-message-${returnSeq}`);
      setReturnSeq(null);
      if (row) {
        anchorRef.current = { seq: returnSeq };
        centre(box, row);
        flash(row);
        return;
      }
    }
    anchorRef.current = "bottom";
    atBottomRef.current = true;
    box.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
  }

  const rows = [...thread.messages, ...pending.map((p) => p.message)];
  // One block per day: a date label is sticky inside its own day only, so
  // the next day's label pushes it away instead of piling on top of it.
  const days: Array<{ key: string; label: string; start: number }> = [];
  rows.forEach((message, index) => {
    const previous = rows[index - 1];
    if (!previous || !sameDay(previous.createdAt, message.createdAt)) {
      days.push({
        key: message.seq > 0 ? `d${message.seq}` : `dp${message.id}`,
        label: dayLabel(message.createdAt),
        start: index,
      });
    }
  });

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        // Up and down only: nothing in a message may push the list sideways
        // (it drifted right while scrolling on phones).
        className="absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain py-3 [scrollbar-gutter:stable] [overscroll-behavior-x:none]"
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label="Messages"
      >
        {thread.hasMoreBefore ? (
          <div className="flex justify-center py-3">
            {loadingOlder ? <LoadingSpinnerIcon /> : null}
          </div>
        ) : (
          // WhatsApp's note at the top of a chat: amber text on a soft
          // panel, a lock, and room on both sides.
          <div className="chat-privacy-note mx-6 mt-1 mb-3 flex justify-center sm:mx-auto sm:max-w-md">
            <p className="m-0 rounded-lg px-3.5 py-2 text-center text-[0.75rem] leading-snug shadow-sm">
              {thread.oldestSeq && thread.oldestSeq > 1 ? (
                "Older messages are removed after the retention period."
              ) : (
                <>
                  <LockSimple
                    size={12}
                    weight="fill"
                    aria-hidden="true"
                    className="mr-1 inline-block -translate-y-px align-middle"
                  />
                  {ctx.isDirect
                    ? "Your messages are private. Only you and the other person in this chat can read them."
                    : "Messages are visible to everyone in this group. Be kind and keep it on topic."}
                </>
              )}
            </p>
          </div>
        )}
        <div ref={contentRef}>
          {days.map((day, dayIndex) => (
            <section key={day.key} aria-label={day.label}>
              <div className="sticky top-1 z-10 my-2 flex justify-center">
                <span className="rounded-lg bg-(--chat-in) px-3 py-1 text-[0.72rem] font-semibold tracking-wide text-(--text-secondary) uppercase shadow-sm">
                  {day.label}
                </span>
              </div>
              {rows
                .slice(day.start, days[dayIndex + 1]?.start ?? rows.length)
                .map((message, offset) => {
                  const index = day.start + offset;
                  const previous = rows[index - 1];
                  const newDay =
                    !previous ||
                    !sameDay(previous.createdAt, message.createdAt);
                  const firstOfRun =
                    newDay ||
                    !previous ||
                    previous.kind === "system" ||
                    previous.sender?.id !== message.sender?.id ||
                    new Date(message.createdAt).getTime() -
                      new Date(previous.createdAt).getTime() >
                      RUN_GAP_MS;
                  const showUnread =
                    unreadCount > 0 &&
                    message.seq > unreadAfterSeq &&
                    (previous?.seq ?? 0) <= unreadAfterSeq &&
                    message.sender?.id !== ctx.viewerId &&
                    message.seq > 0;
                  const pendingInfo =
                    message.seq === 0
                      ? pending.find((p) => p.message.id === message.id)
                          ?.outgoing
                      : undefined;
                  return (
                    <Fragment
                      key={
                        message.seq > 0 ? `m${message.seq}` : `p${message.id}`
                      }
                    >
                      {showUnread ? (
                        <div
                          data-unread-divider
                          className="my-2 flex justify-center bg-[color-mix(in_srgb,var(--chat-in)_70%,transparent)] py-1"
                        >
                          <span className="rounded-full bg-(--chat-in) px-3 py-1 text-[0.72rem] font-semibold tracking-wide text-(--accent-ink) uppercase shadow-sm">
                            {unreadCount} unread message
                            {unreadCount === 1 ? "" : "s"}
                          </span>
                        </div>
                      ) : null}
                      <MessageBubble
                        message={message}
                        ctx={ctx}
                        firstOfRun={firstOfRun}
                        onAction={onAction}
                        onOpenMedia={onOpenMedia}
                        onJumpTo={onJumpTo}
                      />
                      {pendingInfo ? (
                        <PendingStatus
                          outgoing={pendingInfo}
                          onRetry={() => onRetry(pendingInfo.clientId)}
                          onDiscard={() => onDiscard(pendingInfo.clientId)}
                        />
                      ) : null}
                    </Fragment>
                  );
                })}
            </section>
          ))}
          {typing.length > 0 ? (
            <div className="mt-2.5 flex px-[4%]" aria-live="polite">
              <div
                className="relative rounded-lg rounded-tl-none bg-(--chat-in) px-3 py-2.5 shadow-[0_1px_0.5px_rgb(0_0_0/0.13)]"
                role="status"
                aria-label={
                  ctx.isGroup
                    ? `${typing.slice(0, 2).join(", ")} typing`
                    : "Typing"
                }
              >
                <svg
                  aria-hidden="true"
                  viewBox="0 0 8 13"
                  className="absolute top-0 -left-2 h-3.25 w-2 -scale-x-100 fill-(--chat-in)"
                >
                  <path d="M0 0h8L1.5 9.5C1 10.3 0 10 0 9z" />
                </svg>
                {ctx.isGroup ? (
                  <span className="mb-1 block max-w-48 truncate text-[0.72rem] font-semibold text-(--accent-ink)">
                    {typing.length === 1
                      ? typing[0]
                      : `${typing.slice(0, 2).join(", ")}${typing.length > 2 ? " +" + (typing.length - 2) : ""}`}
                  </span>
                ) : null}
                <span className="chat-typing-dots" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>
      {unreadMentions.length > 0 ? (
        <button
          type="button"
          onClick={() => onJumpTo(unreadMentions[0]!)}
          aria-label={`${unreadMentions.length} unread mention${unreadMentions.length === 1 ? "" : "s"}, go to the first`}
          title="Go to your mention"
          className={cn(
            "absolute right-5 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-(--chat-in) text-(--accent-ink) shadow-[0_2px_8px_rgb(0_0_0/0.25)] hover:text-(--text)",
            showJump || newBelow > 0 || returnSeq !== null
              ? "bottom-[4.5rem]"
              : "bottom-4",
          )}
        >
          <At size={20} weight="bold" />
          <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-(--accent) px-1.5 text-[0.68rem] leading-5 font-bold text-(--on-accent)">
            {unreadMentions.length}
          </span>
        </button>
      ) : null}
      {showJump || newBelow > 0 || returnSeq !== null ? (
        <button
          type="button"
          onClick={toBottom}
          aria-label={
            returnSeq !== null
              ? "Back to the reply"
              : newBelow > 0
                ? `${newBelow} new messages, scroll to bottom`
                : "Scroll to bottom"
          }
          title={returnSeq !== null ? "Back to the reply" : undefined}
          className="absolute right-5 bottom-4 inline-flex size-11 cursor-pointer items-center justify-center rounded-full border-0 bg-(--chat-in) text-(--muted) shadow-[0_2px_8px_rgb(0_0_0/0.25)] hover:text-(--text)"
        >
          <CaretDown size={20} weight="bold" />
          {newBelow > 0 ? (
            <span className="absolute -top-1.5 -right-1 min-w-5 rounded-full bg-(--accent) px-1.5 text-[0.68rem] leading-5 font-bold text-(--on-accent)">
              {newBelow}
            </span>
          ) : null}
        </button>
      ) : null}
    </div>
  );
}

function PendingStatus({
  outgoing,
  onRetry,
  onDiscard,
}: {
  outgoing: OutgoingMessage;
  onRetry: () => void;
  onDiscard: () => void;
}) {
  const uploading = outgoing.files.filter((f) => f.progress < 1);
  if (outgoing.status === "failed") {
    return (
      <div className="flex items-center justify-end gap-2 px-[4%] pt-0.5 text-[0.75rem] text-red-500">
        <FailedMark />
        <span>{outgoing.error ?? "Not sent."}</span>
        <button
          type="button"
          onClick={onRetry}
          className="cursor-pointer border-0 bg-transparent font-semibold text-(--accent-ink) underline"
        >
          Retry
        </button>
        <button
          type="button"
          onClick={onDiscard}
          className="cursor-pointer border-0 bg-transparent text-(--muted) underline"
        >
          Discard
        </button>
      </div>
    );
  }
  if (uploading.length === 0) return null;
  const progress =
    uploading.reduce((sum, f) => sum + f.progress, 0) / uploading.length;
  return (
    <div
      className="flex justify-end px-[4%] pt-0.5 text-[0.72rem] text-(--muted)"
      aria-live="polite"
    >
      Uploading {Math.round(progress * 100)}%
    </div>
  );
}
