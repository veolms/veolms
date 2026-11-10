import type { QueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  ChatRoomSummary,
  ChatStreamGroupReadEvent,
  ChatStreamPresenceEvent,
  ChatStreamReadEvent,
  ChatStreamReadyEvent,
  ChatStreamTypingEvent,
} from "@veolms/contracts";

import { setChatStreamCarriesNotifications } from "../../lib/tabLiveStream";
import { getChatPrefs } from "../../store/chatPrefs.store";
import { notificationKeys } from "../notifications";
import {
  applyGroupRead,
  applyMessages,
  applyPresence,
  applyReceipt,
  applyToRoomList,
  type ChatThread,
} from "./chat.cache";
import { chatKeys } from "./chat.keys";
import { restoreChatCache, startChatCachePersistence } from "./chat.persist";
import { queueReceipt } from "./chat.receipts";
import { chatService } from "./chat.service";

/**
 * Live chat over Server-Sent Events (GET /chat/stream), one per tab while a
 * chat screen is open. Events go straight into the query cache.
 *
 * Nothing depends on an event arriving: messages carry gapless numbers, so
 * a gap, a reconnect (`ready`) or `resync` fetches what was missed with
 * GET .../changes?since=. The stream closes 2 minutes after the tab is
 * hidden and reopens when it is shown (CHAT_ROOM_PLAN §14.3), except while
 * desktop notifications are on: then it stays open so they keep coming, as
 * on WhatsApp Web.
 */

const HIDDEN_GRACE_MS = 2 * 60_000;
const REFUSED_RETRY_MIN_MS = 5_000;
const REFUSED_RETRY_MAX_MS = 5 * 60_000;
const TYPING_SHOW_MS = 5_000;

let users = 0;
let client: QueryClient | null = null;
let viewer: string | null = null;
let source: EventSource | null = null;
let readyBefore = false;
let hiddenTimer: ReturnType<typeof setTimeout> | undefined;
let retryTimer: ReturnType<typeof setTimeout> | undefined;
let retryDelay = REFUSED_RETRY_MIN_MS;
let live = false;
let stopPersisting: (() => void) | undefined;
const liveListeners = new Set<() => void>();

/** The chats this tab's stream carries (from `ready`, then added/removed). */
const streamRooms = new Set<string>();
/** Chats a reconnect was already tried for: never loop on one. */
const reconnectTried = new Set<string>();
const RECONNECT_GAP_MS = 30_000;
/** "Delivered" already reported per chat, so a list refresh does not repeat it. */
const deliveredSent = new Map<string, number>();
let lastReconnectAt = 0;

/** Opens a chat link in the app (set by useChatStream); else a page load. */
let openLink: ((path: string) => void) | null = null;
export function setChatLinkOpener(opener: ((path: string) => void) | null) {
  openLink = opener;
}

/** Desktop notifications turned on here and allowed by the browser. */
function desktopAlertsOn() {
  return (
    getChatPrefs().desktopAlerts &&
    typeof Notification !== "undefined" &&
    Notification.permission === "granted"
  );
}

/** Chats on screen right now: their new messages are read, not unread. */
const visibleRooms = new Set<string>();

export function setChatOnScreen(roomId: string, onScreen: boolean) {
  if (onScreen) visibleRooms.add(roomId);
  else visibleRooms.delete(roomId);
}

function setLive(next: boolean) {
  if (live === next) return;
  live = next;
  setChatStreamCarriesNotifications(next);
  for (const listener of liveListeners) listener();
}

export function isChatStreamLive() {
  return live;
}

export function subscribeChatStreamLive(listener: () => void) {
  liveListeners.add(listener);
  return () => liveListeners.delete(listener);
}

// ------------------------------------------------------------------ typing
const typing = new Map<string, Map<string, { name: string; until: number }>>();
const typingListeners = new Set<() => void>();
let typingSnapshot = new Map<string, string[]>();

function publishTyping() {
  const now = Date.now();
  const next = new Map<string, string[]>();
  for (const [roomId, people] of typing) {
    const names = [...people.values()]
      .filter((p) => p.until > now)
      .map((p) => p.name);
    if (names.length > 0) next.set(roomId, names);
  }
  typingSnapshot = next;
  for (const listener of typingListeners) listener();
}

