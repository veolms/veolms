import { randomUUID } from "node:crypto";
import os from "node:os";

import { sql, type Kysely } from "kysely";
import pg from "pg";

import {
  applyCacheInvalidation,
  clearAllCaches,
  setCacheBroadcaster,
} from "./registry.ts";

/**
 * Tells every API process when cached data changes, over Postgres
 * LISTEN/NOTIFY: each process keeps one connection listening on
 * `CACHE_INVALIDATION_CHANNEL`, and `invalidateCache` publishes the tags it
 * cleared locally through the ordinary pool. Any number of processes, on
 * any number of hosts sharing the database, stay in step within
 * milliseconds; entry TTLs remain the bound if a message is lost.
 *
 * A process that loses its listening connection may miss messages, so each
 * time it (re)connects it clears all of its caches.
 *
 * Needs a direct connection (or a session-mode pooler): LISTEN does not
 * work through a transaction-mode pooler. Past a few dozen processes, the
 * same interface can be carried by Redis pub/sub instead; the caches do not
 * change.
 */
export const CACHE_INVALIDATION_CHANNEL = "veolms_cache";

/** NOTIFY payloads are limited to 8000 bytes; tags are split below this. */
const MAX_PAYLOAD_BYTES = 7_500;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

interface InvalidationMessage {
  /** Format version. */
  v: 1;
  /** The process that sent it, which ignores its own messages. */
  o: string;
  t: string[];
}

/** One NOTIFY payload per chunk of tags that fits the limit. */
export function encodeInvalidation(
  origin: string,
  tags: readonly string[],
): string[] {
  const payloads: string[] = [];
  let chunk: string[] = [];
  const encode = (chunkTags: string[]) =>
    JSON.stringify({ v: 1, o: origin, t: chunkTags } as InvalidationMessage);
  for (const tag of tags) {
    if (Buffer.byteLength(encode([...chunk, tag])) > MAX_PAYLOAD_BYTES) {
      if (chunk.length > 0) payloads.push(encode(chunk));
      chunk = [];
    }
    chunk.push(tag);
  }
  if (chunk.length > 0) payloads.push(encode(chunk));
  return payloads;
}

export function decodeInvalidation(
  payload: string | undefined,
): InvalidationMessage | null {
  if (!payload) return null;
  try {
    const message = JSON.parse(payload) as Partial<InvalidationMessage>;
    if (
      message.v === 1 &&
      typeof message.o === "string" &&
      Array.isArray(message.t) &&
      message.t.every((tag) => typeof tag === "string")
    ) {
      return message as InvalidationMessage;
    }
  } catch {
    // Not ours, or corrupted: ignored.
  }
  return null;
}

/**
 * Tells every listening API process to clear `tags`, from a process that
 * does not run the bus itself (the CLI, a one-shot job). Inside an API
 * process use `invalidateCache`, which also clears the local caches.
 */
export async function publishCacheInvalidation<DB>(
  database: Kysely<DB>,
  tags: readonly string[],
  origin = `${os.hostname()}:${process.pid}:publisher`,
): Promise<void> {
  for (const payload of encodeInvalidation(origin, tags)) {
    await sql`select pg_notify(${CACHE_INVALIDATION_CHANNEL}, ${payload})`.execute(
      database,
    );
  }
}

interface BusLogger {
  info(object: object, message: string): void;
  warn(object: object, message: string): void;
  error(object: object, message: string): void;
}

export interface CacheBus {
  /** Whether the listening connection is up. */
  isListening(): boolean;
  stop(): Promise<void>;
}

export interface StartCacheBusOptions<DB> {
  /** A direct connection string; the bus opens its own connection. */
  connectionString: string;
  /** The process's pool, which publishes. */
  database: Kysely<DB>;
  logger: BusLogger;
}

/**
 * Listens for other processes' invalidations and publishes this process's.
 * Never throws: while the database cannot be reached it retries with
 * backoff, and the caches fall back to their TTLs.
 */
export function startCacheBus<DB>({
  connectionString,
  database,
  logger,
}: StartCacheBusOptions<DB>): CacheBus {
  const origin = `${os.hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;
  let client: pg.Client | null = null;
  let listening = false;
  let stopped = false;
  let retryTimer: NodeJS.Timeout | undefined;
  let retryDelay = RECONNECT_MIN_MS;

  setCacheBroadcaster((tags) => {
    publishCacheInvalidation(database, tags, origin).catch((error: unknown) => {
      logger.error(
        { err: error, tags },
        "Could not tell other processes to clear their caches",
      );
    });
  });

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
      logger.warn({ err: error }, "Cache bus connection lost; reconnecting");
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
      application_name: "veolms-cache-bus",
      keepAlive: true,
    });
    next.on("error", (error) => onConnectionLost(error));
    next.on("end", () => onConnectionLost());
    next.on("notification", (notification) => {
      if (notification.channel !== CACHE_INVALIDATION_CHANNEL) return;
      const message = decodeInvalidation(notification.payload);
      if (message && message.o !== origin) applyCacheInvalidation(message.t);
    });
    client = next;
    try {
      await next.connect();
      await next.query(`LISTEN ${CACHE_INVALIDATION_CHANNEL}`);
    } catch (error) {
      logger.warn({ err: error }, "Cache bus could not connect; retrying");
      if (client === next) onConnectionLost();
      return;
    }
    if (stopped) {
      await next.end().catch(() => {});
      return;
    }
    // Messages sent while not listening were missed.
    clearAllCaches();
    listening = true;
    retryDelay = RECONNECT_MIN_MS;
    logger.info({ channel: CACHE_INVALIDATION_CHANNEL }, "Cache bus listening");
  }

  void connect();

  return {
    isListening: () => listening,
    async stop() {
      stopped = true;
      listening = false;
      clearTimeout(retryTimer);
      setCacheBroadcaster(null);
      const current = client;
      client = null;
      current?.removeAllListeners();
      current?.on("error", () => {});
      await current?.end().catch(() => {});
    },
  };
}
