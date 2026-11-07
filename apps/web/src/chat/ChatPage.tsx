import "./chat.css";

import type { ChatMessage } from "@veolms/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { ToastNotification } from "../ToastNotification";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useCurrentUser } from "../services/auth";
import {
  flushReceipts,
  syncWithRoomList,
  useChatRoom,
  useChatRooms,
  useChatStream,
  useStartDirect,
  useUpdateMyChatState,
} from "../services/chat";
import { ShortcutsDialog } from "./ChatExtras";
import { ChatHome } from "./ChatHome";
import { ChatList, type ListPanel } from "./ChatList";
import { ChatSettingsPanel } from "./ChatSettingsPanel";
import { ChatThreadSkeleton } from "./ChatSkeletons";
import { CHAT_THEME } from "./chatTheme";
import { Conversation } from "./Conversation";
import { CourseGroupsPanel } from "./CourseGroupsPanel";
import { MessageInfoPanel } from "./MessageInfoPanel";
import { MessageSearchPanel } from "./MessageSearchPanel";
import { RoomInfoPanel } from "./RoomInfoPanel";
import { useChatListWidth } from "./useChatListWidth";
import { useChatPrefs } from "../store/chatPrefs.store";
import { CHAT_TEXT_SIZES, CHAT_WALLPAPERS } from "./chatWallpapers";
import { useChatShortcuts } from "./useChatShortcuts";

type Drawer =
  | { kind: "info" }
  | { kind: "search" }
  | { kind: "message"; message: ChatMessage };

/**
 * Chats, laid out like WhatsApp Web and filling the app's main area edge
 * to edge (the shell's padding is taken off while this page is open; see
 * chat.css).
 *
 * Width comes from the main area, not the window (the sidebar may be 76 to
 * 300 px wide), so the panes follow container queries:
 * - under 720 px: one pane at a time (list, or the open chat; on phones the
 *   open chat covers the screen like WhatsApp's mobile app);
 * - from 720 px: the list (30%, dragged wider or narrower on its edge and
 *   remembered) beside the chat;
 * - from 1180 px: group info and message info dock as a third column,
 *   narrower screens slide them over the chat.
 */