export function subscribeTyping(listener: () => void) {
  typingListeners.add(listener);
  return () => typingListeners.delete(listener);
}

export function getTypingSnapshot() {
  return typingSnapshot;
}

function onTyping(event: ChatStreamTypingEvent) {
  if (event.userId === viewer) return;
  let people = typing.get(event.roomId);
  if (!people) {
    people = new Map();
    typing.set(event.roomId, people);
  }
  people.set(event.userId, {
    name: event.name,
    until: Date.now() + TYPING_SHOW_MS,
  });
  publishTyping();
  setTimeout(publishTyping, TYPING_SHOW_MS + 50);
}

function stopTyping(roomId: string, userId: string | undefined) {
  if (!userId) return;
  if (typing.get(roomId)?.delete(userId)) publishTyping();
}

// ------------------------------------------------------------------ events
function parse<T>(event: MessageEvent<string>): T | null {
  try {
    return JSON.parse(event.data) as T;
  } catch {
    return null;
  }
}

/**
 * Brings a cached chat up to the numbers the server reported (room list,
 * room detail): a message the stream did not carry still shows up.
 */
export function syncThreadTo(roomId: string, lastEventSeq: number) {
  if (!client) return;
  const thread = client.getQueryData<ChatThread>(chatKeys.messages(roomId));
  if (thread && lastEventSeq > thread.lastEventSeq) void catchUp(roomId);
}

/**
 * Called with every chat list: catches up cached chats that moved on, and
 * reconnects the stream when the list holds a chat it does not carry (a
 * course you joined after the stream opened), so its messages arrive live.
 */
export function syncWithRoomList(
  rooms: ReadonlyArray<{
    id: string;
    lastSeq: number;
    lastEventSeq: number;
    unreadCount: number;
  }>,
) {
  for (const room of rooms) {
    syncThreadTo(room.id, room.lastEventSeq);
    // Your app has these messages now: the senders' second tick.
    if (
      room.unreadCount > 0 &&
      room.lastSeq > (deliveredSent.get(room.id) ?? 0)
    ) {
      deliveredSent.set(room.id, room.lastSeq);
      queueReceipt(room.id, { deliveredSeq: room.lastSeq });
    }
  }
  if (!source || !live) return;
  const missing = rooms.filter(
    (room) => !streamRooms.has(room.id) && !reconnectTried.has(room.id),
  );
  if (missing.length === 0) return;
  if (Date.now() - lastReconnectAt < RECONNECT_GAP_MS) return;
  for (const room of missing) reconnectTried.add(room.id);
  lastReconnectAt = Date.now();
  close();
  open();
}

async function catchUp(roomId: string) {
  if (!client) return;
  const thread = client.getQueryData<ChatThread>(chatKeys.messages(roomId));
  if (!thread) return;
  try {
    const changes = await chatService.changes(roomId, thread.lastEventSeq);
    if (changes.reset) {
      await client.invalidateQueries({ queryKey: chatKeys.messages(roomId) });
      return;
    }
    applyMessages(client, roomId, changes.messages);
  } catch {
    // The next event or reconnect tries again.
  }
}

// ------------------------------------------------------------------ alerts
const SOUND_GAP_MS = 2_000;
let lastSoundAt = 0;
let audio: AudioContext | null = null;

/** A soft two-note chime, made on the spot (no sound file to load). */
function chime() {
  if (Date.now() - lastSoundAt < SOUND_GAP_MS) return;
  lastSoundAt = Date.now();
  try {
    audio ??= new AudioContext();
    const now = audio.currentTime;
    for (const [i, freq] of [880, 1320].entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.08, now + i * 0.09 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.22);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.25);
    }
  } catch {
    // No sound before the page has been interacted with, or no audio.
  }
}

/**
 * Settings › Notifications: a sound and (in the background) a desktop
 * alert for a private message, or an @mention in a group, unless the chat
 * is muted or already on screen.
 */
