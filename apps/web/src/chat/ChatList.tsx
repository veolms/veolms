import { ArchiveIcon as Archive } from "@phosphor-icons/react/Archive";
import { BellSlashIcon as BellSlash } from "@phosphor-icons/react/BellSlash";
import { CaretDownIcon as CaretDown } from "@phosphor-icons/react/CaretDown";
import { ChecksIcon as Checks } from "@phosphor-icons/react/Checks";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { GearSixIcon as GearSix } from "@phosphor-icons/react/GearSix";
import { KeyboardIcon as Keyboard } from "@phosphor-icons/react/Keyboard";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { NotePencilIcon as NotePencil } from "@phosphor-icons/react/NotePencil";
import { ProhibitIcon as Prohibit } from "@phosphor-icons/react/Prohibit";
import { PushPinIcon as PushPin } from "@phosphor-icons/react/PushPin";
import { SignOutIcon as SignOut } from "@phosphor-icons/react/SignOut";
import { StarIcon as Star } from "@phosphor-icons/react/Star";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatRoomSummary } from "@veolms/contracts";
import { useMemo, useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { cn } from "../lib/utils";
import {
  markRoomRead,
  queueReceipt,
  useBlockUser,
  useChatCandidates,
  useLeaveChat,
  useStarredMessages,
  useTypingNames,
  useUpdateMyChatState,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { chatIconButton, ListPanelHeader } from "./ChatControls";
import { StatusTicks } from "./ChatTicks";
import { listTime, messageTime } from "./chatFormat";
import { ChatListSkeleton } from "./ChatSkeletons";

type Filter = "all" | "unread" | "courses" | "direct" | "requests";
export type ListPanel =
  "chats" | "archived" | "new" | "starred" | "settings" | "groups";

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "courses", label: "Groups" },
  { id: "direct", label: "Direct" },
  { id: "requests", label: "Requests" },
];

/** The rounded search box at the top of the list panels. */
function SearchBox({
  id,
  value,
  placeholder,
  label,
  autoFocus = false,
  onChange,
  onEnter,
  onEscape,
}: {
  id?: string;
  value: string;
  placeholder: string;
  label: string;
  autoFocus?: boolean;
  onChange: (value: string) => void;
  onEnter?: () => void;
  onEscape?: () => void;
}) {
  return (
    <label className="mx-3 mb-2 flex h-10 shrink-0 items-center gap-3 rounded-full bg-(--chat-input) px-4 focus-within:outline-2 focus-within:outline-offset-[-2px] focus-within:outline-(--accent)">
      <MagnifyingGlass
        size={17}
        className="shrink-0 text-(--muted)"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
      <input
        id={id}
        autoFocus={autoFocus}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="min-w-0 flex-1 border-0 bg-transparent text-[0.9rem] text-(--text) outline-none placeholder:text-(--muted)"
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (value) onChange("");
            else onEscape?.();
          }
          if (event.key === "Enter") onEnter?.();
        }}
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear search"
          className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:text-(--text)"
        >
          <X size={15} />
        </button>
      ) : null}
    </label>
  );
}

