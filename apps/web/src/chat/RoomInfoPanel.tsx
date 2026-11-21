import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ArrowLeft";
import { CameraIcon as Camera } from "@phosphor-icons/react/Camera";
import { ImageSquareIcon as ImageSquare } from "@phosphor-icons/react/ImageSquare";
import { TrashIcon as Trash } from "@phosphor-icons/react/Trash";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/CaretRight";
import { DotsThreeVerticalIcon as DotsThreeVertical } from "@phosphor-icons/react/DotsThreeVertical";
import { FlagIcon as Flag } from "@phosphor-icons/react/Flag";
import { PencilSimpleIcon as PencilSimple } from "@phosphor-icons/react/PencilSimple";
import { SpeakerSlashIcon as SpeakerSlash } from "@phosphor-icons/react/SpeakerSlash";
import { MagnifyingGlassIcon as MagnifyingGlass } from "@phosphor-icons/react/MagnifyingGlass";
import { useQueryClient } from "@tanstack/react-query";
import type { ChatRoomDetail } from "@veolms/contracts";
import { useRef, useState } from "react";

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
  useChatReports,
  useChatRestrictions,
  useRestrictMember,
  useSetHelper,
  storeRoomDetail,
  useStartDirect,
  useUpdateMyChatState,
  useChatProfile,
  useUpdateRoomSettings,
  type ChatThread,
} from "../services/chat";
import { ChatAvatar } from "./ChatAvatar";
import { roomAvatarUrl } from "./chatIcon";
import { squareIcon } from "./groupIcon";
import {
  chatIconButton,
  ChatSelect,
  DrawerHeader,
  ChatToggle as Toggle,
} from "./ChatControls";
import { ReportsView, RestrictedView } from "./ModerationViews";
import { RestrictDialog } from "./ChatDialogs";
import { ROLE_LABEL } from "./chatFormat";
import { VideoThumb } from "./VideoThumb";

const SLOW_MODES = [
  { label: "Off", seconds: 0 },
  { label: "10 seconds", seconds: 10 },
  { label: "30 seconds", seconds: 30 },
  { label: "1 minute", seconds: 60 },
  { label: "5 minutes", seconds: 300 },
];

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

const section = "border-b-8 border-solid border-(--chat-bg)";