function alertFor(message: ChatMessage) {
  if (!client || message.kind === "system" || message.sender?.id === viewer) {
    return;
  }
  const list = client.getQueryData<{ rooms: ChatRoomSummary[] }>(
    chatKeys.rooms(),
  );
  const room = list?.rooms.find((r) => r.id === message.roomId);
  if (!room || room.me.notifyLevel === "none") return;
  const mentioned = Boolean(
    viewer && (message.mentions.includes(viewer) || message.mentionAll),
  );
  const wanted =
    room.kind === "direct" ? room.me.notifyLevel === "all" : mentioned;
  if (!wanted) return;
  // Another tab or app in front counts as away, as on WhatsApp Web.
  const away = document.visibilityState === "hidden" || !document.hasFocus();
  if (!away && visibleRooms.has(message.roomId)) return;
  const prefs = getChatPrefs();
  if (prefs.sounds) chime();
  if (away && desktopAlertsOn()) {
    const who = message.sender?.name ?? "Someone";
    const body = prefs.previews
      ? message.body ||
        (message.attachments[0]?.kind === "audio" ? "Voice message" : "Media")
      : "New message";
    const icon = message.sender?.avatarUrl;
    const alert = new Notification(
      room.kind === "direct" ? who : `${who} @ ${room.title}`,
      {
        body,
        // One per chat: a newer message replaces the last one's alert.
        tag: message.roomId,
        ...(icon && /^https?:\/\//.test(icon) ? { icon } : {}),
      },
    );
    alert.onclick = () => {
      window.focus();
      // The chat opens at this message, blinking.
      const path = `/chat/${message.roomId}?seq=${message.seq}`;
      if (openLink) openLink(path);
      else window.location.assign(path);
      alert.close();
    };
  }
}

function onMessage(
  message: ChatMessage | { pointer: true; roomId: string },
  isNew: boolean,
) {
  if (!client) return;
  if ("pointer" in message) {
    void catchUp(message.roomId);
    return;
  }
  const thread = client.getQueryData<ChatThread>(
    chatKeys.messages(message.roomId),
  );
  // A gap: something was missed; fetch it rather than show holes.
  if (thread && isNew && message.seq > thread.lastSeq + 1) {
    void catchUp(message.roomId);
  }
  applyMessages(client, message.roomId, [message]);
  const open =
    visibleRooms.has(message.roomId) && document.visibilityState === "visible";
  applyToRoomList(client, message, { viewerId: viewer, isNew, open });
  if (isNew) {
    alertFor(message);
    stopTyping(message.roomId, message.sender?.id);
    if (message.sender?.id !== viewer) {
      queueReceipt(
        message.roomId,
        open ? { readSeq: message.seq } : { deliveredSeq: message.seq },
      );
    }
  }
  // A chat the list does not know yet (a new private chat): reload the list.
  const list = client.getQueryData<{ rooms: Array<{ id: string }> }>(
    chatKeys.rooms(),
  );
  if (list && !list.rooms.some((r) => r.id === message.roomId)) {
    void client.invalidateQueries({ queryKey: chatKeys.rooms() });
  }
}

function attach(next: EventSource) {
  next.addEventListener("ready", (event) => {
    retryDelay = REFUSED_RETRY_MIN_MS;
    setLive(true);
    const ready = parse<ChatStreamReadyEvent>(event as MessageEvent<string>);
    if (!client || !ready) return;
    streamRooms.clear();
    for (const head of ready.rooms) streamRooms.add(head.id);
    for (const head of ready.rooms) {
      const thread = client.getQueryData<ChatThread>(
        chatKeys.messages(head.id),
      );
      if (!thread) continue;
      if (
        head.lastEventSeq !== thread.lastEventSeq ||
        head.lastSeq < thread.lastSeq
      ) {
        // Numbers went back: a failover lost the newest messages; reload.
        if (head.lastSeq < thread.lastSeq) {
          void client.invalidateQueries({
            queryKey: chatKeys.messages(head.id),
          });
        } else {
          void catchUp(head.id);
        }
      }
    }
    if (readyBefore)
      void client.invalidateQueries({ queryKey: chatKeys.rooms() });
    readyBefore = true;
  });
  next.addEventListener("chat.message", (event) => {
    const data = parse<ChatMessage>(event as MessageEvent<string>);
    if (data) onMessage(data, true);
  });
  next.addEventListener("chat.message_updated", (event) => {
    const data = parse<ChatMessage>(event as MessageEvent<string>);
    if (data) onMessage(data, false);
  });
  next.addEventListener("chat.read", (event) => {
    const data = parse<ChatStreamReadEvent>(event as MessageEvent<string>);
    if (data && client) applyReceipt(client, data, viewer);
  });
  next.addEventListener("chat.group_read", (event) => {
    const data = parse<ChatStreamGroupReadEvent>(event as MessageEvent<string>);
    if (data && client) applyGroupRead(client, data);
  });
  next.addEventListener("chat.presence", (event) => {
    const data = parse<ChatStreamPresenceEvent>(event as MessageEvent<string>);
    if (data && client) applyPresence(client, data);
  });
  next.addEventListener("chat.typing", (event) => {
    const data = parse<ChatStreamTypingEvent>(event as MessageEvent<string>);
    if (data) onTyping(data);
  });
  next.addEventListener("chat.room_updated", (event) => {
    const data = parse<{ roomId: string }>(event as MessageEvent<string>);
    if (!data || !client) return;
    void client.invalidateQueries({ queryKey: chatKeys.room(data.roomId) });
    void client.invalidateQueries({ queryKey: chatKeys.rooms() });
  });
  next.addEventListener("chat.room_added", (event) => {
    const data = parse<{ roomId: string }>(event as MessageEvent<string>);
    if (!data || !client) return;
    streamRooms.add(data.roomId);
    void client.invalidateQueries({ queryKey: chatKeys.rooms() });
    void client.invalidateQueries({ queryKey: chatKeys.room(data.roomId) });
  });
  next.addEventListener("chat.removed", (event) => {
    const data = parse<{ roomId: string }>(event as MessageEvent<string>);
    if (!data || !client) return;
    streamRooms.delete(data.roomId);
    void client.invalidateQueries({ queryKey: chatKeys.rooms() });
    void client.invalidateQueries({ queryKey: chatKeys.room(data.roomId) });
    client.removeQueries({ queryKey: chatKeys.messages(data.roomId) });
  });
  next.addEventListener("resync", () => {
    if (!client) return;
    void client.invalidateQueries({ queryKey: chatKeys.all });
  });
  next.addEventListener("notifications.changed", () => {
    void client?.invalidateQueries({ queryKey: notificationKeys.summary() });
    void client?.invalidateQueries({ queryKey: notificationKeys.lists() });
  });
  next.onerror = () => {
    setLive(false);
    if (next.readyState === EventSource.CLOSED && source === next) {
      source = null;
      clearTimeout(retryTimer);
      // Busy or refused: come back later, with jitter so a deploy does not
      // bring every tab back in the same second.
      const wait = retryDelay + Math.floor(Math.random() * retryDelay);
      retryTimer = setTimeout(() => {
        retryTimer = undefined;
        open();
      }, wait);
      retryDelay = Math.min(retryDelay * 2, REFUSED_RETRY_MAX_MS);
    }
  };
}

function open() {
  if (source || users === 0 || document.visibilityState === "hidden") return;
  source = chatService.openStream();
  attach(source);
}

function close() {
  clearTimeout(retryTimer);
  retryTimer = undefined;
  source?.close();
  source = null;
  setLive(false);
}

function onVisibilityChange() {
  if (document.visibilityState === "hidden") {
    clearTimeout(hiddenTimer);
    hiddenTimer = setTimeout(() => {
      if (!desktopAlertsOn()) close();
    }, HIDDEN_GRACE_MS);
    return;
  }
  clearTimeout(hiddenTimer);
  if (!source) {
    open();
  }
}

/** Joins the tab's chat stream; returns the function that leaves it. */
export function startChatStream(
  queryClient: QueryClient,
  viewerId: string | null,
) {
  if (
    typeof window === "undefined" ||
    typeof window.EventSource === "undefined"
  ) {
    return () => {};
  }
  client = queryClient;
  viewer = viewerId;
  users += 1;
  if (users === 1) {
    document.addEventListener("visibilitychange", onVisibilityChange);
    // Last visit's chats first (instant), then the stream catches them up.
    if (viewerId) {
      void restoreChatCache(queryClient, viewerId);
      stopPersisting = startChatCachePersistence(queryClient, viewerId);
    }
    open();
  }
  let left = false;
  return () => {
    if (left) return;
    left = true;
    users -= 1;
    if (users === 0) {
      stopPersisting?.();
      stopPersisting = undefined;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      clearTimeout(hiddenTimer);
      close();
      readyBefore = false;
      retryDelay = REFUSED_RETRY_MIN_MS;
    }
  };
}
