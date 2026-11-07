import "./chat.css";

import { ChatsCircleIcon as ChatsCircle } from "@phosphor-icons/react/ChatsCircle";
import { UsersThreeIcon as UsersThree } from "@phosphor-icons/react/UsersThree";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ToastNotification } from "../ToastNotification";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useCurrentUser } from "../services/auth";
import {
  flushReceipts,
  useChatRoom,
  useChatRooms,
  useChatStream,
  useStartDirect,
  useUpdateMyChatState,
} from "../services/chat";
import { CourseGroupsDialog, ShortcutsDialog } from "./ChatExtras";
import { ChatList, type ListPanel } from "./ChatList";
import { ChatThreadSkeleton } from "./ChatSkeletons";
import { Conversation } from "./Conversation";
import { RoomInfoPanel } from "./RoomInfoPanel";
import { useChatShortcuts } from "./useChatShortcuts";

/**
 * Chats, laid out like WhatsApp Web inside the app shell.
 *
 * Width comes from the main area, not the window (the sidebar may be 76 to
 * 300 px wide), so the panes follow container queries:
 * - under 720 px: one pane at a time (list, or the open chat; on phones the
 *   open chat covers the screen like WhatsApp's mobile app);
 * - from 720 px: list (340–400 px) beside the chat;
 * - from 1180 px: group info docks as a third column, else it slides over.
 */