export function ChatList({
  rooms,
  loading,
  requestsCount,
  selectedId,
  viewerId,
  isStaff,
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
  isStaff: boolean;
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
      {archivedView ? (
        <ListPanelHeader title="Archived" onBack={() => onPanel("chats")} />
      ) : (
        <div className="flex h-16 shrink-0 items-center gap-0.5 pr-2 pl-5">
          <h1 className="m-0 flex-1 text-[1.4rem] font-bold tracking-[-0.01em] text-(--text)">
            Chats
          </h1>
          {isStaff ? (
            <button
              type="button"
              className={chatIconButton}
              onClick={() => onPanel("groups")}
              aria-label="Course groups"
              title="Course groups"
            >
              <UsersThree size={22} />
            </button>
          ) : null}
          <button
            type="button"
            className={chatIconButton}
            onClick={() => onPanel("new")}
            aria-label="New chat"
            title="New chat (Ctrl+Alt+N)"
          >
            <NotePencil size={21} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger className={chatIconButton} aria-label="Menu">
              <DotsThreeVertical size={22} weight="bold" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 min-w-0">
              {isStaff ? (
                <DropdownMenuItem onClick={() => onPanel("groups")}>
                  <UsersThree size={17} aria-hidden="true" /> Course groups
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onClick={() => onPanel("starred")}>
                <Star size={17} aria-hidden="true" /> Starred messages
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onPanel("archived")}>
                <Archive size={17} aria-hidden="true" /> Archived chats
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => onPanel("settings")}>
                <GearSix size={17} aria-hidden="true" /> Settings
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onShowShortcuts}>
                <Keyboard size={17} aria-hidden="true" /> Keyboard shortcuts
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <SearchBox
        id="chat-search"
        value={search}
        onChange={setSearch}
        label="Search chats"
        placeholder={
          archivedView ? "Search archived chats" : "Search or start a new chat"
        }
        onEnter={() => visible[0] && onSelect(visible[0].id)}
      />

      {!archivedView ? (
        <div
          className="flex shrink-0 gap-2 overflow-x-auto px-3 pt-0.5 pb-2.5 [scrollbar-width:none]"
          role="tablist"
          aria-label="Filter chats"
        >
          {FILTERS.filter(
            (item) => item.id !== "requests" || requestsCount > 0,
          ).map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={filter === item.id}
              onClick={() => setFilter(item.id)}
              className={cn(
                "h-8 shrink-0 cursor-pointer rounded-full border-0 px-3.5 text-[0.85rem] font-medium transition-colors",
                filter === item.id
                  ? "bg-(--accent-soft) text-(--accent-ink)"
                  : "bg-(--chat-input) text-(--muted) hover:text-(--text)",
              )}
            >
              {item.label}
              {item.id === "requests" ? ` ${requestsCount}` : ""}
            </button>
          ))}
        </div>
      ) : (
        <p className="m-0 mx-5 mb-2 text-[0.8rem] leading-snug text-(--muted)">
          Archived chats stay here when new messages arrive. Unarchive one from
          its menu.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3 [scrollbar-gutter:stable]">
        {!archivedView && archivedCount > 0 && filter === "all" && !term ? (
          <button
            type="button"
            onClick={() => onPanel("archived")}
            className="flex h-13 w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-2.5 text-left text-(--text) hover:bg-(--chat-hover)"
          >
            <span className="flex size-12 shrink-0 items-center justify-center">
              <Archive
                size={21}
                className="text-(--accent-ink)"
                aria-hidden="true"
              />
            </span>
            <span className="flex-1 text-[0.98rem]">Archived</span>
            <span className="pr-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              {archivedCount}
            </span>
          </button>
        ) : null}
        {loading && !rooms ? <ChatListSkeleton /> : null}
        <ul
          className="m-0 flex list-none flex-col gap-0.5 p-0"
          aria-label="Chats"
        >
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
          <div className="px-8 py-12 text-center">
            <p className="m-0 text-[0.9rem] text-(--muted)">
              {term
                ? `No chats match “${search.trim()}”.`
                : archivedView
                  ? "No archived chats."
                  : filter === "unread"
                    ? "No unread chats. You’re all caught up."
                    : filter === "requests"
                      ? "No message requests."
                      : filter !== "all"
                        ? "Nothing here yet."
                        : isStaff
                          ? "No chats yet. Turn on a course group or start a chat."
                          : "No chats yet. Your course groups appear here once their instructor turns chat on."}
            </p>
            {!term && !archivedView && filter === "all" ? (
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {isStaff ? (
                  <button
                    type="button"
                    onClick={() => onPanel("groups")}
                    className="h-9 cursor-pointer rounded-full border-0 bg-(--accent) px-4 text-[0.85rem] font-semibold text-(--on-accent)"
                  >
                    Course groups
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => onPanel("new")}
                  className="h-9 cursor-pointer rounded-full border border-solid border-(--chat-line-strong) bg-transparent px-4 text-[0.85rem] font-semibold text-(--text)"
                >
                  New chat
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** The list shows text, not the *bold* / _italic_ / ~strike~ / `code` marks. */
function plainPreview(text: string): string {
  return text.replace(/([*_~`])(\S(?:[^]*?\S)?)\1/g, "$2");
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
  const client = useQueryClient();
  const myState = useUpdateMyChatState();
  const block = useBlockUser();
  const leave = useLeaveChat();
  const typing = useTypingNames(room.id);
  const [menuOpen, setMenuOpen] = useState(false);
  const last = room.lastMessage;
  const mine = Boolean(last && viewerId && last.senderId === viewerId);
  const unread = room.unreadCount > 0;
  const muted = room.me.notifyLevel === "none";
  const isRequest =
    room.kind === "direct" &&
    room.directStatus === "requested" &&
    room.requestedByMe === false;
  const preview = last
    ? last.deleted
      ? mine
        ? "You deleted this message"
        : "This message was deleted"
      : `${room.kind !== "direct" && last.senderName && !mine ? `${last.senderName.split(" ")[0]}: ` : ""}${plainPreview(last.preview)}`
    : room.kind === "direct"
      ? ""
      : "No messages yet";

  const setState = (patch: Parameters<typeof myState.mutate>[0]["patch"]) =>
    myState.mutate({ roomId: room.id, patch });

  return (
    <li className="group/row relative">
      <button
        type="button"
        onClick={() => onSelect(room.id)}
        aria-current={selected ? "true" : undefined}
        className={cn(
          "flex h-18 w-full cursor-pointer items-center gap-3 rounded-xl border-0 px-2.5 text-left text-(--text) transition-colors",
          selected
            ? "bg-(--chat-selected)"
            : menuOpen
              ? "bg-(--chat-hover)"
              : "bg-transparent hover:bg-(--chat-hover)",
        )}
      >
        <ChatAvatar
          name={room.title}
          url={room.peer?.avatarUrl ?? null}
          group={room.kind !== "direct"}
        />
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="flex items-baseline gap-2">
            <span
              className={cn(
                "min-w-0 flex-1 truncate text-[1rem]",
                unread ? "font-semibold" : "font-medium",
              )}
            >
              {room.title}
            </span>
            <span
              className={cn(
                "shrink-0 text-[0.74rem] tabular-nums",
                unread && !muted
                  ? "font-semibold text-(--accent-ink)"
                  : "text-(--muted)",
              )}
            >
              {last ? listTime(last.createdAt) : ""}
            </span>
          </span>
          <span className="flex h-5 items-center gap-1 text-[0.86rem] text-(--muted)">
            {typing.length > 0 ? (
              <span className="min-w-0 flex-1 truncate font-medium text-(--accent-ink)">
                {room.kind === "direct"
                  ? "typing…"
                  : `${typing[0]!.split(" ")[0]} is typing…`}
              </span>
            ) : (
              <>
                {mine && last && !last.deleted ? (
                  <StatusTicks
                    seq={last.seq}
                    deliveredSeq={room.peerDeliveredSeq}
                    readSeq={room.peerReadSeq}
                  />
                ) : null}
                {last?.deleted ? (
                  <Prohibit size={14} className="shrink-0" aria-hidden="true" />
                ) : null}
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    last?.deleted && "italic",
                    unread && !muted && "text-(--text-secondary)",
                  )}
                >
                  {isRequest ? (
                    <span className="font-semibold text-(--accent-ink)">
                      Message request ·{" "}
                    </span>
                  ) : null}
                  {preview}
                </span>
              </>
            )}
            {/* Room for the hover chevron, as in WhatsApp. */}
            <span
              className={cn(
                "flex shrink-0 items-center gap-1 transition-[margin] duration-150 group-hover/row:mr-7",
                menuOpen && "mr-7",
              )}
            >
              {muted ? (
                <BellSlash size={16} className="shrink-0" aria-label="Muted" />
              ) : null}
              {room.me.pinned ? (
                <PushPin
                  size={16}
                  weight="fill"
                  className="shrink-0"
                  aria-label="Pinned"
                />
              ) : null}
              {unread ? (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-[0.72rem] leading-5 font-bold tabular-nums",
                    muted
                      ? "bg-(--chat-line-strong) text-(--text)"
                      : "bg-(--accent) text-(--on-accent)",
                  )}
                  aria-label={`${room.unreadCount} unread`}
                >
                  {room.unreadCount > 99 ? "99+" : room.unreadCount}
                </span>
              ) : null}
            </span>
          </span>
        </span>
      </button>
      <div
        className={cn(
          "absolute right-2 bottom-3 translate-x-1 opacity-0 transition-[opacity,translate] duration-150 group-hover/row:translate-x-0 group-hover/row:opacity-100 focus-within:translate-x-0 focus-within:opacity-100",
          menuOpen && "translate-x-0 opacity-100",
        )}
      >
        <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
          <DropdownMenuTrigger
            aria-label={`Chat options for ${room.title}`}
            className="inline-flex size-7 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:text-(--text)"
          >
            <CaretDown size={18} weight="bold" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56 min-w-0">
            <DropdownMenuGroup>
              <DropdownMenuItem
                onClick={() => setState({ archived: !room.me.archived })}
              >
                <Archive size={17} aria-hidden="true" />
                {room.me.archived ? "Unarchive chat" : "Archive chat"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() =>
                  setState({ notifyLevel: muted ? "all" : "none" })
                }
              >
                <BellSlash size={17} aria-hidden="true" />
                {muted ? "Unmute notifications" : "Mute notifications"}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setState({ pinned: !room.me.pinned })}
              >
                <PushPin size={17} aria-hidden="true" />
                {room.me.pinned ? "Unpin chat" : "Pin chat"}
              </DropdownMenuItem>
              {unread ? (
                <DropdownMenuItem
                  onClick={() => {
                    queueReceipt(room.id, { readSeq: room.lastSeq });
                    markRoomRead(client, room.id, room.lastSeq);
                  }}
                >
                  <Checks size={17} aria-hidden="true" /> Mark as read
                </DropdownMenuItem>
              ) : null}
            </DropdownMenuGroup>
            {room.kind === "direct" && room.peer ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() =>
                    block.mutate({
                      userId: room.peer!.id,
                      blocked: room.me.cannotPostReason !== "blocked",
                    })
                  }
                >
                  <Prohibit size={17} aria-hidden="true" />
                  {room.me.cannotPostReason === "blocked" ? "Unblock" : "Block"}
                </DropdownMenuItem>
              </>
            ) : null}
            {room.kind === "team" ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-red-500"
                  onClick={() => leave.mutate(room.id)}
                >
                  <SignOut size={17} aria-hidden="true" /> Exit group
                </DropdownMenuItem>
              </>
            ) : null}
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
        className="flex h-16 w-full cursor-pointer items-center gap-3 rounded-xl border-0 bg-transparent px-3 text-left text-(--text) hover:bg-(--chat-hover)"
      >
        <ChatAvatar name={p.name} url={p.avatarUrl} />
        <span className="min-w-0">
          <span className="block truncate text-[0.98rem]">{p.name}</span>
          <span className="block truncate text-[0.8rem] text-(--muted)">
            {note}
          </span>
        </span>
      </button>
    </li>
  );
  const heading = (text: string) => (
    <h3 className="m-0 px-4 pt-4 pb-1.5 text-[0.82rem] font-semibold text-(--accent-ink)">
      {text}
    </h3>
  );
  return (
    <div className="flex h-full min-h-0 flex-col">
      <ListPanelHeader title="New chat" onBack={onBack} />
      <SearchBox
        autoFocus
        value={search}
        onChange={setSearch}
        label="Search name"
        placeholder="Search name"
        onEscape={onBack}
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {candidates.isLoading ? <ChatListSkeleton /> : null}
        {candidates.data && candidates.data.staff.length > 0 ? (
          <>
            {heading("Teachers of your courses")}
            <ul className="m-0 list-none p-0">
              {candidates.data.staff.map((p) => person(p, "Instructor"))}
            </ul>
          </>
        ) : null}
        {candidates.data?.courses.map((course) => (
          <section key={course.courseId}>
            {heading(`Classmates · ${course.title}`)}
            {course.directAllowed ? (
              course.people.length > 0 ? (
                <ul className="m-0 list-none p-0">
                  {course.people.map((p) => person(p, "Learner"))}
                </ul>
              ) : (
                <p className="m-0 px-4 py-2 text-[0.84rem] text-(--muted)">
                  Nobody from this course has opened its group yet.
                </p>
              )
            ) : (
              <p className="m-0 px-4 py-2 text-[0.84rem] text-(--muted)">
                The instructor hasn’t turned on private chats between learners
                in this course.
              </p>
            )}
          </section>
        ))}
        {candidates.data &&
        candidates.data.staff.length === 0 &&
        candidates.data.courses.length === 0 ? (
          <p className="m-0 px-8 py-10 text-center text-[0.88rem] text-(--muted)">
            {search.trim()
              ? `Nobody called “${search.trim()}” you can message.`
              : "There’s nobody you can message yet. Join a course to chat with its teachers and classmates."}
          </p>
        ) : null}
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
      <ListPanelHeader title="Starred messages" onBack={onBack} />
      <ul className="m-0 flex min-h-0 flex-1 list-none flex-col gap-0.5 overflow-y-auto px-2 pb-4">
        {stars.isLoading ? <ChatListSkeleton /> : null}
        {messages.map((message) => (
          <li key={message.id}>
            <button
              type="button"
              onClick={() => onOpen(message.roomId, message.seq)}
              className="flex w-full cursor-pointer flex-col gap-1 rounded-xl border-0 bg-transparent px-4 py-3 text-left text-(--text) hover:bg-(--chat-hover)"
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
          <li className="px-8 py-12 text-center">
            <Star
              size={40}
              className="mx-auto text-(--muted)"
              aria-hidden="true"
            />
            <p className="m-0 mt-3 text-[0.88rem] text-(--muted)">
              Star a message from its menu to find it here later.
            </p>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
