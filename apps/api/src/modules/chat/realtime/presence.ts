import type { DatabaseExecutor as Executor } from "@veolms/database";

import type { ChatRepository } from "../shared/chat.repository.ts";
import { encodeChatEvent } from "./chat-bus.ts";
import type { ChatHub } from "./chat-hub.ts";

/**
 * "online" and "last seen" for private chats (WhatsApp).
 *
 * Someone is online while they have Chats open in a tab: their first
 * stream in a process marks them online and tells their private chats;
 * every minute one UPDATE keeps everyone connected here online for the next
 * 90 seconds; their last stream closing marks them away (last seen now).
 * Another process may still hold a tab of theirs: its next beat puts them
 * back online in the database, and a chat header asks again now and then.
 *
 * Nothing is announced for people who hide their presence.
 */

const BEAT_MS = 60_000;
const ONLINE_SECONDS = 90;
const BEAT_CHUNK = 1_000;

export interface PresenceTracker {
  stop(): void;
}

export function createPresenceTracker({
  database,
  repository,
  hub,
  logger,
}: {
  database: Executor;
  repository: ChatRepository;
  hub: ChatHub;
  logger: { warn(object: object, message: string): void };
}): PresenceTracker {
  async function announce(userId: string, online: boolean) {
    const [profile] = await repository.getProfiles(database, [userId]);
    if (profile && !profile.show_presence) return;
    const roomIds = await repository.listDirectRoomIds(database, userId);
    if (roomIds.length === 0) return;
    await repository.publish(
      database,
      encodeChatEvent({
        type: "presence",
        userId,
        online,
        lastSeenAt: online ? null : Date.now(),
        roomIds,
      }),
    );
  }

  function report(error: unknown) {
    logger.warn({ err: error }, "Chat presence could not be saved");
  }

  hub.setPresenceHooks({
    online(userId) {
      void repository
        .markOnline(database, [userId], ONLINE_SECONDS)
        .then(() => announce(userId, true))
        .catch(report);
    },
    away(userId) {
      void repository
        .markAway(database, userId)
        .then(() => announce(userId, false))
        .catch(report);
    },
  });

  const timer = setInterval(() => {
    const userIds = hub.userIds();
    void (async () => {
      for (let i = 0; i < userIds.length; i += BEAT_CHUNK) {
        await repository.markOnline(
          database,
          userIds.slice(i, i + BEAT_CHUNK),
          ONLINE_SECONDS,
        );
      }
    })().catch(report);
  }, BEAT_MS);
  timer.unref();

  return {
    stop() {
      clearInterval(timer);
      hub.setPresenceHooks({ online() {}, away() {} });
    },
  };
}