export function ChatPage() {
  const { roomId = null } = useParams<{ roomId?: string }>();
  const navigate = useNavigate();
  const me = useCurrentUser();
  const viewerId = me.data?.id ?? null;
  const isStaff = (me.data?.roles ?? []).some((role) => role !== "student");
  useChatStream(viewerId, Boolean(viewerId));
  usePageSearchShortcut("chat-search");

  const areaRef = useRef<HTMLDivElement>(null);
  const { width: listWidth, handleProps } = useChatListWidth(areaRef);
  const rooms = useChatRooms(Boolean(viewerId));
  const room = useChatRoom(roomId);
  const startDirect = useStartDirect();
  const myState = useUpdateMyChatState();
  const [panel, setPanel] = useState<ListPanel>("chats");
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [focusComposer, setFocusComposer] = useState(0);
  // "Go to this message" from search or a report: the open chat jumps.
  const [jump, setJump] = useState<{ seq: number; token: number } | null>(null);
  const jumpTo = (seq: number) =>
    setJump((current) => ({ seq, token: (current?.token ?? 0) + 1 }));

  const prefs = useChatPrefs();
  // The shell's padding comes off while Chats is open (chat.css).
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-chat-page", "");
    return () => root.removeAttribute("data-chat-page");
  }, []);

  // Messages the stream did not carry, and chats it does not cover yet.
  useEffect(() => {
    if (rooms.data) syncWithRoomList(rooms.data.rooms);
  }, [rooms.data]);

  const open = useCallback(
    (id: string | null) => {
      void flushReceipts();
      navigate(id ? `/chat/${id}` : "/chat");
    },
    [navigate],
  );

  useEffect(() => {
    setDrawer(null);
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
    info: () =>
      current &&
      setDrawer((d) => (d?.kind === "info" ? null : { kind: "info" })),
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
      if (drawer) {
        setDrawer(null);
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

  const back = () => setPanel("chats");
  const listPanel =
    panel === "settings" ? (
      <ChatSettingsPanel
        onBack={back}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onToast={setToast}
      />
    ) : panel === "groups" && isStaff ? (
      <CourseGroupsPanel
        rooms={list}
        onBack={back}
        onToast={setToast}
        onOpen={(id) => {
          setPanel("chats");
          open(id);
        }}
      />
    ) : (
      <ChatList
        rooms={rooms.data?.rooms}
        loading={rooms.isLoading}
        requestsCount={rooms.data?.requestsCount ?? 0}
        selectedId={roomId}
        viewerId={viewerId}
        isStaff={isStaff}
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
    );

  return (
    <div
      ref={areaRef}
      className={cn(
        CHAT_THEME,
        "@container/chat relative flex overflow-hidden bg-(--chat-panel) text-(--text)",
        // Fills the shell's main area (its padding is off, see chat.css).
        "min-[641px]:absolute min-[641px]:inset-0",
        "max-[640px]:h-[calc(100dvh-84px)]",
      )}
      // Settings › Chats: wallpaper, its pattern and the text size.
      data-chat-pattern={prefs.pattern}
      style={
        {
          "--chat-list-w": `${listWidth}px`,
          "--chat-wall": CHAT_WALLPAPERS[prefs.wallpaper].value,
          "--chat-text": CHAT_TEXT_SIZES[prefs.textSize].size,
        } as React.CSSProperties
      }
    >
      <div
        className={cn(
          "relative h-full w-full shrink-0 flex-col border-solid border-(--chat-line) bg-(--chat-panel) @[720px]/chat:flex @[720px]/chat:w-(--chat-list-w) @[720px]/chat:border-r",
          roomId ? "hidden" : "flex",
        )}
      >
        {listPanel}
        <div
          {...handleProps}
          title="Drag to resize · double-click to reset"
          className="absolute inset-y-0 -right-1.5 z-20 hidden w-3 cursor-col-resize touch-none outline-none @[720px]/chat:block [&:focus-visible>span]:bg-(--accent) [&:hover>span]:bg-(--accent)"
        >
          <span
            aria-hidden="true"
            className="absolute inset-y-0 left-1.25 w-0.5 bg-transparent transition-colors"
          />
        </div>
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
            onOpenInfo={() => setDrawer({ kind: "info" })}
            onOpenMessageInfo={(message) =>
              setDrawer({ kind: "message", message })
            }
            onOpenSearch={() => setDrawer({ kind: "search" })}
            jumpRequest={jump}
            onOpenChat={(id) => open(id)}
            onToast={setToast}
            focusComposerToken={focusComposer}
          />
        ) : roomId && room.isError ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-(--chat-bg) p-8 text-center text-(--muted)">
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
          <div className="relative flex flex-1 flex-col bg-(--chat-bg)">
            <div className="h-16 border-b border-solid border-(--chat-line) bg-(--chat-panel)" />
            <ChatThreadSkeleton />
          </div>
        ) : (
          <ChatHome
            isStaff={isStaff}
            onNewChat={() => setPanel("new")}
            onStarred={() => setPanel("starred")}
            onSettings={() => setPanel("settings")}
            onCourseGroups={() => setPanel("groups")}
          />
        )}
      </div>

      {roomId && current && drawer ? (
        <div
          className={cn(
            "absolute inset-y-0 right-0 z-30 flex w-full border-l border-solid border-(--chat-line) shadow-[-8px_0_24px_rgb(0_0_0/0.18)]",
            "@[720px]/chat:w-95 @[1180px]/chat:static @[1180px]/chat:w-[clamp(340px,30%,440px)] @[1180px]/chat:shrink-0 @[1180px]/chat:shadow-none",
            "max-[640px]:fixed max-[640px]:z-210",
          )}
        >
          {drawer.kind === "info" ? (
            <RoomInfoPanel
              room={current}
              viewerId={viewerId}
              onClose={() => setDrawer(null)}
              onOpenChat={(id) => open(id)}
              onToast={setToast}
              onJumpTo={jumpTo}
            />
          ) : drawer.kind === "search" ? (
            <MessageSearchPanel
              roomId={current.id}
              onClose={() => setDrawer(null)}
              onJumpTo={jumpTo}
            />
          ) : (
            <MessageInfoPanel
              roomId={current.id}
              message={drawer.message}
              isDirect={current.kind === "direct"}
              onClose={() => setDrawer(null)}
            />
          )}
        </div>
      ) : null}

      {shortcutsOpen ? (
        <ShortcutsDialog onClose={() => setShortcutsOpen(false)} />
      ) : null}
      <ToastNotification message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
