import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { XIcon as X } from "@phosphor-icons/react/X";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatRoomDetail } from "@veolms/contracts";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import {
  chatKeys,
  chatService,
  useChatMembers,
  useRestrictMember,
  useSetHelper,
  useStartDirect,
  useUpdateMyChatState,
  useUpdateRoomSettings,
  type ChatThread,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { RestrictDialog } from "./ChatDialogs";
import { ROLE_LABEL } from "./chatFormat";

const SLOW_MODES = [
  { label: "Off", seconds: 0 },
  { label: "10 seconds", seconds: 10 },
  { label: "30 seconds", seconds: 30 },
  { label: "1 minute", seconds: 60 },
  { label: "5 minutes", seconds: 300 },
];

function Toggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-6 w-10.5 shrink-0 cursor-pointer rounded-full border-0 transition-colors",
        checked ? "bg-(--accent)" : "bg-(--border-strong)",
      )}
    >
      <span
        className={cn(
          "absolute top-0.75 size-4.5 rounded-full bg-white transition-[left]",
          checked ? "left-5.25" : "left-0.75",
        )}
      />
    </button>
  );
}

function Row({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-4 px-6 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-[0.92rem] text-(--text)">{title}</div>
        {note ? (
          <div className="text-[0.76rem] leading-snug text-(--muted)">
            {note}
          </div>
        ) : null}
      </div>
      {children}
    </div>
  );
}

const section = "border-b-8 border-solid border-(--canvas)";
const select =
  "h-9 rounded-lg border border-solid border-(--border-strong) bg-(--surface-strong) px-2 text-[0.84rem] text-(--text)";