export function ChatPage() {
  const { roomId = null } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const viewerId = me.data?.id ?? null;
  const isStaff = (me.data?.roles ?? []).some((role) => role !== "student");
  useChatStream(viewerId, Boolean(viewerId));
  usePageSearchShortcut("chat-search");

  const rooms = useChatRooms(Boolean(viewerId));
  const room = useChatRoom(roomId);
  const startDirect = useStartDirect();
  const myState = useUpdateMyChatState();
  const [panel, setPanel] = useState<ListPanel>("chats");
  const [infoOpen, setInfoOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [focusComposer, setFocusComposer] = useState(0);

  const open = useCallback(
    (id: string | null) => {
      void flushReceipts();
      navigate(id ? `/chat/${id}` : "/chat");
    },
    [navigate],
  );

  useEffect(() => {
    setInfoOpen(false);
  }, [roomId]);

  const list = rooms.data?.rooms ?? [];
  const ordered = list.filter((r) => r.me.archived === (panel === "archived"));
  const current = room.data;

  function step(delta: number) {
    if (ordered.length === 0) return;
    const index = ordered.findIndex((r) => r.id === roomId);
    const next = ordered[(index + delta + ordered.length) % ordered.length];
    if (next) open(next.id);
  }

  useChatShortcuts({
    newChat: () => setPanel("new"),
    previousChat: () => step(-1),
    nextChat: () => step(1),
    info: () => current && setInfoOpen((v) => !v),
    archive: () =>
      current &&
      myState.mutate({
        roomId: current.id,
        patch: { archived: !current.me.archived },
      }),
    mute: () =>
      current &&
      myState.mutate({
        roomId: current.id,
        patch: {
          notifyLevel: current.me.notifyLevel === "none" ? "all" : "none",
        },
      }),
    pin: () =>
      current &&
      myState.mutate({
        roomId: current.id,
        patch: { pinned: !current.me.pinned },
      }),
    escape: () => {
      if (infoOpen) {
        setInfoOpen(false);
        return true;
      }
      if (panel !== "chats") {
        setPanel("chats");
        return true;
      }
      if (roomId) {
        open(null);
        return true;
      }
      return false;
    },
    typeIntoComposer: () => {
      // Synchronously, so this very key lands in the box.
      if (roomId) {
        document
          .getElementById("chat-composer")
          ?.focus({ preventScroll: true });
        setFocusComposer((n) => n + 1);
      }
    },
  });

  function startChatWith(userId: string) {
    startDirect.mutate(userId, {
      onSuccess: ({ room: direct }) => {
        setPanel("chats");
        open(direct.id);
      },
      onError: (error) => setToast(getApiError(error).message),
    });
  }

  return (
    <div
      className={cn(
        "@container/chat relative flex h-[calc(100dvh-72px)] min-h-120 overflow-hidden rounded-[14px] bg-(--surface) text-(--text)",
        "max-[640px]:h-[calc(100dvh-84px)] max-[640px]:rounded-none",
      )}
    >
      <div
        className={cn(
          "h-full w-full shrink-0 flex-col border-r border-solid border-(--border) @[720px]/chat:flex @[720px]/chat:w-85 @[1080px]/chat:w-100",
          roomId ? "hidden" : "flex",
        )}
      >
        <ChatList
          rooms={rooms.data?.rooms}
          loading={rooms.isLoading}
          requestsCount={rooms.data?.requestsCount ?? 0}
          selectedId={roomId}
          viewerId={viewerId}
          panel={panel}
          onPanel={setPanel}
          onSelect={(id) => open(id)}
          onStartDirect={startChatWith}
          onJumpToMessage={(id) => {
            setPanel("chats");
            open(id);
          }}
          onShowShortcuts={() => setShortcutsOpen(true)}
        />
        {isStaff ? (
          <button
            type="button"
            onClick={() => setGroupsOpen(true)}
            className="m-3 mt-0 inline-flex h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-full border border-solid border-(--accent-border) bg-transparent text-[0.86rem] font-semibold text-(--accent-ink) hover:bg-(--hover)"
          >
            <UsersThree size={17} aria-hidden="true" /> Course groups
          </button>
        ) : null}
      </div>

      <div
        className={cn(
          "min-w-0 flex-1",
          roomId ? "flex" : "hidden @[720px]/chat:flex",
          // Phones: the open chat covers the screen, as in WhatsApp's app.
          roomId && "max-[640px]:fixed max-[640px]:inset-0 max-[640px]:z-200",
        )}
      >
        {roomId && current ? (
          <Conversation
            key={current.id}
            room={current}
            viewerId={viewerId}
            onBack={() => open(null)}
            onOpenInfo={() => setInfoOpen(true)}
            onOpenChat={(id) => open(id)}
            onToast={setToast}
            focusComposerToken={focusComposer}
          />
        ) : roomId && room.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-(--canvas) p-8 text-center text-(--muted)">
            <p className="m-0">{getApiError(room.error).message}</p>
            <button
              type="button"
              onClick={() => open(null)}
              className="cursor-pointer border-0 bg-transparent font-semibold text-(--accent-ink) underline"
            >
              Back to chats
            </button>
          </div>
        ) : roomId ? (
          <div className="relative flex flex-1 flex-col bg-(--canvas)">
            <div className="h-16 border-b border-solid border-(--border) bg-(--surface)" />
            <ChatThreadSkeleton />
          </div>
        ) : (
          <div className="relative flex flex-1 flex-col items-center justify-center gap-4 border-b-4 border-solid border-(--accent) bg-(--canvas) p-10 text-center">
            <div className="chat-wallpaper" aria-hidden="true" />
            <ChatsCircle
              size={72}
              weight="duotone"
              className="relative text-(--accent)"
              aria-hidden="true"
            />
            <h2 className="relative m-0 text-2xl font-light text-(--text)">
              Chats
            </h2>
            <p className="relative m-0 max-w-md text-[0.9rem] text-(--muted)">
              Talk with your course groups, classmates and teachers. Pick a chat
              on the left, or start a new one.
            </p>
          </div>
        )}
      </div>

      {roomId && current && infoOpen ? (
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-30 flex w-full border-l border-solid border-(--border) shadow-[-8px_0_24px_rgb(0_0_0/0.18)]",
            "@[720px]/chat:w-95 @[1180px]/chat:static @[1180px]/chat:w-90 @[1180px]/chat:shrink-0 @[1180px]/chat:shadow-none",
            "max-[640px]:fixed max-[640px]:z-210",
          )}
        >
          <RoomInfoPanel
            room={current}
            viewerId={viewerId}
            onClose={() => setInfoOpen(false)}
            onOpenChat={(id) => open(id)}
            onToast={setToast}
          />
        </div>
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />
      ) : null}
      {groupsOpen ? (
        <CourseGroupsDialog
          rooms={list}
          onClose={() => setGroupsOpen(false)}
          onToast={setToast}
          onOpened={(id) => {
            setGroupsOpen(false);
            void rooms.refetch();
            open(id);
          }}
        />
      ) : null}
      <ToastNotification message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
