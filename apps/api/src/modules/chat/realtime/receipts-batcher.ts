import type { DatabaseExecutor as Executor } from "@veolms/database";

import type { ChatRepository } from "../shared/chat.repository.ts";
import { encodeChatEvent } from "./chat-bus.ts";

/**
 * Read and delivered positions, written in batches (CHAT_ROOM_PLAN.md
 * §14.5): thousands of "I read up to N" a second become one UPDATE per
 * process every few seconds, and one NOTIFY carries the resulting
 * `chat.read` events (own tabs; the other person in a private chat).
 *
 * A crash loses at most one interval of positions: unread counts come back
 * slightly high, which is harmless.
 */

const FLUSH_MS = 3_000;
const MAX_PENDING = 20_000;
const FLUSH_CHUNK = 1_000;

interface Pending {
  roomId: string;
  userId: string;
  readSeq: number;
  deliveredSeq: number;
}

export interface ReceiptsBatcher {
  add(entry: Pending): void;
  flush(): Promise<void>;
  stop(): Promise<void>;
}

export function createReceiptsBatcher({
  database,
  repository,
  logger,
}: {
  database: Executor;
  repository: ChatRepository;
  logger: { warn(object: object, message: string): void };
}): ReceiptsBatcher {
  let pending = new Map<string, Pending>();
  let flushing: Promise<void> | null = null;
  let stopped = false;
  const timer = setInterval(() => void flush(), FLUSH_MS);
  timer.unref();

  async function flushOnce(batch: Pending[]) {
    for (let i = 0; i < batch.length; i += FLUSH_CHUNK) {
      const rows = await repository.flushReceipts(
        database,
        batch.slice(i, i + FLUSH_CHUNK),
      );
      if (rows.length === 0) continue;
      await repository.publish(
        database,
        encodeChatEvent({
          type: "receipts",
          receipts: rows.map((row) => ({
            roomId: row.room_id,
            userId: row.user_id,
            readSeq: Number(row.last_read_seq),
            deliveredSeq: Number(row.last_delivered_seq),
            direct: row.kind === "direct",
          })),
        }),
      );
    }
  }

  async function flush(): Promise<void> {
    if (flushing) return flushing;
    if (pending.size === 0) return;
    const batch = [...pending.values()];
    pending = new Map();
    flushing = flushOnce(batch)
      .catch((error: unknown) => {
        logger.warn(
          { err: error, receipts: batch.length },
          "Chat read positions could not be saved; keeping them for the next try",
        );
        // Put them back unless newer ones arrived meanwhile.
        for (const entry of batch) merge(entry);
      })
      .finally(() => {
        flushing = null;
      });
    return flushing;
  }

  function merge(entry: Pending) {
    const key = `${entry.roomId}|${entry.userId}`;
    const current = pending.get(key);
    if (current) {
      current.readSeq = Math.max(current.readSeq, entry.readSeq);
      current.deliveredSeq = Math.max(current.deliveredSeq, entry.deliveredSeq);
    } else if (pending.size < MAX_PENDING) {
      pending.set(key, { ...entry });
    }
  }

  return {
    add(entry) {
      if (stopped) return;
      merge(entry);
    },
    flush,
    async stop() {
      stopped = true;
      clearInterval(timer);
      await flushing;
      await flush();
    },
  };
}