export function RoomInfoPanel({
  room,
  viewerId,
  onClose,
  onOpenChat,
  onToast,
  onJumpTo,
}: {
  room: ChatRoomDetail;
  viewerId: string | null;
  onClose: () => void;
  onOpenChat: (roomId: string) => void;
  onToast: (message: string) => void;
  onJumpTo: (seq: number) => void;
}) {
  const client = useQueryClient();
  const [view, setView] = useState<"info" | "reports" | "restricted">("info");
  const [editingAbout, setEditingAbout] = useState<string | null>(null);
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
  const profile = useChatProfile();
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
  const moderator = isGroup && (room.me.canModerate || room.me.isHelper);
  const iconInputRef = useRef<HTMLInputElement>(null);
  // The chosen photo shows at once, with how much is uploaded, until the
  // server has it; then the group's own address takes over.
  const [iconPreview, setIconPreview] = useState<string | null>(null);
  const [iconProgress, setIconProgress] = useState<number | null>(null);
  async function changeIcon(picked: File) {
    const preview = URL.createObjectURL(picked);
    setIconPreview(preview);
    setIconProgress(0);
    try {
      const { file, ...size } = await squareIcon(picked);
      const { room: updated } = await chatService.setGroupIcon(
        room.id,
        file,
        size,
        setIconProgress,
      );
      storeRoomDetail(client, updated);
      onToast("Group icon changed.");
    } catch (error) {
      fail(error);
    } finally {
      setIconProgress(null);
      setIconPreview(null);
      URL.revokeObjectURL(preview);
    }
  }
  const reports = useChatReports(room.id, admin);
  const restricted = useChatRestrictions(room.id, moderator);
  const openReports = reports.data?.reports.length ?? 0;
  const restrictedCount = restricted.data?.restrictions.length ?? 0;

  if (view !== "info") {
    return (
      <aside
        aria-label={
          view === "reports" ? "Reported messages" : "Muted and removed"
        }
        className="flex h-full min-h-0 w-full flex-col bg-(--chat-panel)"
      >
        <div className="flex h-16 shrink-0 items-center gap-3 border-b border-solid border-(--chat-line) px-3">
          <button
            type="button"
            className={chatIconButton}
            onClick={() => setView("info")}
            aria-label="Back to group info"
          >
            <ArrowLeft size={20} />
          </button>
          <h2 className="m-0 text-[1.05rem] font-semibold text-(--text)">
            {view === "reports" ? "Reported messages" : "Muted and removed"}
          </h2>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {view === "reports" ? (
            <ReportsView
              roomId={room.id}
              onToast={onToast}
              onJumpTo={onJumpTo}
            />
          ) : (
            <RestrictedView roomId={room.id} onToast={onToast} />
          )}
        </div>
      </aside>
    );
  }

  return (
    <aside
      aria-label={isGroup ? "Group info" : "Contact info"}
      className="flex h-full min-h-0 w-full flex-col bg-(--chat-panel)"
    >
      <DrawerHeader
        title={isGroup ? "Group info" : "Contact info"}
        onClose={onClose}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div
          className={cn(
            section,
            "flex flex-col items-center px-6 py-6 text-center",
          )}
        >
          {admin ? (
            // Group admins (admins, the instructor, the course's creator)
            // change the icon; WhatsApp's camera on the group's picture.
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label="Change group icon"
                disabled={iconProgress !== null}
                className="group/icon relative cursor-pointer rounded-full border-0 bg-transparent p-0"
              >
                <ChatAvatar
                  name={room.title}
                  url={iconPreview ?? roomAvatarUrl(room)}
                  group
                  size="xl"
                />
                <span
                  className={cn(
                    "absolute inset-0 flex flex-col items-center justify-center gap-1 rounded-full bg-black/55 text-[0.7rem] font-semibold text-white transition-opacity group-hover/icon:opacity-100 group-focus-visible/icon:opacity-100",
                    iconProgress === null ? "opacity-0" : "opacity-100",
                  )}
                >
                  <Camera size={22} aria-hidden="true" />
                  {iconProgress === null
                    ? "Change icon"
                    : `Saving… ${Math.round(iconProgress * 100)}%`}
                </span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-52 min-w-0">
                <DropdownMenuItem onClick={() => iconInputRef.current?.click()}>
                  <ImageSquare size={17} aria-hidden="true" /> Upload photo
                </DropdownMenuItem>
                {room.customIcon ? (
                  <DropdownMenuItem
                    className="text-red-500"
                    onClick={() => patch({ iconUploadId: null })}
                  >
                    <Trash size={17} aria-hidden="true" />
                    {room.kind === "course"
                      ? "Use course picture"
                      : "Remove icon"}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <ChatAvatar
              name={room.title}
              url={roomAvatarUrl(room)}
              group={isGroup}
              size="xl"
            />
          )}
          <input
            ref={iconInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void changeIcon(file);
            }}
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

        {room.description || admin ? (
          <div className={cn(section, "px-6 py-4")}>
            <div className="flex items-center justify-between text-[0.8rem] text-(--muted)">
              Description
              {admin && editingAbout === null ? (
                <button
                  type="button"
                  onClick={() => setEditingAbout(room.description ?? "")}
                  aria-label="Edit description"
                  className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--chat-hover) hover:text-(--text)"
                >
                  <PencilSimple size={16} />
                </button>
              ) : null}
            </div>
            {editingAbout !== null ? (
              <div className="mt-1">
                <textarea
                  autoFocus
                  value={editingAbout}
                  maxLength={1000}
                  rows={4}
                  onChange={(e) => setEditingAbout(e.target.value)}
                  placeholder="Rules, links, class timings…"
                  className="w-full resize-y rounded-xl border-0 bg-(--chat-input) px-3 py-2 text-[0.9rem] text-(--text) outline-none focus-visible:outline-2 focus-visible:outline-(--accent)"
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingAbout(null)}
                    className="h-8 cursor-pointer rounded-full border-0 bg-transparent px-3 text-[0.82rem] font-semibold text-(--muted)"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      patch({ description: editingAbout.trim() || null });
                      setEditingAbout(null);
                    }}
                    className="h-8 cursor-pointer rounded-full border-0 bg-(--accent) px-4 text-[0.82rem] font-semibold text-(--on-accent)"
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <p className="m-0 mt-1 text-[0.9rem] whitespace-pre-wrap text-(--text)">
                {room.description || (
                  <span className="text-(--muted)">
                    Add rules, links or class timings for the group.
                  </span>
                )}
              </p>
            )}
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
                  className="block aspect-square overflow-hidden rounded-md bg-(--chat-input)"
                >
                  {a.kind === "image" ? (
                    <img
                      src={chatService.fileUrl(a)}
                      alt={a.name}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <VideoThumb
                      src={chatService.fileUrl(a)}
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
            note={
              room.me.mutedUntil && Date.parse(room.me.mutedUntil) > Date.now()
                ? `Muted until ${new Date(room.me.mutedUntil).toLocaleString(
                    undefined,
                    { weekday: "short", hour: "numeric", minute: "2-digit" },
                  )}.`
                : isGroup
                  ? "All messages, or only when someone @mentions you. Muted: no sound or notification."
                  : "New messages alert you, on all your devices."
            }
          >
            <ChatSelect<"all" | "mentions" | "none">
              ariaLabel="Notifications"
              value={room.me.notifyLevel}
              onValueChange={(level) =>
                myState.mutate(
                  { roomId: room.id, patch: { notifyLevel: level } },
                  { onError: fail },
                )
              }
              options={[
                ["all", "All messages"],
                ["mentions", "Mentions only"],
                ["none", "Muted"],
              ]}
            />
          </Row>
          {profile.data?.readReceiptsChoice ? (
            // Admins and instructors: whether this chat learns they read.
            <Row
              title="Read receipts"
              note={
                isGroup
                  ? "Off: you are not counted for blue ticks here and never shown as having read a message (unless you reply or react)."
                  : "Off: no blue ticks here, for either of you."
              }
            >
              <ChatSelect<"default" | "on" | "off">
                ariaLabel="Read receipts in this chat"
                value={
                  room.me.readReceipts === true
                    ? "on"
                    : room.me.readReceipts === false
                      ? "off"
                      : "default"
                }
                onValueChange={(choice) =>
                  myState.mutate(
                    {
                      roomId: room.id,
                      patch: {
                        readReceipts:
                          choice === "default" ? null : choice === "on",
                      },
                    },
                    { onError: fail },
                  )
                }
                options={[
                  [
                    "default",
                    `Default (${profile.data.readReceipts ? "on" : "off"})`,
                  ],
                  ["on", "On"],
                  ["off", "Off"],
                ]}
              />
            </Row>
          ) : null}
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
              <ChatSelect<"everyone" | "staff_only">
                ariaLabel="Who can send messages"
                value={room.postingPolicy}
                onValueChange={(policy) => patch({ postingPolicy: policy })}
                options={[
                  ["everyone", "All members"],
                  ["staff_only", "Only admins"],
                ]}
              />
            </Row>
            <Row
              title="Slow mode"
              note="Time each member waits between messages. Admins are exempt."
            >
              <ChatSelect
                ariaLabel="Slow mode"
                value={String(room.slowModeSeconds)}
                onValueChange={(value) =>
                  patch({ slowModeSeconds: Number(value) })
                }
                options={SLOW_MODES.map(
                  (m) => [String(m.seconds), m.label] as const,
                )}
              />
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
              title="Members can send files"
              note="Photos, videos, voice messages and documents."
            >
              <Toggle
                label="Members can send files"
                checked={room.attachmentsAllowed}
                onChange={(next) => patch({ attachmentsAllowed: next })}
              />
            </Row>
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

        {moderator ? (
          <div className={cn(section, "py-2")}>
            <h4 className="m-0 px-6 pt-2 pb-1 text-[0.8rem] font-semibold text-(--accent-ink)">
              Moderation
            </h4>
            {admin ? (
              <button
                type="button"
                onClick={() => setView("reports")}
                className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-6 py-3 text-left text-(--text) hover:bg-(--chat-hover)"
              >
                <Flag size={20} className="text-(--muted)" aria-hidden="true" />
                <span className="flex-1 text-[0.92rem]">Reported messages</span>
                {openReports > 0 ? (
                  <span className="min-w-5 rounded-full bg-red-500 px-1.5 text-center text-[0.72rem] leading-5 font-bold text-white">
                    {openReports}
                  </span>
                ) : null}
                <CaretRight
                  size={16}
                  className="text-(--muted)"
                  aria-hidden="true"
                />
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => setView("restricted")}
              className="flex w-full cursor-pointer items-center gap-4 border-0 bg-transparent px-6 py-3 text-left text-(--text) hover:bg-(--chat-hover)"
            >
              <SpeakerSlash
                size={20}
                className="text-(--muted)"
                aria-hidden="true"
              />
              <span className="flex-1 text-[0.92rem]">Muted and removed</span>
              {restrictedCount > 0 ? (
                <span className="text-[0.8rem] text-(--muted)">
                  {restrictedCount}
                </span>
              ) : null}
              <CaretRight
                size={16}
                className="text-(--muted)"
                aria-hidden="true"
              />
            </button>
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
            <label className="mx-4 mb-1 flex h-9 items-center gap-2 rounded-full bg-(--chat-input) px-3">
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
                            className="inline-flex size-8 cursor-pointer items-center justify-center rounded-full border-0 bg-transparent text-(--muted) hover:bg-(--chat-hover)"
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
