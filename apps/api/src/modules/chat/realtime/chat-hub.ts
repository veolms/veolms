import pg from "pg";

import {
  NOTIFICATION_SIGNAL_CHANNEL,
  decodeNotificationSignal,
} from "../../notifications/notification-signal.ts";
import { CHAT_CHANNEL, decodeChatEvent, peekChatEvent } from "./chat-bus.ts";

/**
 * One per API process: a single LISTEN connection (on the writer: NOTIFY is
 * not replicated) for both chat events and notification signals, and every
 * open chat stream of this process, indexed by chat and by user.
 *
 * Fan-out never queries the database: an event is turned into one buffer
 * and the same buffer is written to every stream of that chat. Events for
 * chats nobody here has open are dropped after a look at their first bytes.
 */

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export interface HubLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
}

export interface ChatStreamConnection {
  readonly id: string;
  readonly userId: string;
  readonly rooms: Set<string>;
  /** Writes one already-formatted event; drops the stream when it is stalled. */
  write(chunk: Buffer | string): void;
  /** Throttled "your notifications changed". */
  notificationsChanged(): void;
  close(): void;
}

export interface RoomHead {
  lastSeq: number;
  lastEventSeq: number;
}

export interface ChatHub {
  add(stream: ChatStreamConnection, heads: ReadonlyMap<string, RoomHead>): void;
  remove(stream: ChatStreamConnection): void;
  /** The newest numbers this process knows for a chat a stream has open. */
  head(roomId: string): RoomHead | undefined;
  countFor(userId: string): number;
  count(): number;
  isListening(): boolean;
  stop(): Promise<void>;
}

export function sse(event: string, data: string): string {
  return `event: ${event}\ndata: ${data}\n\n`;
}

