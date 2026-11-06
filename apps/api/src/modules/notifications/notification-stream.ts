import type { FastifyReply, FastifyRequest } from "fastify";
import pg from "pg";

import { AppError } from "../../lib/errors.ts";
import {
  decodeNotificationSignal,
  NOTIFICATION_SIGNAL_CHANNEL,
} from "./notification-signal.ts";

/**
 * Server-Sent Events for notifications (GET /notifications/stream).
 *
 * The stream carries no notifications, only "yours changed": the browser
 * then refetches the summary and list over REST, which stay the one source
 * of truth. Messages, in the text/event-stream format:
 *
 *   retry: 5000            how long the browser waits before reconnecting
 *   event: ready           sent once the stream is open (refetch now: a
 *   data: {}               change may have happened while disconnected)
 *
 *   event: changed         this user's notifications changed
 *   data: {}
 *
 *   : ping                 a comment every 25 s, so proxies (Cloudflare
 *                          closes idle connections after ~100 s) and phone
 *                          networks keep the connection open
 *
 * A stream ends after about 15 minutes; EventSource reconnects by itself,
 * which also re-checks the session, so a signed-out cookie stops the stream.
 */

const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_MS = 25_000;
const RETRY_MS = 5_000;
const MAX_STREAM_MS = 15 * 60 * 1000;
/** Spreads reconnects so streams opened together do not all return at once. */
const MAX_STREAM_JITTER_MS = 60 * 1000;
/** At most one "changed" a second per stream: a fan-out sends many. */
const CHANGED_THROTTLE_MS = 1_000;

interface HubLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
}

interface StreamSubscriber {
  /** This user's notifications changed (or may have: after a lost signal). */
  changed(): void;
  /** The process is shutting down: end the response. */
  close(): void;
}

export interface NotificationStreamHub {
  /** Starts listening on first use; returns the unsubscribe function. */
  subscribe(userId: string, subscriber: StreamSubscriber): () => void;
  /** Streams this user has open on this process. */
  countFor(userId: string): number;
  /** Whether the LISTEN connection is up. */
  isListening(): boolean;
  stop(): Promise<void>;
}

/**
 * One LISTEN connection per process, opened when the first stream does,
 * shared by every open stream. While it is down signals are missed, so when
 * it comes back every open stream is told to refetch.
 */
export function createNotificationStreamHub({
  connectionString,
  logger,
}: {
  /** A direct (writer) connection string: LISTEN does not work on a replica. */
  connectionString: string;
  logger: HubLogger;
}): NotificationStreamHub {
  const subscribers = new Map<string, Set<StreamSubscriber>>();
  let client: pg.Client | null = null;
  let started = false;
  let listening = false;
  let hasListenedBefore = false;
  let stopped = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let retryDelay = RECONNECT_MIN_MS;

  function notifyUsers(userIds: Iterable<string>) {
    for (const userId of userIds) {
      for (const subscriber of subscribers.get(userId) ?? []) {
        subscriber.changed();
      }
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
      logger.warn(
        { err: error },
        "Notification stream connection lost; reconnecting",
      );
    }
    listening = false;
    const lost = client;
    client = null;
    lost?.removeAllListeners();
    // Keep a late error from the dead connection from being unhandled.
    lost?.on("error", () => {});
    void lost?.end().catch(() => {});
    scheduleReconnect();
  }

  async function connect(): Promise<void> {
    const next = new pg.Client({
      connectionString,
      application_name: "veolms-notification-stream",
      keepAlive: true,
    });
    next.on("error", (error) => onConnectionLost(error));
    next.on("end", () => onConnectionLost());
    next.on("notification", (notification) => {
      if (notification.channel !== NOTIFICATION_SIGNAL_CHANNEL) return;
      const userIds = decodeNotificationSignal(notification.payload);
      if (userIds) notifyUsers(userIds);
    });
    client = next;
    try {
      await next.connect();
      await next.query(`LISTEN ${NOTIFICATION_SIGNAL_CHANNEL}`);
    } catch (error) {
      logger.warn(
        { err: error },
        "Notification stream could not listen; retrying",
      );
      if (client === next) onConnectionLost();
      return;
    }
    if (stopped) {
      await next.end().catch(() => {});
      return;
    }
    listening = true;
    retryDelay = RECONNECT_MIN_MS;
    logger.info(
      { channel: NOTIFICATION_SIGNAL_CHANNEL },
      "Notification stream listening",
    );
    // Signals sent while not listening were missed.
    if (hasListenedBefore) notifyUsers(subscribers.keys());
    hasListenedBefore = true;
  }

  return {
    subscribe(userId, subscriber) {
      if (!started && !stopped) {
        started = true;
        void connect();
      }
      let forUser = subscribers.get(userId);
      if (!forUser) {
        forUser = new Set();
        subscribers.set(userId, forUser);
      }
      forUser.add(subscriber);
      return () => {
        const current = subscribers.get(userId);
        current?.delete(subscriber);
        if (current?.size === 0) subscribers.delete(userId);
      };
    },
    countFor: (userId) => subscribers.get(userId)?.size ?? 0,
    isListening: () => listening,
    async stop() {
      stopped = true;
      listening = false;
      clearTimeout(retryTimer);
      for (const forUser of [...subscribers.values()]) {
        for (const subscriber of [...forUser]) subscriber.close();
      }
      subscribers.clear();
      const current = client;
      client = null;
      current?.removeAllListeners();
      current?.on("error", () => {});
      await current?.end().catch(() => {});
    },
  };
}

