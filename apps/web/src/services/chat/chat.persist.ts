import type { QueryClient } from "@tanstack/react-query";
import type { ChatRoomDetail } from "@veolms/contracts";

import {
  chatCacheGet,
  chatCacheGetMany,
  chatCacheSetMany,
} from "../../lib/chatCacheDb";
import type { ChatThread } from "./chat.cache";
import { chatKeys } from "./chat.keys";
import type { ChatRoomList } from "./chat.service";

/**
 * Chats open at once, like WhatsApp: the chat list, each chat's header and
 * its latest messages are kept in this browser (IndexedDB, under the
 * account) and put back on the next visit before the network answers.
 * Nothing kept is trusted as current: the list is refetched, and each chat
 * catches up from its change number (`syncWithRoomList`), so a kept copy is
 * only ever a head start.
 *
 * Bounded: the latest 60 messages of the 30 chats opened most recently.
 */

const KEPT_MESSAGES = 60;
const KEPT_CHATS = 30;
const WRITE_DELAY_MS = 800;

interface Kept<T> {
  value: T;
  savedAt: number;
}

const key = (userId: string, ...parts: string[]) =>
  [userId, ...parts].join("|");

let restoredFor: string | null = null;

/** Puts the kept copies in the query cache (never over fresher data). */
export async function restoreChatCache(client: QueryClient, userId: string) {
  if (restoredFor === userId) return;
  restoredFor = userId;
  const [rooms, order] = await Promise.all([
    chatCacheGet<Kept<ChatRoomList>>(key(userId, "rooms")),
    chatCacheGet<string[]>(key(userId, "order")),
  ]);
  if (rooms && !client.getQueryData(chatKeys.rooms())) {
    client.setQueryData(chatKeys.rooms(), rooms.value, {
      updatedAt: rooms.savedAt,
    });
  }
  const ids = (order ?? []).slice(0, KEPT_CHATS);
  const [threads, details] = await Promise.all([
    chatCacheGetMany<Kept<ChatThread>>(
      ids.map((id) => key(userId, "thread", id)),
    ),
    chatCacheGetMany<Kept<ChatRoomDetail>>(
      ids.map((id) => key(userId, "room", id)),
    ),
  ]);
  ids.forEach((id, index) => {
    const thread = threads[index];
    if (thread && !client.getQueryData(chatKeys.messages(id))) {
      client.setQueryData(chatKeys.messages(id), thread.value, {
        updatedAt: thread.savedAt,
      });
    }
    const detail = details[index];
    if (detail && !client.getQueryData(chatKeys.room(id))) {
      client.setQueryData(chatKeys.room(id), detail.value, {
        updatedAt: detail.savedAt,
      });
    }
  });
}

/** The latest messages only: older ones load from the server on scroll. */
function trimmed(thread: ChatThread): ChatThread {
  if (thread.messages.length <= KEPT_MESSAGES) return thread;
  return {
    ...thread,
    messages: thread.messages.slice(-KEPT_MESSAGES),
    hasMoreBefore: true,
  };
}

/**
 * Saves chat answers as they change, a moment after the last change (so a
 * busy group writes once, not per message). Returns the unsubscribe.
 */
export function startChatCachePersistence(
  client: QueryClient,
  userId: string,
): () => void {
  const dirty = new Map<string, () => readonly [string, unknown] | null>();
  let order: string[] | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  void chatCacheGet<string[]>(key(userId, "order")).then((saved) => {
    order ??= saved ?? [];
  });

  function touch(roomId: string) {
    order = [roomId, ...(order ?? []).filter((id) => id !== roomId)];
  }

  function flush() {
    timer = undefined;
    const entries: Array<readonly [string, unknown]> = [];
    for (const read of dirty.values()) {
      const entry = read();
      if (entry) entries.push(entry);
    }
    dirty.clear();
    const kept = (order ?? []).slice(0, KEPT_CHATS);
    const dropped = (order ?? []).slice(KEPT_CHATS);
    order = kept;
    entries.push([key(userId, "order"), kept]);
    void chatCacheSetMany(
      entries,
      dropped.flatMap((id) => [
        key(userId, "thread", id),
        key(userId, "room", id),
      ]),
    );
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(flush, WRITE_DELAY_MS);
  }

  const unsubscribe = client.getQueryCache().subscribe((event) => {
    if (event.type !== "updated" || event.action.type !== "success") return;
    const queryKey = event.query.queryKey as readonly unknown[];
    if (queryKey[0] !== "chat") return;
    const kind = queryKey[1];
    const id = typeof queryKey[2] === "string" ? queryKey[2] : null;
    const savedAt = event.query.state.dataUpdatedAt || Date.now();
    if (kind === "rooms") {
      dirty.set("rooms", () => {
        const value = client.getQueryData<ChatRoomList>(chatKeys.rooms());
        return value ? [key(userId, "rooms"), { value, savedAt }] : null;
      });
    } else if (kind === "messages" && id) {
      touch(id);
      dirty.set(`thread:${id}`, () => {
        const value = client.getQueryData<ChatThread>(chatKeys.messages(id));
        return value
          ? [key(userId, "thread", id), { value: trimmed(value), savedAt }]
          : null;
      });
    } else if (kind === "room" && id) {
      touch(id);
      dirty.set(`room:${id}`, () => {
        const value = client.getQueryData<ChatRoomDetail>(chatKeys.room(id));
        return value ? [key(userId, "room", id), { value, savedAt }] : null;
      });
    } else {
      return;
    }
    schedule();
  });

  return () => {
    unsubscribe();
    if (timer) flush();
  };
}
