import type { ChatStreamReadyEvent } from "@veolms/contracts";
import type { FastifyReply, FastifyRequest } from "fastify";

import { ChatErrors } from "../shared/chat.errors.ts";
import {
  sse,
  type ChatHub,
  type ChatStreamConnection,
  type RoomHead,
} from "./chat-hub.ts";

/**
 * GET /chat/stream: Server-Sent Events for chat (and notification badges),
 * one per browser tab (CHAT_ROOM_PLAN.md §5.1, §14.3–14.4).
 *
 * - Stays open while the tab is visible (the client closes it 2 minutes
 *   after the tab is hidden); ends after ~6 h so connections rebalance.
 * - The session is checked again every 5 minutes: a signed-out or revoked
 *   session ends the stream.
 * - A stream whose unsent data passes 256 KB (a stalled phone) is dropped;
 *   the client reconnects and catches up.
 * - `retry:` tells the browser how long to wait before reconnecting; the
 *   client adds its own jitter (1–5 s after a network drop, 5–20 s when the
 *   server is busy).
 */

const HEARTBEAT_MS = 25_000;
const RETRY_MS = 3_000;
const BUSY_RETRY_SECONDS = 15;
const MAX_STREAM_MS = 6 * 60 * 60 * 1000;
const MAX_STREAM_JITTER_MS = 30 * 60 * 1000;
const SESSION_CHECK_MS = 5 * 60 * 1000;
const MAX_BUFFERED_BYTES = 256 * 1024;
const NOTIFICATIONS_THROTTLE_MS = 1_000;

export function createChatStreamHandler({
  hub,
  enabled,
  maxStreamsPerUser,
  maxStreamsPerProcess,
  loadRooms,
  stillSignedIn,
}: {
  hub: ChatHub;
  enabled: () => boolean;
  maxStreamsPerUser: number;
  maxStreamsPerProcess: number;
  /** The person's chats and their newest numbers. */
  loadRooms: (userId: string) => Promise<Array<{ id: string } & RoomHead>>;
  stillSignedIn: (request: FastifyRequest) => Promise<boolean>;
}) {
  return async function streamChat(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // EventSource does not retry a non-200 answer: the web app falls back to
    // polling and tries the stream again later.
    if (!enabled()) throw ChatErrors.streamDisabled();
    const userId = request.user!.id;
    if (hub.countFor(userId) >= maxStreamsPerUser)
      throw ChatErrors.streamLimit();
    if (hub.count() >= maxStreamsPerProcess) {
      reply.header("Retry-After", String(BUSY_RETRY_SECONDS));
      throw ChatErrors.streamBusy();
    }

    const rooms = await loadRooms(userId);
    const heads = new Map<string, RoomHead>(
      rooms.map((room) => [
        room.id,
        { lastSeq: room.lastSeq, lastEventSeq: room.lastEventSeq },
      ]),
    );

    // Fastify's CORS hook set these on the reply; the raw response below
    // would otherwise go out without them.
    const passedHeaders: Record<string, string> = {};
    for (const name of [
      "Access-Control-Allow-Origin",
      "Access-Control-Allow-Credentials",
      "Vary",
    ]) {
      const value = reply.getHeader(name);
      if (typeof value === "string") passedHeaders[name] = value;
    }
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
      ...passedHeaders,
    });

    let ended = false;
    let notifyTimer: NodeJS.Timeout | undefined;
    let notifyPending = false;
    let lastNotifyAt = 0;

    function end() {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      clearInterval(sessionCheck);
      clearTimeout(lifetime);
      clearTimeout(notifyTimer);
      hub.remove(stream);
      response.end();
    }

    function write(chunk: Buffer | string) {
      if (ended) return;
      if (response.writableLength > MAX_BUFFERED_BYTES) {
        // A stalled client: drop it rather than hold its backlog in memory.
        ended = true;
        clearInterval(heartbeat);
        clearInterval(sessionCheck);
        clearTimeout(lifetime);
        clearTimeout(notifyTimer);
        hub.remove(stream);
        response.destroy();
        return;
      }
      response.write(chunk);
    }

    const sendNotifications = () => {
      notifyPending = false;
      lastNotifyAt = Date.now();
      write(sse("notifications.changed", "{}"));
    };

    const stream: ChatStreamConnection = {
      id: crypto.randomUUID(),
      userId,
      rooms: new Set(),
      write,
      notificationsChanged() {
        if (ended || notifyPending) return;
        const wait = lastNotifyAt + NOTIFICATIONS_THROTTLE_MS - Date.now();
        if (wait <= 0) {
          sendNotifications();
          return;
        }
        notifyPending = true;
        notifyTimer = setTimeout(sendNotifications, wait);
      },
      close: () => end(),
    };

    const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    const lifetime = setTimeout(
      () => end(),
      MAX_STREAM_MS + Math.floor(Math.random() * MAX_STREAM_JITTER_MS),
    );
    const sessionCheck = setInterval(() => {
      void stillSignedIn(request)
        .then((ok) => {
          if (!ok) end();
        })
        .catch(() => {
          // Can't tell right now (database busy): keep the stream.
        });
    }, SESSION_CHECK_MS);
    response.on("close", end);

    hub.add(stream, heads);
    const ready: ChatStreamReadyEvent = {
      connectionId: stream.id,
      serverTime: new Date().toISOString(),
      // Newest numbers this process knows (fresher than the query above
      // when an event arrived in between).
      rooms: rooms.map((room) => {
        const head = hub.head(room.id) ?? room;
        return {
          id: room.id,
          lastSeq: head.lastSeq,
          lastEventSeq: head.lastEventSeq,
        };
      }),
    };
    write(`retry: ${RETRY_MS}\n\n`);
    write(sse("ready", JSON.stringify(ready)));
  };
}
