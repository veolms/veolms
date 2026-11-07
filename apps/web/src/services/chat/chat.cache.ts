import type { QueryClient } from "@tanstack/react-query";
import type {
  ChatMessage,
  ChatRoomDetail,
  ChatRoomSummary,
} from "@veolms/contracts";

import { chatKeys } from "./chat.keys";
import type { ChatMessagePage, ChatRoomList } from "./chat.service";

/**
 * The query cache is the one copy of chat data (AGENTS.md): live events and
 * mutations write into it here, so every screen updates together.
 *
 * A chat's messages are kept as one sorted list (oldest first). Only the
 * newest ~300 stay while the reader is at the bottom (CHAT_ROOM_PLAN §14.4);
 * older pages load again when scrolled to.
 */

export const MESSAGE_CACHE_CAP = 300;

export type ChatThread = ChatMessagePage;

export function upsertMessages(
  thread: ChatThread,
  incoming: readonly ChatMessage[],
): ChatThread {
  if (incoming.length === 0) return thread;
  const bySeq = new Map(thread.messages.map((m) => [m.seq, m]));
  let lastSeq = thread.lastSeq;
  let lastEventSeq = thread.lastEventSeq;
  for (const message of incoming) {
    const current = bySeq.get(message.seq);
    // A failover can reuse a number for a different message: the newer
    // event wins, and an older version never replaces a newer one.
    if (
      !current ||
      current.id !== message.id ||
      message.eventSeq >= current.eventSeq
    ) {
      bySeq.set(message.seq, message);
    }
    lastSeq = Math.max(lastSeq, message.seq);
    lastEventSeq = Math.max(lastEventSeq, message.eventSeq);
  }
  const messages = [...bySeq.values()].sort((a, b) => a.seq - b.seq);
  return { ...thread, messages, lastSeq, lastEventSeq };
}

/** Drops the oldest messages beyond the cap (when the reader is at the bottom). */
export function trimThread(thread: ChatThread): ChatThread {
  if (thread.messages.length <= MESSAGE_CACHE_CAP) return thread;
  return {
    ...thread,
    messages: thread.messages.slice(-MESSAGE_CACHE_CAP),
    hasMoreBefore: true,
  };
}

export function applyMessages(
  client: QueryClient,
  roomId: string,
  incoming: readonly ChatMessage[],
) {
  client.setQueryData<ChatThread>(chatKeys.messages(roomId), (thread) =>
    thread ? upsertMessages(thread, incoming) : thread,
  );
}

function preview(message: ChatMessage): string {
  if (message.body) return message.body.replace(/\s+/g, " ").slice(0, 120);
  const first = message.attachments[0];
  if (!first) return "";
  return first.kind === "audio"
    ? "Voice message"
    : first.kind === "image"
      ? "Photo"
      : first.kind === "video"
        ? "Video"
        : first.name;
}

/**
 * A new or changed message in the chat list: last message, time, unread.
 * Your own messages never count as unread.
 */
export function applyToRoomList(
  client: QueryClient,
  message: ChatMessage,
  options: { viewerId: string | null; isNew: boolean; open: boolean },
) {
  client.setQueryData<ChatRoomList>(chatKeys.rooms(), (list) => {
    if (!list) return list;
    let found = false;
    const rooms = list.rooms.map((room): ChatRoomSummary => {
      if (room.id !== message.roomId) return room;
      found = true;
      const isLatest = message.seq >= (room.lastMessage?.seq ?? 0);
      const mine = message.sender?.id === options.viewerId;
      const unread =
        options.isNew &&
        !mine &&
        !options.open &&
        message.seq > room.me.lastReadSeq
          ? room.unreadCount + 1
          : room.unreadCount;
      return {
        ...room,
        lastSeq: Math.max(room.lastSeq, message.seq),
        lastEventSeq: Math.max(room.lastEventSeq, message.eventSeq),
        lastMessageAt: isLatest ? message.createdAt : room.lastMessageAt,
        lastMessage: isLatest
          ? {
              seq: message.seq,
              senderId: message.sender?.id ?? null,
              senderName: message.sender?.name ?? null,
              preview: message.deleted ? "" : preview(message),
              deleted: message.deleted !== null,
              createdAt: message.createdAt,
            }
          : room.lastMessage,
        unreadCount: unread,
        me:
          mine && options.isNew
            ? { ...room.me, lastReadSeq: message.seq }
            : room.me,
      };
    });
    if (!found) return list;
    rooms.sort((a, b) => {
      if (a.me.pinned !== b.me.pinned) return a.me.pinned ? -1 : 1;
      return (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? "");
    });
    return {
      ...list,
      rooms,
      unreadTotal: rooms
        .filter((r) => !r.me.archived && r.me.notifyLevel !== "none")
        .reduce((sum, r) => sum + r.unreadCount, 0),
    };
  });
}