export function RoomInfoPanel({
  room,
  viewerId,
  onClose,
  onOpenChat,
  onToast,
}: {
  room: ChatRoomDetail;
  viewerId: string | null;
  onClose: () => void;
  onOpenChat: (roomId: string) => void;
  onToast: (message: string) => void;
}) {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [restricting, setRestricting] = useState<{
    id: string;
    name: string;
    mode: "mute" | "ban";
  } | null>(null);
  const members = useChatMembers(
    room.kind === "direct" ? null : room.id,
    search.trim(),
  );
  const settings = useUpdateRoomSettings();
  const myState = useUpdateMyChatState();
  const setHelper = useSetHelper();
  const restrict = useRestrictMember();
  const startDirect = useStartDirect();
  const fail = (error: unknown) => onToast(getApiError(error).message);
  const isGroup = room.kind !== "direct";
  const admin = room.me.canModerate && isGroup;
  const thread = client.getQueryData<ChatThread>(chatKeys.messages(room.id));
  const media = (thread?.messages ?? [])
    .flatMap((m) => m.attachments)
    .filter((a) => a.kind === "image" || a.kind === "video")
    .slice(-6)
    .reverse();

  const patch = (change: Parameters<typeof chatService.updateSettings>[1]) =>
    settings.mutate({ roomId: room.id, patch: change }, { onError: fail });

  return (
    <aside
      aria-label={isGroup ? "Group info" : "Contact info"}
      className="flex h-full min-h-0 w-full flex-col bg-(--surface)"
    >
      <div className="flex h-16 shrink-0 items-center gap-4 border-b border-solid border-(--border) px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="inline-flex size-9 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--hover)"
        >
          <X size={20} />
        </button>
        <h2 className="m-0 text-[1rem] font-semibold text-(--text)">
          {isGroup ? "Group info" : "Contact info"}
        </h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            section,
            "flex flex-col items-center px-6 py-6 text-center",
          )}
        >
          <ChatAvatar
            name={room.title}
            url={room.peer?.avatarUrl ?? null}
            group={isGroup}
            size="xl"
          />
          <h3 className="m-0 mt-3 text-[1.2rem] font-semibold text-(--text)">
            {room.title}
          </h3>
          <p className="m-0 mt-1 text-[0.86rem] text-(--muted)">
            {isGroup
              ? `${room.kind === "course" ? "Course group" : "Team group"}${room.memberCount ? ` · ${room.memberCount.toLocaleString()} members` : ""}`
              : (room.peer && ROLE_LABEL[room.peer.role]) || "Learner"}
          </p>
        </div>

        {room.description ? (
          <div className={cn(section, "px-6 py-4")}>
            <div className="text-[0.8rem] text-(--muted)">Description</div>
            <p className="m-0 mt-1 text-[0.9rem] whitespace-pre-wrap text-(--text)">
              {room.description}
            </p>
          </div>
        ) : null}

        {media.length > 0 ? (
          <div className={cn(section, "px-6 py-4")}>
            <div className="mb-2 text-[0.8rem] text-(--muted)">Media</div>
            <div className="grid grid-cols-3 gap-1">
              {media.map((a) => (
                <a
                  key={a.id}
                  href={chatService.fileUrl(a)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block aspect-square overflow-hidden rounded-md bg-(--surface-strong)"
                >
                  {a.kind === "image" ? (
                    <img
                      src={chatService.fileUrl(a)}
                      alt={a.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <video
                      src={chatService.fileUrl(a)}
                      preload="metadata"
                      muted
                      className="size-full object-cover"
                    />
                  )}
                </a>
              ))}
            </div>
          </div>
        ) : null}

        <div className={section}>
          <Row
            title="Notifications"
            note="Group messages only raise the unread count; @mentions notify you."
          >
            <select
              aria-label="Notifications"
              className={select}
              value={room.me.notifyLevel}
              onChange={(e) =>
                myState.mutate(
                  {
                    roomId: room.id,
                    patch: {
                      notifyLevel: e.target.value as
                        "all" | "mentions" | "none",
                    },
                  },
                  { onError: fail },
                )
              }
            >
              <option value="all">All</option>
              <option value="mentions">Mentions only</option>
              <option value="none">Muted</option>
            </select>
          </Row>
        </div>

        {admin ? (
          <div className={section}>
            <h4 className="m-0 px-6 pt-4 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              Group settings
            </h4>
            <Row
              title="Send messages"
              note="Only admins: an announcement group."
            >
              <select
                aria-label="Who can send messages"
                className={select}
                value={room.postingPolicy}
                onChange={(e) =>
                  patch({
                    postingPolicy: e.target.value as "everyone" | "staff_only",
                  })
                }
              >
                <option value="everyone">All members</option>
                <option value="staff_only">Only admins</option>
              </select>
            </Row>
            <Row
              title="Slow mode"
              note="Time each member waits between messages. Admins are exempt."
            >
              <select
                aria-label="Slow mode"
                className={select}
                value={room.slowModeSeconds}
                onChange={(e) =>
                  patch({ slowModeSeconds: Number(e.target.value) })
                }
              >
                {SLOW_MODES.map((m) => (
                  <option key={m.seconds} value={m.seconds}>
                    {m.label}
                  </option>
                ))}
              </select>
            </Row>
            {room.kind === "course" ? (
              <Row
                title="Members can message each other"
                note="Private chats between classmates, starting as requests."
              >
                <Toggle
                  label="Members can message each other"
                  checked={room.directMessagesAllowed}
                  onChange={(next) => patch({ directMessagesAllowed: next })}
                />
              </Row>
            ) : null}
            <Row
              title="Lock group"
              note="Nobody can send messages. For finished batches."
            >
              <Toggle
                label="Lock group"
                checked={room.status === "locked"}
                onChange={(next) =>
                  patch({ status: next ? "locked" : "active" })
                }
              />
            </Row>
          </div>
        ) : null}

        {isGroup ? (
          <div className="pb-6">
            <div className="flex items-center justify-between px-6 pt-4 pb-2 text-[0.8rem] text-(--muted)">
              <span>
                {members.data?.pages[0]?.total != null
                  ? `${members.data.pages[0].total.toLocaleString()} members`
                  : "Members"}
              </span>
            </div>
            <label className="mx-4 mb-1 flex h-9 items-center gap-2 rounded-full bg-(--surface-strong) px-3">
              <MagnifyingGlass
                size={15}
                className="text-(--muted)"
                aria-hidden="true"
              />
              <span className="sr-only">Search members</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search members"
                className="min-w-0 flex-1 border-0 bg-transparent text-[0.85rem] text-(--text) outline-none placeholder:text-(--muted)"
              />
            </label>
            <ul className="m-0 list-none p-0">
              {(members.data?.pages ?? [])
                .flatMap((page) => page.members)
                .map((member) => {
                  const isMe = member.id === viewerId;
                  const canAct = admin && !isMe && !member.isAdmin;
                  return (
                    <li
                      key={member.id}
                      className="flex items-center gap-3 px-6 py-2"
                    >
                      <ChatAvatar
                        name={member.name}
                        url={member.avatarUrl}
                        size="md"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[0.92rem] text-(--text)">
                          {isMe ? "You" : member.name}
                        </div>
                        <div className="truncate text-[0.74rem] text-(--muted)">
                          {ROLE_LABEL[member.role] ?? "Learner"}
                        </div>
                      </div>
                      {member.isAdmin ? (
                        <span className="rounded-md bg-(--accent-soft) px-2 py-0.5 text-[0.7rem] font-semibold text-(--accent-ink)">
                          Group admin
                        </span>
                      ) : member.isHelper ? (
                        <span className="rounded-md bg-[color-mix(in_srgb,#22c55e_16%,transparent)] px-2 py-0.5 text-[0.7rem] font-semibold text-[#15803d] [:root[data-theme=dark]_&]:text-[#86efac]">
                          Helper
                        </span>
                      ) : null}
                      {!isMe ? (
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            aria-label={`Options for ${member.name}`}
                            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--hover)"
                          >
                            <DotsThreeVertical size={18} weight="bold" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent className="w-56 min-w-0">
                            <DropdownMenuItem
                              onClick={() =>
                                startDirect.mutate(member.id, {
                                  onSuccess: ({ room: r }) => onOpenChat(r.id),
                                  onError: fail,
                                })
                              }
                            >
                              Message {member.name.split(" ")[0]}
                            </DropdownMenuItem>
                            {canAct && room.kind === "course" ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setHelper.mutate(
                                    {
                                      roomId: room.id,
                                      userId: member.id,
                                      helper: !member.isHelper,
                                    },
                                    { onError: fail },
                                  )
                                }
                              >
                                {member.isHelper
                                  ? "Remove as helper"
                                  : "Make helper"}
                              </DropdownMenuItem>
                            ) : null}
                            {canAct ||
                            (room.me.isHelper && member.role === "learner") ? (
                              <DropdownMenuItem
                                onClick={() =>
                                  setRestricting({
                                    id: member.id,
                                    name: member.name,
                                    mode: "mute",
                                  })
                                }
                              >
                                Mute in this group…
                              </DropdownMenuItem>
                            ) : null}
                            {canAct ? (
                              <DropdownMenuItem
                                className="text-red-500"
                                onClick={() =>
                                  setRestricting({
                                    id: member.id,
                                    name: member.name,
                                    mode: "ban",
                                  })
                                }
                              >
                                Remove from group…
                              </DropdownMenuItem>
                            ) : null}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      ) : null}
                    </li>
                  );
                })}
            </ul>
            {members.hasNextPage ? (
              <button
                type="button"
                onClick={() => void members.fetchNextPage()}
                className="mx-6 mt-2 cursor-pointer border-0 bg-transparent text-[0.86rem] font-semibold text-(--accent-ink)"
              >
                Show more
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {restricting ? (
        <RestrictDialog
          name={restricting.name}
          mode={restricting.mode}
          helperOnly={!room.me.canModerate && room.me.isHelper}
          canRestrictEverywhere={room.me.canModerate}
          onClose={() => setRestricting(null)}
          onSubmit={(input) => {
            restrict.mutate(
              {
                userId: restricting.id,
                roomId: input.everywhere ? null : room.id,
                type: restricting.mode,
                durationMinutes: input.durationMinutes,
                reason: input.reason,
              },
              {
                onSuccess: () => {
                  onToast(
                    `${restricting.name} was ${restricting.mode === "mute" ? "muted" : "removed"}.`,
                  );
                  void client.invalidateQueries({
                    queryKey: [...chatKeys.all, "members", room.id],
                  });
                },
                onError: fail,
              },
            );
            setRestricting(null);
          }}
        />
      ) : null}
    </aside>
  );
}
