import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
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
import type { ChatThread, OutgoingMessage } from "../services/chat";
import { dayLabel, sameDay } from "./chatFormat";
import { FailedMark, MessageBubble, type BubbleContext } from "./MessageBubble";
import type { MessageAction } from "./MessageMenu";
import type { ViewableMedia } from "./MessageAttachments";

const STICK_PX = 140;
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
  highlightSeq,
  loadingOlder,
  onLoadOlder,
  onAction,
  onOpenMedia,
  onJumpTo,
  onAtBottom,
  onRetry,
  onDiscard,
}: {
  thread: ChatThread;
  outgoing: OutgoingMessage[];
  ctx: BubbleContext;
  /** Your read position when the chat opened: the "unread" divider goes after it. */
  unreadAfterSeq: number;
  highlightSeq: number | null;
  loadingOlder: boolean;
  onLoadOlder: () => void;
  onAction: (action: MessageAction, message: ChatMessage) => void;
  onOpenMedia: (items: ViewableMedia[], index: number) => void;
  onJumpTo: (seq: number) => void;
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
  const anchorRef = useRef<"bottom" | "divider" | null>("bottom");
  const contentRef = useRef<HTMLDivElement>(null);
  const [showJump, setShowJump] = useState(false);
  const [newBelow, setNewBelow] = useState(0);
  const lastSeq = thread.messages.at(-1)?.seq ?? 0;
  const lastSeenSeqRef = useRef(lastSeq);
  // Only messages already there when the chat opened count as unread:
  // one arriving while you watch is read.
  const openedAtSeqRef = useRef(lastSeq);
  if (openedAtSeqRef.current === 0 && lastSeq > 0)
    openedAtSeqRef.current = lastSeq;

  const pending = useMemo(
    () =>
      outgoing.map((o) => ({
        outgoing: o,
        message: asMessage(o, ctx.viewerId),
      })),
    [outgoing, ctx.viewerId],
  );
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
  }, [thread.messages.length, unreadCount]);

  // Rows growing to their real height (and photos loading) keep the view
  // where it was put: at the bottom while the reader is there, or at the
  // unread divider until they scroll.
  useEffect(() => {
    const box = scrollRef.current;
    const content = contentRef.current;
    if (!box || !content || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      if (!initialisedRef.current) return;
      if (anchorRef.current === "divider") {
        const divider = box.querySelector<HTMLElement>("[data-unread-divider]");
        if (divider) box.scrollTop = Math.max(0, divider.offsetTop - 80);
      } else if (atBottomRef.current) {
        box.scrollTop = box.scrollHeight;
      }
    });
    observer.observe(content);
    // The reader taking over ends the hold at the divider.
    const release = () => {
      if (anchorRef.current === "divider") anchorRef.current = null;
    };
    box.addEventListener("wheel", release, { passive: true });
    box.addEventListener("touchmove", release, { passive: true });
    box.addEventListener("keydown", release);
    box.addEventListener("pointerdown", release);
    return () => {
      observer.disconnect();
      box.removeEventListener("wheel", release);
      box.removeEventListener("touchmove", release);
      box.removeEventListener("keydown", release);
      box.removeEventListener("pointerdown", release);
    };
  }, []);

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
    if (atBottomRef.current && lastSeq > 0) onAtBottom(lastSeq);
  }, [lastSeq, onAtBottom]);

  function onScroll() {
    const box = scrollRef.current;
    if (!box) return;
    const distance = box.scrollHeight - box.scrollTop - box.clientHeight;
    const atBottom = distance < STICK_PX;
    // Held at the divider, a scroll the page made (not the reader) leaves
    // the bottom flag alone.
    if (anchorRef.current !== "divider") atBottomRef.current = atBottom;
    setShowJump(distance > 400);
    if (atBottom) {
      lastSeenSeqRef.current = lastSeq;
      setNewBelow(0);
      if (lastSeq > 0) onAtBottom(lastSeq);
    }
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
        className="absolute inset-0 overflow-y-auto overscroll-contain py-3 [scrollbar-gutter:stable]"
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
          <div className="mx-auto mb-3 max-w-md rounded-lg bg-(--chat-in) px-3 py-2 text-center text-[0.75rem] text-(--muted) shadow-sm">
            {thread.oldestSeq && thread.oldestSeq > 1
              ? "Older messages are removed after the retention period."
              : ctx.isDirect
                ? "Only the two of you can read this chat. Admins see a message only if one of you reports it."
                : "Messages are visible to everyone in this group. Be kind and keep it on topic."}
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
                        highlighted={
                          highlightSeq === message.seq && message.seq > 0
                        }
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
        </div>
      </div>
      {showJump || newBelow > 0 ? (
        <button
          type="button"
          onClick={() => {
            const box = scrollRef.current;
            box?.scrollTo({ top: box.scrollHeight, behavior: "smooth" });
          }}
          aria-label={
            newBelow > 0
              ? `${newBelow} new messages, scroll to bottom`
              : "Scroll to bottom"
          }
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