/** Read / delivered positions (yours: badge; the other person's: ticks). */
export function applyReceipt(
  client: QueryClient,
  receipt: {
    roomId: string;
    userId: string;
    readSeq: number;
    deliveredSeq: number;
  },
  viewerId: string | null,
) {
  // The open chat's ticks.
  if (receipt.userId !== viewerId) {
    client.setQueryData<ChatRoomDetail>(
      chatKeys.room(receipt.roomId),
      (room) =>
        room
          ? {
              ...room,
              // Null: read receipts are off between you (stays hidden).
              peerReadSeq:
                room.peerReadSeq === null
                  ? null
                  : Math.max(room.peerReadSeq, receipt.readSeq),
              peerDeliveredSeq: Math.max(
                room.peerDeliveredSeq ?? 0,
                receipt.deliveredSeq,
              ),
            }
          : room,
    );
  }
  client.setQueryData<ChatRoomList>(chatKeys.rooms(), (list) => {
    if (!list) return list;
    const rooms = list.rooms.map((room) => {
      if (room.id !== receipt.roomId) return room;
      if (receipt.userId === viewerId) {
        const lastReadSeq = Math.max(room.me.lastReadSeq, receipt.readSeq);
        return {
          ...room,
          unreadCount: Math.max(0, room.lastSeq - lastReadSeq),
          me: { ...room.me, lastReadSeq },
        };
      }
      return {
        ...room,
        peerReadSeq:
          room.peerReadSeq === null
            ? null
            : Math.max(room.peerReadSeq, receipt.readSeq),
        peerDeliveredSeq: Math.max(
          room.peerDeliveredSeq ?? 0,
          receipt.deliveredSeq,
        ),
      };
    });
    return {
      ...list,
      rooms,
      unreadTotal: rooms
        .filter((r) => !r.me.archived && r.me.notifyLevel !== "none")
        .reduce((sum, r) => sum + r.unreadCount, 0),
    };
  });
}

/** A group's "everyone has received / read up to" moved: its ticks. */
export function applyGroupRead(
  client: QueryClient,
  event: { roomId: string; deliveredSeq: number; readSeq: number },
) {
  const apply = <
    T extends { peerDeliveredSeq: number | null; peerReadSeq: number | null },
  >(
    room: T,
  ): T => ({
    ...room,
    peerDeliveredSeq: Math.max(room.peerDeliveredSeq ?? 0, event.deliveredSeq),
    peerReadSeq: Math.max(room.peerReadSeq ?? 0, event.readSeq),
  });
  client.setQueryData<ChatRoomDetail>(chatKeys.room(event.roomId), (room) =>
    room ? apply(room) : room,
  );
  client.setQueryData<ChatRoomList>(chatKeys.rooms(), (list) =>
    list
      ? {
          ...list,
          rooms: list.rooms.map((room) =>
            room.id === event.roomId ? apply(room) : room,
          ),
        }
      : list,
  );
}

/** Someone you have a private chat with came online or went away. */
export function applyPresence(
  client: QueryClient,
  event: { userId: string; online: boolean; lastSeenAt: string | null },
) {
  for (const [key, room] of client.getQueriesData<ChatRoomDetail>({
    queryKey: [...chatKeys.all, "room"],
  })) {
    // Null: hidden between you; it stays hidden.
    if (!room || room.peer?.id !== event.userId || !room.peerPresence) continue;
    client.setQueryData<ChatRoomDetail>(key, {
      ...room,
      peerPresence: {
        online: event.online,
        lastSeenAt: event.lastSeenAt ?? room.peerPresence.lastSeenAt,
      },
    });
  }
}

/** Marks a chat read up to `seq` in the list, right away (the server follows). */
export function markRoomRead(client: QueryClient, roomId: string, seq: number) {
  client.setQueryData<ChatRoomList>(chatKeys.rooms(), (list) => {
    if (!list) return list;
    const rooms = list.rooms.map((room) =>
      room.id === roomId && seq > room.me.lastReadSeq
        ? {
            ...room,
            unreadCount: Math.max(0, room.lastSeq - seq),
            me: { ...room.me, lastReadSeq: seq },
          }
        : room,
    );
    return {
      ...list,
      rooms,
      unreadTotal: rooms
        .filter((r) => !r.me.archived && r.me.notifyLevel !== "none")
        .reduce((sum, r) => sum + r.unreadCount, 0),
    };
  });
}