export function createChatHub({
  connectionString,
  logger,
}: {
  connectionString: string;
  logger: HubLogger;
}): ChatHub {
  const streams = new Set<ChatStreamConnection>();
  const byRoom = new Map<string, Set<ChatStreamConnection>>();
  const byUser = new Map<string, Set<ChatStreamConnection>>();
  const heads = new Map<string, RoomHead>();
  let client: pg.Client | null = null;
  let started = false;
  let listening = false;
  let hasListenedBefore = false;
  let stopped = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let retryDelay = RECONNECT_MIN_MS;

  function index<K>(
    map: Map<K, Set<ChatStreamConnection>>,
    key: K,
    stream: ChatStreamConnection,
  ) {
    let set = map.get(key);
    if (!set) {
      set = new Set();
      map.set(key, set);
    }
    set.add(stream);
  }

  function unindex<K>(
    map: Map<K, Set<ChatStreamConnection>>,
    key: K,
    stream: ChatStreamConnection,
  ) {
    const set = map.get(key);
    if (!set) return;
    set.delete(stream);
    if (set.size === 0) map.delete(key);
  }

  function joinRoom(stream: ChatStreamConnection, roomId: string) {
    stream.rooms.add(roomId);
    index(byRoom, roomId, stream);
  }

  function leaveRoom(stream: ChatStreamConnection, roomId: string) {
    stream.rooms.delete(roomId);
    unindex(byRoom, roomId, stream);
    // Heads are kept only for chats someone here has open.
    if (!byRoom.has(roomId)) heads.delete(roomId);
  }

  function bumpHead(roomId: string, seq: number | null, eventSeq: number) {
    const head = heads.get(roomId);
    if (!head) return;
    if (seq !== null && seq > head.lastSeq) head.lastSeq = seq;
    if (eventSeq > head.lastEventSeq) head.lastEventSeq = eventSeq;
  }

  function broadcastRoom(roomId: string, chunk: Buffer, exceptUserId?: string) {
    const set = byRoom.get(roomId);
    if (!set) return;
    for (const stream of [...set]) {
      if (exceptUserId && stream.userId === exceptUserId) continue;
      stream.write(chunk);
    }
  }

  function sendToUser(userId: string, chunk: Buffer) {
    for (const stream of [...(byUser.get(userId) ?? [])]) stream.write(chunk);
  }

  function onChatPayload(payload: string) {
    const peek = peekChatEvent(payload);
    if (!peek) return;
    // Most events concern one chat: stop here when nobody has it open.
    if (peek.kind !== "d" && peek.kind !== "a" && !byRoom.has(peek.roomId)) {
      return;
    }
    const event = decodeChatEvent(payload);
    if (!event) return;
    switch (event.type) {
      case "message":
      case "update": {
        bumpHead(
          event.roomId,
          event.type === "message" ? event.seq : null,
          event.eventSeq,
        );
        const name =
          event.type === "message" ? "chat.message" : "chat.message_updated";
        const data =
          event.json ??
          JSON.stringify({
            roomId: event.roomId,
            seq: event.seq,
            eventSeq: event.eventSeq,
            pointer: true,
          });
        broadcastRoom(event.roomId, Buffer.from(sse(name, data)));
        return;
      }
      case "typing":
        broadcastRoom(
          event.roomId,
          Buffer.from(
            sse(
              "chat.typing",
              JSON.stringify({
                roomId: event.roomId,
                userId: event.userId,
                name: event.name,
              }),
            ),
          ),
          event.userId,
        );
        return;
      case "room":
        bumpHead(event.roomId, null, event.eventSeq);
        broadcastRoom(
          event.roomId,
          Buffer.from(
            sse(
              "chat.room_updated",
              JSON.stringify({
                roomId: event.roomId,
                eventSeq: event.eventSeq,
              }),
            ),
          ),
        );
        return;
      case "added": {
        const chunk = Buffer.from(
          sse("chat.room_added", JSON.stringify({ roomId: event.roomId })),
        );
        for (const userId of event.userIds) {
          for (const stream of [...(byUser.get(userId) ?? [])]) {
            if (!stream.rooms.has(event.roomId)) joinRoom(stream, event.roomId);
            stream.write(chunk);
          }
        }
        return;
      }
      case "removed": {
        const chunk = Buffer.from(
          sse("chat.removed", JSON.stringify({ roomId: event.roomId })),
        );
        for (const userId of event.userIds) {
          for (const stream of [...(byUser.get(userId) ?? [])]) {
            if (stream.rooms.has(event.roomId)) {
              leaveRoom(stream, event.roomId);
              stream.write(chunk);
            }
          }
        }
        return;
      }
      case "receipts": {
        for (const receipt of event.receipts) {
          const chunk = Buffer.from(
            sse(
              "chat.read",
              JSON.stringify({
                roomId: receipt.roomId,
                userId: receipt.userId,
                readSeq: receipt.readSeq,
                deliveredSeq: receipt.deliveredSeq,
              }),
            ),
          );
          // Their own tabs (badges), and in a private chat the other person
          // ("Seen" ticks). Never the whole of a group.
          sendToUser(receipt.userId, chunk);
          if (receipt.direct)
            broadcastRoom(receipt.roomId, chunk, receipt.userId);
        }
        return;
      }
    }
  }

  function onNotificationPayload(payload: string | undefined) {
    const userIds = decodeNotificationSignal(payload);
    if (!userIds) return;
    for (const userId of userIds) {
      for (const stream of byUser.get(userId) ?? [])
        stream.notificationsChanged();
    }
  }

  function resyncAll() {
    const chunk = Buffer.from(sse("resync", "{}"));
    for (const stream of [...streams]) {
      stream.write(chunk);
      stream.notificationsChanged();
    }
  }

  function scheduleReconnect(): void {
    if (stopped || retryTimer) return;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, retryDelay);
    retryTimer.unref();
    retryDelay = Math.min(retryDelay * 2, RECONNECT_MAX_MS);
  }

  function onConnectionLost(error?: unknown): void {
    if (stopped) return;
    if (listening) {
      logger.warn({ err: error }, "Chat stream connection lost; reconnecting");
    }
    listening = false;
    const lost = client;
    client = null;
    lost?.removeAllListeners();
    lost?.on("error", () => {});
    void lost?.end().catch(() => {});
    scheduleReconnect();
  }

  async function connect(): Promise<void> {
    const next = new pg.Client({
      connectionString,
      application_name: "veolms-chat-stream",
      keepAlive: true,
    });
    next.on("error", (error) => onConnectionLost(error));
    next.on("end", () => onConnectionLost());
    next.on("notification", (notification) => {
      try {
        if (notification.channel === CHAT_CHANNEL) {
          if (notification.payload) onChatPayload(notification.payload);
        } else if (notification.channel === NOTIFICATION_SIGNAL_CHANNEL) {
          onNotificationPayload(notification.payload);
        }
      } catch (error) {
        logger.warn({ err: error }, "Chat stream event could not be delivered");
      }
    });
    client = next;
    try {
      await next.connect();
      await next.query(`LISTEN ${CHAT_CHANNEL}`);
      await next.query(`LISTEN ${NOTIFICATION_SIGNAL_CHANNEL}`);
    } catch (error) {
      logger.warn({ err: error }, "Chat stream could not listen; retrying");
      if (client === next) onConnectionLost();
      return;
    }
    if (stopped) {
      await next.end().catch(() => {});
      return;
    }
    listening = true;
    retryDelay = RECONNECT_MIN_MS;
    logger.info({ channel: CHAT_CHANNEL }, "Chat stream listening");
    // Events sent while not listening were missed: every client catches up.
    if (hasListenedBefore) resyncAll();
    hasListenedBefore = true;
  }

  return {
    add(stream, roomHeads) {
      if (!started && !stopped) {
        started = true;
        void connect();
      }
      streams.add(stream);
      index(byUser, stream.userId, stream);
      for (const [roomId, head] of roomHeads) {
        joinRoom(stream, roomId);
        const known = heads.get(roomId);
        if (!known) {
          heads.set(roomId, { ...head });
        } else {
          known.lastSeq = Math.max(known.lastSeq, head.lastSeq);
          known.lastEventSeq = Math.max(known.lastEventSeq, head.lastEventSeq);
        }
      }
    },
    remove(stream) {
      if (!streams.delete(stream)) return;
      unindex(byUser, stream.userId, stream);
      for (const roomId of [...stream.rooms]) leaveRoom(stream, roomId);
    },
    head: (roomId) => heads.get(roomId),
    countFor: (userId) => byUser.get(userId)?.size ?? 0,
    count: () => streams.size,
    isListening: () => listening,
    async stop() {
      stopped = true;
      listening = false;
      clearTimeout(retryTimer);
      for (const stream of [...streams]) stream.close();
      streams.clear();
      byRoom.clear();
      byUser.clear();
      heads.clear();
      const current = client;
      client = null;
      current?.removeAllListeners();
      current?.on("error", () => {});
      await current?.end().catch(() => {});
    },
  };
}