/** One message in the text/event-stream format. */
export function formatServerSentEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * GET /notifications/stream for a signed-in user (the auth guards run
 * first, so a missing or expired session gets an ordinary 401).
 */
export function createNotificationStreamHandler({
  hub,
  enabled,
  maxStreamsPerUser,
}: {
  hub: NotificationStreamHub;
  enabled: boolean;
  maxStreamsPerUser: number;
}) {
  return async function streamNotifications(
    request: FastifyRequest,
    reply: FastifyReply,
  ) {
    // EventSource does not retry a non-200 answer, so these leave the tab
    // polling instead of reconnecting in a loop.
    if (!enabled) {
      throw new AppError(
        503,
        "NOTIFICATION_STREAM_DISABLED",
        "Live notification updates are turned off.",
      );
    }
    const userId = request.user!.id;
    if (hub.countFor(userId) >= maxStreamsPerUser) {
      throw new AppError(
        429,
        "NOTIFICATION_STREAM_LIMIT",
        "Too many open notification streams.",
      );
    }

    // Fastify's CORS hook set these on the reply; the raw response written
    // below would otherwise go out without them, and the browser would
    // reject the separately hosted web app's EventSource.
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
      // Tells nginx-style proxies not to buffer the stream.
      "X-Accel-Buffering": "no",
      ...passedHeaders,
    });

    let ended = false;
    let throttleTimer: NodeJS.Timeout | undefined;
    let changedPending = false;
    let lastChangedAt = 0;

    const write = (chunk: string) => {
      if (!ended) response.write(chunk);
    };
    const sendChanged = () => {
      changedPending = false;
      lastChangedAt = Date.now();
      write(formatServerSentEvent("changed", {}));
    };

    const unsubscribe = hub.subscribe(userId, {
      changed() {
        if (ended || changedPending) return;
        const wait = lastChangedAt + CHANGED_THROTTLE_MS - Date.now();
        if (wait <= 0) {
          sendChanged();
          return;
        }
        changedPending = true;
        throttleTimer = setTimeout(sendChanged, wait);
      },
      close: () => end(),
    });

    const heartbeat = setInterval(() => write(": ping\n\n"), HEARTBEAT_MS);
    const lifetime = setTimeout(
      () => end(),
      MAX_STREAM_MS + Math.floor(Math.random() * MAX_STREAM_JITTER_MS),
    );

    function end() {
      if (ended) return;
      ended = true;
      clearInterval(heartbeat);
      clearTimeout(lifetime);
      clearTimeout(throttleTimer);
      unsubscribe();
      response.end();
    }

    // The response's "close" is the client going away (the request's may
    // fire as soon as a GET has been read).
    response.on("close", end);

    write(`retry: ${RETRY_MS}\n\n`);
    write(formatServerSentEvent("ready", {}));
  };
}
