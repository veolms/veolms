import { ArchiveIcon as Archive } from "@phosphor-icons/react/Archive";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { BellSlashIcon as BellSlash } from "@phosphor-icons/react/BellSlash";
import { ChatCircleTextIcon as ChatCircleText } from "@phosphor-icons/react/ChatCircleText";
import { ChecksIcon as Checks } from "@phosphor-icons/react/Checks";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import type { ChatRoomSummary } from "@veolms/contracts";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import {
  useChatCandidates,
  useStarredMessages,
  useUpdateMyChatState,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { listTime, messageTime } from "./chatFormat";
import { ChatListSkeleton } from "./ChatSkeletons";

type Filter = "all" | "unread" | "courses" | "direct" | "requests";
export type ListPanel = "chats" | "archived" | "new" | "starred";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "courses", label: "Groups" },
  { id: "direct", label: "Direct" },
  { id: "requests", label: "Requests" },
];

const iconButton =
  "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--hover) hover:text-(--text)";

export function ChatList({
  rooms,
  loading,
  requestsCount,
  selectedId,
  viewerId,
  panel,
  onPanel,
  onSelect,
  onStartDirect,
  onJumpToMessage,
  onShowShortcuts,
}: {
  rooms: ChatRoomSummary[] | undefined;
  loading: boolean;
  requestsCount: number;
  selectedId: string | null;
  viewerId: string | null;
  panel: ListPanel;
  onPanel: (panel: ListPanel) => void;
  onSelect: (roomId: string) => void;
  onStartDirect: (userId: string) => void;
  onJumpToMessage: (roomId: string, seq: number) => void;
  onShowShortcuts: () => void;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  if (panel === "new") {
    return (
      <NewChatPanel
        onBack={() => onPanel("chats")}
        onStartDirect={onStartDirect}
      />
    );
  }
  if (panel === "starred") {
    return (
      <StarredPanel onBack={() => onPanel("chats")} onOpen={onJumpToMessage} />
    );
  }

  const archivedView = panel === "archived";
  const archivedCount = rooms?.filter((r) => r.me.archived).length ?? 0;
  const term = search.trim().toLowerCase();
  const visible = (rooms ?? []).filter((room) => {
    if (room.me.archived !== archivedView) return false;
    if (
      term &&
      !room.title.toLowerCase().includes(term) &&
      !room.lastMessage?.preview.toLowerCase().includes(term)
    )
      return false;
    if (archivedView) return true;
    if (filter === "unread") return room.unreadCount > 0;
    if (filter === "courses") return room.kind !== "direct";
    if (filter === "direct")
      return room.kind === "direct" && room.directStatus !== "requested";
    if (filter === "requests")
      return (
        room.kind === "direct" &&
        room.directStatus === "requested" &&
        room.requestedByMe === false
      );
    return true;
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-1 px-4">
        {archivedView ? (
          <>
            <button
              type="button"
              className={iconButton}
              onClick={() => onPanel("chats")}
              aria-label="Back"
            >
              <ArrowLeft size={20} />
            </button>
            <h1 className="m-0 flex-1 text-[1.15rem] font-bold text-(--text)">
              Archived
            </h1>
          </>
        ) : (
          <>
            <h1 className="m-0 flex-1 text-[1.35rem] font-bold text-(--text)">
              Chats
            </h1>
            <button
              type="button"
              className={iconButton}
              onClick={() => onPanel("new")}
              aria-label="New chat"
              title="New chat (Ctrl+Alt+N)"
            >
              <NotePencil size={21} />
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className={iconButton} aria-label="Menu">
                <DotsThreeVertical size={22} weight="bold" />
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52 min-w-0">
                <DropdownMenuItem onClick={() => onPanel("starred")}>
                  <Star size={16} aria-hidden="true" /> Starred messages
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => onPanel("archived")}>
                  <Archive size={16} aria-hidden="true" /> Archived chats
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onShowShortcuts}>
                  <ChatCircleText size={16} aria-hidden="true" /> Keyboard
                  shortcuts
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        )}
      </div>

      <label className="mx-3 mb-2 flex h-10 shrink-0 items-center gap-3 rounded-full bg-(--surface-strong) px-4">
        <MagnifyingGlass
          size={17}
          className="text-(--muted)"
          aria-hidden="true"
        />
        <span className="sr-only">Search chats</span>
        <input
          id="chat-search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search or start a new chat"
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
          onKeyDown={(event) => {
            if (event.key === "Escape") setSearch("");
            if (event.key === "Enter" && visible[0]) onSelect(visible[0].id);
          }}
        />
      </label>

      {!archivedView ? (
        <div
          className="flex shrink-0 gap-2 overflow-x-auto px-3 pb-2"
          role="tablist"
          aria-label="Filter chats"
        >
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-8 shrink-0 cursor-pointer rounded-full border border-solid px-3.5 text-[0.84rem] font-medium",
                filter === item.id
                  ? "border-transparent bg-(--accent-soft) text-(--accent-ink)"
                  : "border-(--border) bg-transparent text-(--muted) hover:bg-(--hover)",
              )}
            >
              {item.label}
              {item.id === "requests" && requestsCount > 0
                ? ` ${requestsCount}`
                : ""}
            </button>
          ))}
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {!archivedView && archivedCount > 0 && filter === "all" && !term ? (
          <button
            type="button"
            onClick={() => onPanel("archived")}
            className="flex h-13 w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-6 text-left text-(--text) hover:bg-(--hover)"
          >
            <Archive
              size={20}
              className="text-(--accent-ink)"
              aria-hidden="true"
            />
            <span className="flex-1 text-[0.95rem] font-medium">Archived</span>
            <span className="text-[0.8rem] text-(--muted)">
              {archivedCount}
            </span>
          </button>
        ) : null}
        {loading && !rooms ? <ChatListSkeleton /> : null}
        <ul className="m-0 list-none p-0" aria-label="Chats">
          {visible.map((room) => (
            <ChatRow
              key={room.id}
              room={room}
              selected={room.id === selectedId}
              viewerId={viewerId}
              onSelect={onSelect}
            />
          ))}
        </ul>
        {rooms && visible.length === 0 ? (
          <p className="m-0 px-8 py-10 text-center text-[0.88rem] text-(--muted)">
            {term
              ? "No chats match your search."
              : archivedView
                ? "No archived chats."
                : filter === "all"
                  ? "No chats yet. Your course groups appear here once their instructor turns chat on."
                  : "Nothing here."}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ChatRow({
  room,
  selected,
  viewerId,
  onSelect,
}: {
  room: ChatRoomSummary;
  selected: boolean;
  viewerId: string | null;
  onSelect: (roomId: string) => void;
}) {
  const myState = useUpdateMyChatState();
  const last = room.lastMessage;
  const mine = last?.senderId === viewerId;
  const unread = room.unreadCount > 0;
  const isRequest =
    room.kind === "direct" &&
    room.directStatus === "requested" &&
    room.requestedByMe === false;
  const preview = last
    ? last.deleted
      ? mine
        ? "You deleted this message"
        : "This message was deleted"
      : `${room.kind !== "direct" && last.senderName && !mine ? `${last.senderName.split(" ")[0]}: ` : ""}${last.preview}`
    : room.kind === "direct"
      ? ""
      : "No messages yet";

  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onSelect(room.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex h-18 w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-3 text-left text-(--text)",
          selected ? "bg-(--selected)" : "hover:bg-(--hover)",
        )}
      >
        <ChatAvatar
          name={room.title}
          url={room.peer?.avatarUrl ?? null}
          group={room.kind !== "direct"}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 border-b border-solid border-[color-mix(in_srgb,var(--border)_60%,transparent)] py-3 group-last/row:border-transparent">
          <span className="flex items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[0.98rem] font-medium">
              {room.title}
            </span>
            <span
              className={cn(
                "shrink-0 text-[0.72rem]",
                unread ? "font-semibold text-(--accent-ink)" : "text-(--muted)",
              )}
            >
              {last ? listTime(last.createdAt) : ""}
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-[0.84rem] text-(--muted)">
            {mine && last && !last.deleted && room.kind === "direct" ? (
              <Checks
                size={16}
                weight="bold"
                className={cn(
                  "shrink-0",
                  (room.peerReadSeq ?? 0) >= last.seq && "text-[#34b7f1]",
                )}
                aria-label={
                  (room.peerReadSeq ?? 0) >= last.seq ? "Read" : "Delivered"
                }
              />
            ) : null}
            <span
              className={cn(
                "min-w-0 flex-1 truncate",
                last?.deleted && "italic",
              )}
            >
              {isRequest ? (
                <span className="font-semibold text-(--accent-ink)">
                  Message request ·{" "}
                </span>
              ) : null}
              {preview}
            </span>
            {room.me.notifyLevel === "none" ? (
              <BellSlash size={15} className="shrink-0" aria-label="Muted" />
            ) : null}
            {room.me.pinned ? (
              <PushPin
                size={15}
                weight="fill"
                className="shrink-0"
                aria-label="Pinned"
              />
            ) : null}
            {unread ? (
              <span
                className={cn(
                  "min-w-5 shrink-0 rounded-full px-1.5 text-center text-[0.7rem] leading-5 font-bold",
                  room.me.notifyLevel === "none"
                    ? "bg-(--border-strong) text-(--text)"
                    : "bg-(--accent) text-(--on-accent)",
                )}
                aria-label={`${room.unreadCount} unread`}
              >
                {room.unreadCount > 99 ? "99+" : room.unreadCount}
              </span>
            ) : null}
          </span>
        </span>
      </button>
      <div className="absolute top-1/2 right-2 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-within:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger
            aria-label={`Options for ${room.title}`}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-(--surface) text-(--muted) shadow-sm"
          >
            <DotsThreeVertical size={16} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48 min-w-0">
            <DropdownMenuItem
              onClick={() =>
                myState.mutate({
                  roomId: room.id,
                  patch: { archived: !room.me.archived },
                })
              }
            >
              {room.me.archived ? "Unarchive chat" : "Archive chat"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                myState.mutate({
                  roomId: room.id,
                  patch: {
                    notifyLevel:
                      room.me.notifyLevel === "none" ? "all" : "none",
                  },
                })
              }
            >
              {room.me.notifyLevel === "none"
                ? "Unmute notifications"
                : "Mute notifications"}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() =>
                myState.mutate({
                  roomId: room.id,
                  patch: { pinned: !room.me.pinned },
                })
              }
            >
              {room.me.pinned ? "Unpin chat" : "Pin chat"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  );
}

