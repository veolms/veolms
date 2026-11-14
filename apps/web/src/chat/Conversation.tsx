import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { CheckIcon as Check } from "@phosphor-icons/react/Check";
import { FilePlusIcon as FilePlus } from "@phosphor-icons/react/FilePlus";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatMessage, ChatRoomDetail } from "@veolms/contracts";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import {
  applyMessages,
  chatService,
  discardMessage,
  markRoomRead,
  queueReceipt,
  retryMessage,
  setChatOnScreen,
  useAnswerRequest,
  useBlockUser,
  useChatThread,
  useDeleteMessage,
  useLeaveChat,
  useOutgoingMessages,
  usePinMessage,
  useReactToMessage,
  useReportMessage,
  useRestoreMessage,
  useRestrictMember,
  useStarMessage,
  useStarredMessages,
  useStartDirect,
  useTypingNames,
  useClearChat,
  useUpdateMyChatState,
  isRoomMuted,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { copyImage } from "./copyImage";
import { roomAvatarUrl } from "./chatIcon";
import {
  ClearChatDialog,
  DeleteMessageDialog,
  MuteChatDialog,
  ReportDialog,
  RestrictDialog,
} from "./ChatDialogs";
import { chatIconButton } from "./ChatControls";
import { lastSeenLabel, ROLE_LABEL } from "./chatFormat";
import { Composer, type ComposerHandle } from "./Composer";
import { EmojiPanel } from "./EmojiPanel";
import { MediaViewer } from "./MediaViewer";
import type { ViewableMedia } from "./MessageAttachments";
import type { BubbleContext } from "./MessageBubble";
import { MessageList, type MessageFocus } from "./MessageList";
import { PersonCard, type CardPerson } from "./PersonCard";
import { ForwardDialog } from "./ForwardDialog";
import { SelectionBar } from "./SelectionBar";
import type { MessageAction } from "./MessageMenu";
import { ChatThreadSkeleton } from "./ChatSkeletons";

/** Your own reactions, remembered for this tab (the server keeps counts). */
const myReactions = new Map<string, string>();

type DialogState =
  | { kind: "delete"; message: ChatMessage }
  | { kind: "report"; message: ChatMessage }
  | { kind: "restrict"; message: ChatMessage; mode: "mute" | "ban" }
  | { kind: "react"; message: ChatMessage }
  | { kind: "clear-chat"; mode: "clear" | "delete" }
  | { kind: "mute" }
  | null;

export function Conversation({
  room,
  viewerId,
  onBack,
  onOpenInfo,
  onOpenMessageInfo,
  onOpenSearch,
  jumpRequest,
  onOpenChat,
  onToast,
  focusComposerToken,
}: {
  room: ChatRoomDetail;
  viewerId: string | null;
  onBack: () => void;
  onOpenInfo: () => void;
  onOpenMessageInfo: (message: ChatMessage) => void;
  onOpenSearch: () => void;
  jumpRequest: { seq: number; token: number } | null;
  onOpenChat: (roomId: string) => void;
  onToast: (message: string) => void;
  focusComposerToken: number;
}) {
  const client = useQueryClient();
  const thread = useChatThread(room.id);
  const outgoing = useOutgoingMessages(room.id);
  const typing = useTypingNames(room.id);
  const stars = useStarredMessages(true);
  const composerRef = useRef<ComposerHandle>(null);
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [editing, setEditing] = useState<ChatMessage | null>(null);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [viewer, setViewer] = useState<{
    items: ViewableMedia[];
    index: number;
  } | null>(null);
  const [focus, setFocus] = useState<MessageFocus | null>(null);
  /** Messages ticked for Forward (WhatsApp's Select); null when not choosing. */
  const [selected, setSelected] = useState<ReadonlySet<number> | null>(null);
  const [forwarding, setForwarding] = useState<number[] | null>(null);
  const [person, setPerson] = useState<{
    person: CardPerson;
    anchor: HTMLElement | null;
  } | null>(null);
  const [pinnedIndex, setPinnedIndex] = useState(0);
  const [dragging, setDragging] = useState(false);
  // A drag that ends elsewhere (dropped outside, Esc, left the window)
  // takes the drop area away.
  useEffect(() => {
    if (!dragging) return;
    const end = () => setDragging(false);
    const leftWindow = (event: DragEvent) => {
      if (!event.relatedTarget) setDragging(false);
    };
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    document.addEventListener("dragleave", leftWindow);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
      document.removeEventListener("dragleave", leftWindow);
    };
  }, [dragging]);
  const [, forceRender] = useState(0);
  const unreadAfterRef = useRef<{ roomId: string; seq: number }>({
    roomId: room.id,
    seq: room.me.lastReadSeq,
  });
  if (unreadAfterRef.current.roomId !== room.id) {
    unreadAfterRef.current = { roomId: room.id, seq: room.me.lastReadSeq };
  }

  const deleteMessage = useDeleteMessage();
  const restoreMessage = useRestoreMessage();
  const pinMessage = usePinMessage();
  const react = useReactToMessage();
  const star = useStarMessage();
  const report = useReportMessage();
  const restrict = useRestrictMember();
  const startDirect = useStartDirect();
  const answer = useAnswerRequest();
  const block = useBlockUser();
  const myState = useUpdateMyChatState();
  const leave = useLeaveChat();
  const clearChat = useClearChat();

  useEffect(() => {
    setChatOnScreen(room.id, true);
    setReplyTo(null);
    setEditing(null);
    setPinnedIndex(0);
    setPerson(null);
    setSelected(null);
    setForwarding(null);
    return () => setChatOnScreen(room.id, false);
  }, [room.id]);

  useEffect(() => {
    if (focusComposerToken > 0) composerRef.current?.focus();
  }, [focusComposerToken]);

  // A search result, a report or a link (notification) asked to show this
  // message: once the chat's messages are in.
  const jumpToken = jumpRequest?.token ?? 0;
  const handledJumpRef = useRef(0);
  const threadReady = Boolean(thread.data);
  useEffect(() => {
    if (!jumpRequest || !threadReady) return;
    if (handledJumpRef.current === jumpRequest.token) return;
    handledJumpRef.current = jumpRequest.token;
    void jumpTo(jumpRequest.seq);
  }, [jumpToken, threadReady]); // eslint-disable-line react-hooks/exhaustive-deps

  const onAtBottom = useCallback(
    (lastSeq: number) => {
      if (document.visibilityState !== "visible" || lastSeq <= 0) return;
      queueReceipt(room.id, { readSeq: lastSeq });
      markRoomRead(client, room.id, lastSeq);
    },
    [client, room.id],
  );

  const starredIds = useMemo(
    () => new Set((stars.data?.messages ?? []).map((m) => m.id)),
    [stars.data],
  );

  /** Who an @name in a message is, from the people this chat has seen. */
  function resolveMention(
    name: string,
    ids: readonly string[],
  ): CardPerson | null {
    const known = new Map<string, CardPerson>();
    for (const message of thread.data?.messages ?? []) {
      if (message.sender) known.set(message.sender.id, message.sender);
    }
    for (const [, page] of client.getQueriesData<{
      pages: Array<{ members: CardPerson[] }>;
    }>({ queryKey: ["chat", "members", room.id] })) {
      for (const p of page?.pages ?? []) {
        for (const member of p.members) {
          if (!known.has(member.id)) known.set(member.id, member);
        }
      }
    }
    if (room.peer) known.set(room.peer.id, room.peer);
    const wanted = name.toLowerCase().trim();
    const fits = (p: CardPerson) => {
      const full = p.name.toLowerCase();
      return (
        full === wanted ||
        full.startsWith(`${wanted} `) ||
        wanted.startsWith(`${full} `)
      );
    };
    for (const id of ids) {
      const p = known.get(id);
      if (p && fits(p)) return p;
    }
    if (ids.length === 1) {
      return known.get(ids[0]!) ?? { id: ids[0]!, name, avatarUrl: null };
    }
    for (const p of known.values()) if (fits(p)) return p;
    return null;
  }

  const ctx: BubbleContext = {
    viewerId,
    isGroup: room.kind !== "direct",
    isDirect: room.kind === "direct",
    peerReadSeq: room.peerReadSeq,
    peerDeliveredSeq: room.peerDeliveredSeq,
    canModerate: room.me.canModerate,
    isHelper: room.me.isHelper,
    starred: starredIds,
    myReactions,
    onOpenPerson: (who, anchor) => setPerson({ person: who, anchor }),
    selected,
    onToggleSelect: (seq) =>
      setSelected((current) => {
        const next = new Set(current ?? []);
        if (next.has(seq)) next.delete(seq);
        else next.add(seq);
        return next.size > 0 ? next : null;
      }),
    resolveMention,
  };

  const fail = (error: unknown) => onToast(getApiError(error).message);

  async function jumpTo(seq: number, from?: number) {
    const present = thread.data?.messages.some((m) => m.seq === seq);
    if (!present) {
      try {
        const page = await chatService.listMessages(room.id, {
          around: seq,
          limit: 40,
        });
        applyMessages(client, room.id, page.messages);
      } catch (error) {
        fail(error);
        return;
      }
    }
    // The list brings it to the middle and blinks it (MessageList).
    setFocus((current) => ({
      seq,
      token: (current?.token ?? 0) + 1,
      ...(from !== undefined ? { from } : {}),
    }));
  }

  function onAction(action: MessageAction, message: ChatMessage) {
    const base = { roomId: room.id, seq: message.seq };
    if (action === "react-remove") {
      const previous = myReactions.get(message.id) ?? null;
      myReactions.delete(message.id);
      forceRender((n) => n + 1);
      react.mutate({ ...base, emoji: null, previous }, { onError: fail });
      return;
    }
    if (action.startsWith("react:") || action === "react-toggle") {
      const previous = myReactions.get(message.id) ?? null;
      const picked = action === "react-toggle" ? previous : action.slice(6);
      if (action === "react-toggle" && !previous) {
        setDialog({ kind: "react", message });
        return;
      }
      const emoji = picked === previous ? null : picked;
      if (emoji) myReactions.set(message.id, emoji);
      else myReactions.delete(message.id);
      forceRender((n) => n + 1);
      react.mutate({ ...base, emoji, previous }, { onError: fail });
      return;
    }
    switch (action) {
      case "forward":
        setForwarding([message.seq]);
        return;
      case "select":
        setSelected(new Set([message.seq]));
        return;
      case "reply":
        setEditing(null);
        setReplyTo(message);
        return;
      case "info":
        onOpenMessageInfo(message);
        return;
      case "copy":
        void navigator.clipboard
          ?.writeText(message.body)
          .then(() => onToast("Message copied"));
        return;
      case "download":
        // Each file in turn (browsers allow several from one click).
        message.attachments.forEach((attachment, i) => {
          setTimeout(() => {
            const link = document.createElement("a");
            link.href = chatService.fileUrl(attachment, true);
            link.download = attachment.name;
            link.rel = "noopener";
            document.body.append(link);
            link.click();
            link.remove();
          }, i * 400);
        });
        return;
      case "copy-image": {
        const photo = message.attachments.find((a) => a.kind === "image");
        if (!photo) return;
        copyImage(photo, message.body)
          .then(() => onToast("Image copied"))
          .catch(() =>
            onToast("Couldn't copy this image. Use Download instead."),
          );
        return;
      }
      case "copy-link":
        // Opens this chat at this message, blinking (for the people in it).
        void navigator.clipboard
          ?.writeText(
            `${window.location.origin}/chat/${room.id}?seq=${message.seq}`,
          )
          .then(() => onToast("Link copied"));
        return;
      case "edit":
        setReplyTo(null);
        setEditing(message);
        return;
      case "pin":
      case "unpin":
        pinMessage.mutate(
          { ...base, pinned: action === "pin" },
          { onError: fail },
        );
        return;
      case "star":
      case "unstar":
        star.mutate({ ...base, starred: action === "star" }, { onError: fail });
        return;
      case "restore":
        restoreMessage.mutate(base, { onError: fail });
        return;
      case "react-more":
        setDialog({ kind: "react", message });
        return;
      case "delete":
        setDialog({ kind: "delete", message });
        return;
      case "report":
        setDialog({ kind: "report", message });
        return;
      case "mute-sender":
        setDialog({ kind: "restrict", message, mode: "mute" });
        return;
      case "message-sender":
        if (message.sender) {
          startDirect.mutate(message.sender.id, {
            onSuccess: ({ room: direct }) => onOpenChat(direct.id),
            onError: fail,
          });
        }
        return;
    }
  }

  function editLast() {
    const last = [...(thread.data?.messages ?? [])]
      .reverse()
      .find((m) => m.sender?.id === viewerId && !m.deleted && m.body);
    if (last) onAction("edit", last);
  }

  const pinned = room.pinnedMessages;
  const shownPin = pinned[pinnedIndex % Math.max(1, pinned.length)];
  const isRequestForMe =
    room.kind === "direct" &&
    room.directStatus === "requested" &&
    room.requestedByMe === false;
  // WhatsApp's header line: typing, then online / last seen (private
  // chats) or the members' names (groups).
  const presence = room.peerPresence;
  const subtitle =
    typing.length > 0
      ? room.kind === "direct"
        ? "typing…"
        : `${typing.slice(0, 2).join(", ")} ${typing.length === 1 ? "is" : "are"} typing…`
      : room.kind === "direct"
        ? presence?.online
          ? "online"
          : presence?.lastSeenAt
            ? lastSeenLabel(presence.lastSeenAt)
            : room.peer
              ? (ROLE_LABEL[room.peer.role] ?? "click here for contact info")
              : ""
        : room.memberNames.length > 0
          ? ["You", ...room.memberNames].join(", ") +
            ((room.memberCount ?? 0) > room.memberNames.length + 1 ? "…" : "")
          : "click here for group info";
  const iconButton = chatIconButton;

  return (
    <section
      aria-label={room.title}
      // A size container: the media preview fills its height (cqh).
      className="relative flex h-full min-w-0 flex-1 flex-col bg-(--chat-bg) [container-type:size]"
      onDragEnter={(event) => {
        if (event.dataTransfer.types.includes("Files") && room.me.canPost)
          setDragging(true);
      }}
      onDragOver={(event) => {
        // Over the message box too: the drop is ours, not the browser's.
        if (event.dataTransfer.types.includes("Files")) {
          event.preventDefault();
          if (room.me.canPost && !dragging) setDragging(true);
        }
      }}
    >
      {dragging ? (
        // WhatsApp Web: the whole chat under the header, message box
        // included, becomes the place to drop.
        <div
          className="absolute inset-x-0 top-16 bottom-0 z-40 flex flex-col items-center justify-center gap-3 bg-[color-mix(in_srgb,var(--chat-bg)_92%,transparent)] p-6 text-center"
          onDragOver={(event) => {
            event.preventDefault();
            event.dataTransfer.dropEffect = "copy";
          }}
          onDragLeave={(event) => {
            const to = event.relatedTarget as Node | null;
            if (!to || !event.currentTarget.contains(to)) setDragging(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            const files = [...event.dataTransfer.files];
            if (files.length > 0) composerRef.current?.addFiles(files);
          }}
        >
          <span className="pointer-events-none flex size-20 items-center justify-center rounded-full bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-(--accent-ink)">
            <FilePlus size={38} aria-hidden="true" />
          </span>
          <span className="pointer-events-none text-[1.05rem] font-semibold text-(--text)">
            Drop files here to send
          </span>
          <span className="pointer-events-none text-[0.85rem] text-(--muted)">
            Photos, videos, voice notes and documents · to {room.title}
          </span>
        </div>
      ) : null}
      {selected ? (
        <SelectionBar
          count={selected.size}
          onCancel={() => setSelected(null)}
          onCopy={() => {
            const text = (thread.data?.messages ?? [])
              .filter((m) => selected.has(m.seq) && m.body)
              .map((m) => m.body)
              .join("\n\n");
            if (!text) {
              onToast("Only text can be copied.");
              return;
            }
            void navigator.clipboard
              ?.writeText(text)
              .then(() => onToast("Messages copied"));
          }}
          onForward={() => setForwarding([...selected].sort((a, b) => a - b))}
        />
      ) : null}
      <header
        className={cn(
          "z-10 flex h-16 shrink-0 items-center gap-1 border-b border-solid border-(--chat-line) bg-(--chat-panel) pr-2 pl-2 @[720px]/chat:pl-4",
          selected && "hidden",
        )}
      >
        <button
          type="button"
          className={cn(iconButton, "@[720px]/chat:hidden")}
          onClick={onBack}
          aria-label="Back to chats"
        >
          <ArrowLeft size={20} />
        </button>
        <button
          type="button"
          onClick={onOpenInfo}
          className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-lg border-0 bg-transparent py-1 pr-2 pl-0 text-left text-(--text)"
          aria-label={room.kind === "direct" ? "Contact info" : "Group info"}
        >
          <ChatAvatar
            name={room.title}
            url={roomAvatarUrl(room)}
            group={room.kind !== "direct"}
            size="md"
          />
          <span className="min-w-0">
            <span className="block truncate text-[1rem] font-semibold">
              {room.title}
            </span>
            <span
              // Cut with "…" on the smallest screens; the whole line is in
              // the tooltip (and contact info shows it too).
              title={subtitle || undefined}
              className={cn(
                "block truncate text-[0.8rem]",
                typing.length > 0 || presence?.online
                  ? "text-(--accent-ink)"
                  : "text-(--muted)",
              )}
            >
              {subtitle}
            </span>
          </span>
        </button>
        {/* On a phone the name and "last seen" need the room; Search
            messages stays in the ⋮ menu. */}
        <button
          type="button"
          className={cn(iconButton, "hidden @[480px]/chat:inline-flex")}
          onClick={onOpenSearch}
          aria-label="Search messages"
          title="Search messages"
        >
          <MagnifyingGlass size={20} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className={iconButton} aria-label="Menu">
            <DotsThreeVertical size={22} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56 min-w-0">
            <DropdownMenuGroup>
              <DropdownMenuItem onClick={onOpenInfo}>
                {room.kind === "direct" ? "Contact info" : "Group info"}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenSearch}>
                Search messages
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  isRoomMuted(room.me)
                    ? myState.mutate(
                        { roomId: room.id, patch: { muteFor: "off" } },
                        { onError: fail },
                      )
                    : setDialog({ kind: "mute" })
                }
              >
                {isRoomMuted(room.me)
                  ? "Unmute notifications"
                  : "Mute notifications"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  myState.mutate(
                    { roomId: room.id, patch: { pinned: !room.me.pinned } },
                    { onError: fail },
                  )
                }
              >
                {room.me.pinned ? "Unpin chat" : "Pin chat"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  myState.mutate(
                    { roomId: room.id, patch: { archived: !room.me.archived } },
                    { onError: fail },
                  )
                }
              >
                {room.me.archived ? "Unarchive chat" : "Archive chat"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setDialog({ kind: "clear-chat", mode: "clear" })}
              >
                Clear chat
              </DropdownMenuItem>
              {room.kind === "direct" ? (
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() =>
                    setDialog({ kind: "clear-chat", mode: "delete" })
                  }
                >
                  Delete chat
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            {room.kind === "direct" && room.peer ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() =>
                    block.mutate(
                      {
                        userId: room.peer!.id,
                        blocked: room.me.cannotPostReason !== "blocked",
                      },
                      { onError: fail },
                    )
                  }
                >
                  {room.me.cannotPostReason === "blocked" ? "Unblock" : "Block"}{" "}
                  {room.peer.name}
                </DropdownMenuItem>
              </>
            ) : null}
            {room.kind === "team" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() =>
                    leave.mutate(room.id, { onSuccess: onBack, onError: fail })
                  }
                >
                  Exit group
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      {shownPin ? (
        <button
          type="button"
          onClick={() => {
            void jumpTo(shownPin.seq);
            setPinnedIndex((i) => i + 1);
          }}
          className="z-10 flex w-full shrink-0 cursor-pointer items-center gap-2.5 border-0 border-b border-solid border-(--chat-line) bg-(--chat-panel) px-4 py-2 text-left text-(--text)"
          aria-label="Pinned message"
        >
          {pinned.length > 1 ? (
            <span aria-hidden="true" className="flex h-7 flex-col gap-0.5">
              {pinned.map((p, i) => (
                <span
                  key={p.seq}
                  className={cn(
                    "w-0.75 flex-1 rounded-full",
                    i === pinnedIndex % pinned.length
                      ? "bg-(--accent)"
                      : "bg-(--chat-line-strong)",
                  )}
                />
              ))}
            </span>
          ) : null}
          <PushPin
            size={16}
            weight="fill"
            className="shrink-0 text-(--muted)"
            aria-hidden="true"
          />
          <span className="min-w-0 flex-1 truncate text-[0.86rem] text-(--text-secondary)">
            {shownPin.body ||
              (shownPin.attachments[0]?.kind === "audio"
                ? "Voice message"
                : "Media")}
          </span>
        </button>
      ) : null}

      <div className="relative flex min-h-0 flex-1 flex-col [background:var(--chat-wall,var(--chat-bg))]">
        <div className="chat-wallpaper" aria-hidden="true" />
        {thread.data ? (
          <MessageList
            thread={thread.data}
            outgoing={outgoing}
            ctx={ctx}
            unreadAfterSeq={unreadAfterRef.current.seq}
            focus={focus}
            loadingOlder={thread.loadingOlder}
            onLoadOlder={() => void thread.loadOlder()}
            onAction={onAction}
            onOpenMedia={(items, index) => setViewer({ items, index })}
            onJumpTo={(seq, from) => void jumpTo(seq, from)}
            onAtBottom={onAtBottom}
            onRetry={(clientId) =>
              retryMessage(client, viewerId, room.id, clientId)
            }
            onDiscard={(clientId) => discardMessage(room.id, clientId)}
            typing={typing}
          />
        ) : thread.isError ? (
          <div className="relative flex flex-1 items-center justify-center p-6 text-center text-(--muted)">
            {getApiError(thread.error).message}
          </div>
        ) : (
          <ChatThreadSkeleton />
        )}
      </div>

      {isRequestForMe ? (
        <div className="flex flex-col items-center gap-3 border-t border-solid border-(--chat-line) bg-(--chat-panel) px-4 py-4">
          <p className="m-0 text-center text-[0.9rem] text-(--text-secondary)">
            {room.title} is not in your chats. You both take the same course.
          </p>
          <div className="flex flex-wrap justify-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                room.peer &&
                block.mutate(
                  { userId: room.peer.id, blocked: true },
                  { onSuccess: onBack, onError: fail },
                )
              }
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-solid border-red-500/50 bg-transparent px-5 font-semibold text-red-500 hover:bg-(--chat-hover)"
            >
              <Prohibit size={16} /> Block
            </button>
            <button
              type="button"
              onClick={() =>
                answer.mutate(
                  { roomId: room.id, accept: false },
                  { onSuccess: onBack, onError: fail },
                )
              }
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-solid border-(--chat-line-strong) bg-transparent px-5 font-semibold text-(--text) hover:bg-(--chat-hover)"
            >
              <Flag size={16} /> Decline
            </button>
            <button
              type="button"
              onClick={() =>
                answer.mutate(
                  { roomId: room.id, accept: true },
                  { onError: fail },
                )
              }
              className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-full border border-solid border-(--accent-border) bg-transparent px-5 font-semibold text-(--accent-ink) hover:bg-(--chat-hover)"
            >
              <Check size={16} /> Accept
            </button>
          </div>
        </div>
      ) : (
        <Composer
          ref={composerRef}
          room={room}
          viewerId={viewerId}
          replyTo={replyTo}
          onCancelReply={() => setReplyTo(null)}
          editing={editing}
          onDoneEditing={() => setEditing(null)}
          onEditLast={editLast}
          onError={onToast}
        />
      )}

      {dialog?.kind === "mute" ? (
        <MuteChatDialog
          onClose={() => setDialog(null)}
          onMute={(muteFor) => {
            setDialog(null);
            myState.mutate(
              { roomId: room.id, patch: { muteFor } },
              { onError: fail },
            );
          }}
        />
      ) : null}
      {dialog?.kind === "clear-chat" ? (
        <ClearChatDialog
          mode={dialog.mode}
          name={room.title}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const deleteChat = dialog.mode === "delete";
            setDialog(null);
            clearChat.mutate(
              { roomId: room.id, deleteChat },
              { onError: fail },
            );
            if (deleteChat) onBack();
            else onToast("Chat cleared");
          }}
        />
      ) : null}
      {dialog?.kind === "delete" ? (
        <DeleteMessageDialog
          message={dialog.message}
          own={dialog.message.sender?.id === viewerId}
          asAdmin={room.me.canModerate || room.me.isHelper}
          onClose={() => setDialog(null)}
          onDelete={(scope) => {
            deleteMessage.mutate(
              { roomId: room.id, seq: dialog.message.seq, scope },
              { onError: fail },
            );
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "report" ? (
        <ReportDialog
          name={dialog.message.sender?.name ?? "this person"}
          privateChat={room.kind === "direct"}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            report.mutate(
              { roomId: room.id, seq: dialog.message.seq, ...input },
              {
                onSuccess: () => onToast("Report sent. Thank you."),
                onError: fail,
              },
            );
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "restrict" && dialog.message.sender ? (
        <RestrictDialog
          name={dialog.message.sender.name}
          mode={dialog.mode}
          helperOnly={!room.me.canModerate && room.me.isHelper}
          canRestrictEverywhere={room.me.canModerate}
          onClose={() => setDialog(null)}
          onSubmit={(input) => {
            restrict.mutate(
              {
                userId: dialog.message.sender!.id,
                roomId: input.everywhere ? null : room.id,
                type: dialog.mode,
                durationMinutes: input.durationMinutes,
                reason: input.reason,
              },
              {
                onSuccess: () =>
                  onToast(
                    `${dialog.message.sender!.name} was ${dialog.mode === "mute" ? "muted" : "removed"}.`,
                  ),
                onError: fail,
              },
            );
            setDialog(null);
          }}
        />
      ) : null}
      {dialog?.kind === "react" ? (
        <div
          className="fixed inset-0 z-250 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setDialog(null)}
        >
          <div onClick={(event) => event.stopPropagation()}>
            <EmojiPanel
              className="w-[min(22rem,90vw)]"
              onPick={(emoji) => {
                onAction(`react:${emoji}`, dialog.message);
                setDialog(null);
              }}
            />
          </div>
        </div>
      ) : null}
      {forwarding ? (
        <ForwardDialog
          fromRoomId={room.id}
          seqs={forwarding}
          onClose={() => setForwarding(null)}
          onToast={onToast}
          onDone={(roomIds) => {
            setForwarding(null);
            setSelected(null);
            // One chat: open it, as WhatsApp does.
            if (roomIds.length === 1 && roomIds[0] !== room.id) {
              onOpenChat(roomIds[0]!);
            }
          }}
        />
      ) : null}
      {person ? (
        <PersonCard
          person={person.person}
          anchor={person.anchor}
          viewerId={viewerId}
          onMention={
            room.kind !== "direct" && room.me.canPost
              ? (who) => composerRef.current?.mention(who)
              : undefined
          }
          onOpenChat={onOpenChat}
          onClose={() => setPerson(null)}
          onToast={onToast}
        />
      ) : null}
      {viewer ? (
        <MediaViewer
          items={viewer.items}
          index={viewer.index}
          onIndex={(index) => setViewer((v) => (v ? { ...v, index } : v))}
          onClose={() => setViewer(null)}
        />
      ) : null}
    </section>
  );
}
