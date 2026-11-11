import "./chat.css";

import type { ChatMessage } from "@veolms/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { useQueryClient } from "@tanstack/react-query";

import { ToastNotification } from "../ToastNotification";
import { usePageSearchShortcut } from "../hooks/usePageSearchShortcut";
import { getApiError } from "../lib/api-error";
import { cn } from "../lib/utils";
import { useCurrentUser } from "../services/auth";
import {
  flushReceipts,
  isRoomMuted,
  prefetchChat,
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
import { MOBILE_NAV_KEEP_ATTRIBUTE } from "../shell/academyShellConstants";

/** Chats loaded ahead, from the top of the list. */
const WARM_CHATS = 6;

/** Runs `work` when the browser has a quiet moment; returns the cancel. */
function whenIdle(work: () => void): () => void {
  if ("requestIdleCallback" in window) {
    const id = window.requestIdleCallback(work, { timeout: 2_000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(work, 800);
  return () => clearTimeout(id);
}

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
  const queryClient = useQueryClient();
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
  // "Go to this message" from search, a report, a starred message or a link
  // (a notification's ?seq=): that chat opens at it, blinking.
  const [jump, setJump] = useState<{
    roomId: string;
    seq: number;
    token: number;
  } | null>(null);
  const jumpIn = useCallback(
    (inRoom: string, seq: number) =>
      setJump((current) => ({
        roomId: inRoom,
        seq,
        token: (current?.token ?? 0) + 1,
      })),
    [],
  );
  const jumpTo = (seq: number) => {
    if (roomId) jumpIn(roomId, seq);
  };
  const [searchParams, setSearchParams] = useSearchParams();
  const linkedSeq = Number(searchParams.get("seq"));
  useEffect(() => {
    if (!roomId || !Number.isInteger(linkedSeq) || linkedSeq <= 0) return;
    jumpIn(roomId, linkedSeq);
    // Once: a reload or Back does not jump again.
    setSearchParams(
      (params) => {
        params.delete("seq");
        return params;
      },
      { replace: true },
    );
  }, [roomId, linkedSeq, jumpIn, setSearchParams]);

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

  // While the browser is idle: the first chats of the list (the ones most
  // likely opened next) and the emoji panel, so opening either is instant.
  const warmedRef = useRef(false);
  useEffect(() => {
    if (warmedRef.current || !rooms.data) return;
    warmedRef.current = true;
    const ids = rooms.data.rooms
      .filter((room) => !room.me.archived)
      .slice(0, WARM_CHATS)
      .map((room) => room.id);
    return whenIdle(() => {
      for (const id of ids) prefetchChat(queryClient, id);
      void import("emoji-picker-react");
    });
  }, [rooms.data, queryClient]);

  const open = useCallback(
    (id: string | null) => {
      void flushReceipts();
      navigate(id ? `/chat/${id}` : "/chat");
    },
    [navigate],
  );

  // "Info" from a profile photo: open the chat with its info showing.
  const infoForRef = useRef<string | null>(null);
  useEffect(() => {
    if (roomId && infoForRef.current === roomId) {
      setDrawer({ kind: "info" });
    } else {
      setDrawer(null);
    }
    infoForRef.current = null;
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
        // The shortcut mutes for good, or unmutes (the menus offer 8 hours
        // and a week).
        patch: { muteFor: isRoomMuted(current.me) ? "off" : "always" },
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
        onOpenInfo={(id) => {
          if (id === roomId) {
            setDrawer({ kind: "info" });
            return;
          }
          infoForRef.current = id;
          open(id);
        }}
        onStartDirect={startChatWith}
        onJumpToMessage={(id, seq) => {
          setPanel("chats");
          jumpIn(id, seq);
          open(id);
        }}
        onShowShortcuts={() => setShortcutsOpen(true)}
        onToast={setToast}
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
        // Phones: a fixed screen down to the bottom bar (58 px + the safe
        // area), so nothing scrolls behind it, as in WhatsApp.
        "max-[640px]:fixed max-[640px]:inset-x-0 max-[640px]:top-0 max-[640px]:bottom-[calc(58px+var(--app-viewport-safe-area-max-bottom,0px))]",
        // An open chat covers the bar too (the bar is z-140): this screen is
        // a stacking context of its own, so its full-screen chat and drawers
        // only rise above the bar when the screen does.
        roomId && "max-[640px]:z-150",
      )}
      // On a phone this screen stops at the bottom menu's top edge (or an
      // open chat covers it), so its scrolling must not hide the menu: that
      // left an empty band under the list once a chat was closed.
      {...{ [MOBILE_NAV_KEEP_ATTRIBUTE]: "" }}
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
            jumpRequest={jump?.roomId === current.id ? jump : null}
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