/** WhatsApp's "New chat": only people you are allowed to message. */
function NewChatPanel({
  onBack,
  onStartDirect,
}: {
  onBack: () => void;
  onStartDirect: (userId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const candidates = useChatCandidates(search.trim(), true);
  const person = (
    p: { id: string; name: string; avatarUrl: string | null },
    note: string,
  ) => (
    <li key={p.id}>
      <button
        type="button"
        onClick={() => onStartDirect(p.id)}
        className="flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-2.5 text-left text-(--text) hover:bg-(--hover)"
      >
        <ChatAvatar name={p.name} url={p.avatarUrl} size="md" />
        <span className="min-w-0">
          <span className="block truncate text-[0.95rem]">{p.name}</span>
          <span className="block truncate text-[0.78rem] text-(--muted)">
            {note}
          </span>
        </span>
      </button>
    </li>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          className={iconButton}
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="m-0 text-[1.1rem] font-bold text-(--text)">New chat</h2>
      </div>
      <label className="mx-3 mb-2 flex h-10 shrink-0 items-center gap-3 rounded-full bg-(--surface-strong) px-4">
        <MagnifyingGlass
          size={17}
          className="text-(--muted)"
          aria-hidden="true"
        />
        <span className="sr-only">Search name</span>
        <input
          autoFocus
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name"
          className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
          onKeyDown={(event) => event.key === "Escape" && onBack()}
        />
      </label>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4">
        {candidates.isLoading ? <ChatListSkeleton /> : null}
        {candidates.data && candidates.data.staff.length > 0 ? (
          <>
            <h3 className="m-0 px-4 pt-3 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              Staff of your courses
            </h3>
            <ul className="m-0 list-none p-0">
              {candidates.data.staff.map((p) => person(p, "Instructor"))}
            </ul>
          </>
        ) : null}
        {candidates.data?.courses.map((course) => (
          <section key={course.courseId}>
            <h3 className="m-0 px-4 pt-3 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              Classmates · {course.title}
            </h3>
            {course.directAllowed ? (
              course.people.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {course.people.map((p) => person(p, "Learner"))}
                </ul>
              ) : (
                <p className="m-0 px-4 py-2 text-[0.82rem] text-(--muted)">
                  Nobody from this course has opened its group yet.
                </p>
              )
            ) : (
              <p className="m-0 px-4 py-2 text-[0.82rem] text-(--muted)">
                The instructor hasn’t turned on private chats between learners
                in this course.
              </p>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}

function StarredPanel({
  onBack,
  onOpen,
}: {
  onBack: () => void;
  onOpen: (roomId: string, seq: number) => void;
}) {
  const stars = useStarredMessages(true);
  const messages = useMemo(() => stars.data?.messages ?? [], [stars.data]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center gap-2 px-3">
        <button
          type="button"
          className={iconButton}
          onClick={onBack}
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="m-0 text-[1.1rem] font-bold text-(--text)">
          Starred messages
        </h2>
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-0">
        {messages.map((message) => (
          <li key={message.id}>
            <button
              type="button"
              onClick={() => onOpen(message.roomId, message.seq)}
              className="flex w-full cursor-pointer flex-col gap-1 border-0 border-b border-solid border-(--border) bg-transparent px-4 py-3 text-left text-(--text) hover:bg-(--hover)"
            >
              <span className="flex items-center gap-2 text-[0.78rem] text-(--muted)">
                <span className="min-w-0 flex-1 truncate">
                  {message.sender?.name ?? "Someone"} · {message.roomTitle}
                </span>
                <span>{messageTime(message.createdAt)}</span>
              </span>
              <span className="line-clamp-3 text-[0.9rem]">
                {message.body || "Media"}
              </span>
            </button>
          </li>
        ))}
        {stars.data && messages.length === 0 ? (
          <p className="m-0 px-8 py-10 text-center text-[0.88rem] text-(--muted)">
            Star messages from their menu to find them here later.
          </p>
        ) : null}
      </ul>
    </div>
  );
}
