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

/** Short, so the second and blue ticks follow within about a second. */
const FLUSH_MS = 1_000;
const MAX_PENDING = 20_000;
/** Groups up to this size keep when each member received and read. */
const MARKED_GROUP_MAX = 1_024;
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
  receiptsOff = async (_db, profiles) =>
    new Set(profiles.filter((p) => !p.read_receipts).map((p) => p.user_id)),
  onReadAdvanced,
  logger,
}: {
  database: Executor;
  repository: ChatRepository;
  /** Whose read receipts are off (chat.access: staff only). */
  receiptsOff?: (
    db: Executor,
    profiles: readonly { user_id: string; read_receipts: boolean }[],
  ) => Promise<Set<string>>;
  /**
   * Read positions that moved, once written: the one place every way of
   * reading a chat ends up (push action tokens go stale, phones clear the
   * chat's notification). A failure here loses only that clean-up.
   */
  onReadAdvanced?: (
    reads: { userId: string; roomId: string; readSeq: number }[],
  ) => Promise<void>;
  logger: { warn(object: object, message: string): void };
}): ReceiptsBatcher {
  let pending = new Map<string, Pending>();
  let flushing: Promise<void> | null = null;
  let stopped = false;
  const timer = setInterval(() => void flush(), FLUSH_MS);
  timer.unref();

  async function flushOnce(batch: Pending[]) {
    for (let i = 0; i < batch.length; i += FLUSH_CHUNK) {
      const chunk = batch.slice(i, i + FLUSH_CHUNK);
      const rows = await repository.flushReceipts(database, chunk);
      if (rows.length === 0) continue;
      const members = await publishGroups(
        rows.filter((row) => row.kind !== "direct").map((row) => row.room_id),
      );

      // When each position moved, for Message info's times: private chats
      // and groups up to MARKED_GROUP_MAX members (WhatsApp's group size).
      await repository.insertReceiptMarks(
        database,
        rows.filter(
          (row) =>
            row.kind === "direct" ||
            (members.get(row.room_id) ?? Infinity) <= MARKED_GROUP_MAX,
        ),
      );

      // Read receipts off (Settings › Privacy): in private chats the other
      // person learns only that it arrived.
      const directUsers = [
        ...new Set(
          rows.filter((row) => row.kind === "direct").map((row) => row.user_id),
        ),
      ];
      const hidden = await receiptsOff(
        database,
        await repository.getProfiles(database, directUsers),
      );
      // Only "delivered" moved in a group: nobody's own tabs need it (it
      // changes no unread count); the group's ticks went out above.
      const readMoved = new Set(
        chunk
          .filter((entry) => entry.readSeq > 0)
          .map((entry) => `${entry.roomId}|${entry.userId}`),
      );
      const told = rows.filter(
        (row) =>
          row.kind === "direct" ||
          readMoved.has(`${row.room_id}|${row.user_id}`),
      );
      if (onReadAdvanced) {
        const reads = rows
          .filter((row) => readMoved.has(`${row.room_id}|${row.user_id}`))
          .map((row) => ({
            userId: row.user_id,
            roomId: row.room_id,
            readSeq: Number(row.last_read_seq),
          }));
        if (reads.length > 0) {
          await onReadAdvanced(reads).catch((error: unknown) =>
            logger.warn({ err: error }, "Chat read clean-up failed"),
          );
        }
      }
      if (told.length === 0) continue;
      await repository.publish(
        database,
        encodeChatEvent({
          type: "receipts",
          receipts: told.map((row) => ({
            roomId: row.room_id,
            userId: row.user_id,
            readSeq: Number(row.last_read_seq),
            deliveredSeq: Number(row.last_delivered_seq),
            // A request not accepted yet tells the sender nothing.
            direct: row.kind === "direct" && row.direct_status !== "requested",
            hideRead: row.kind === "direct" && hidden.has(row.user_id),
          })),
        }),
      );
    }
  }

  /** Last group positions announced, so only moves are sent. */
  const announced = new Map<string, string>();

  /**
   * Groups whose read positions moved: their "everyone has received / read
   * up to" (the ticks), to everyone in the group, only when it changed.
   */
  async function publishGroups(roomIds: string[]) {
    const members = new Map<string, number>();
    const unique = [...new Set(roomIds)];
    if (unique.length === 0) return members;
    const positions = await repository.groupPositions(database, unique);
    const payloads: string[] = [];
    for (const group of positions) {
      members.set(group.room_id, Number(group.members));
      if (Number(group.members) < 2) continue;
      const key = `${group.delivered}|${group.read}`;
      if (announced.get(group.room_id) === key) continue;
      announced.set(group.room_id, key);
      payloads.push(
        ...encodeChatEvent({
          type: "group_read",
          roomId: group.room_id,
          deliveredSeq: Number(group.delivered),
          readSeq: Number(group.read),
        }),
      );
    }
    if (announced.size > 50_000) announced.clear();
    if (payloads.length > 0) await repository.publish(database, payloads);
    return members;
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
