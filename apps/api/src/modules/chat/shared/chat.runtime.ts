import type { Database } from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { createChatHub, type ChatHub } from "../realtime/chat-hub.ts";
import {
  createPresenceTracker,
  type PresenceTracker,
} from "../realtime/presence.ts";
import {
  createReceiptsBatcher,
  type ReceiptsBatcher,
} from "../realtime/receipts-batcher.ts";
import {
  createUpdateCoalescer,
  type UpdateCoalescer,
} from "../realtime/update-coalescer.ts";
import { createChatAccess, type ChatAccess } from "./chat.access.ts";
import {
  createChatRepository,
  type ChatRepository,
} from "./chat.repository.ts";

/**
 * The pieces every chat route plugin shares within one process: the
 * repository, access rules, the stream hub (one LISTEN connection), the
 * read-position batcher and the reaction coalescer. Made once per database
 * (one per app), shut down with the app.
 */
export interface ChatRuntime {
  database: Kysely<Database>;
  repository: ChatRepository;
  access: ChatAccess;
  hub: ChatHub;
  receipts: ReceiptsBatcher;
  updates: UpdateCoalescer;
  presence: PresenceTracker;
}

const runtimes = new WeakMap<Kysely<Database>, ChatRuntime>();

export function getChatRuntime(
  app: FastifyInstance,
  database: Kysely<Database>,
): ChatRuntime {
  const existing = runtimes.get(database);
  if (existing) return existing;

  const repository = createChatRepository();
  // DATABASE_URL is the writer on every server: LISTEN does not work on a
  // replica. The connection opens with the first stream.
  const hub = createChatHub({
    connectionString: config.DATABASE_URL,
    logger: app.log,
  });
  const runtime: ChatRuntime = {
    database,
    repository,
    access: createChatAccess(repository),
    hub,
    receipts: createReceiptsBatcher({
      database,
      repository,
      receiptsOff: (db, profiles) => runtime.access.receiptsOff(db, profiles),
      logger: app.log,
    }),
    updates: createUpdateCoalescer(app.log),
    presence: createPresenceTracker({
      database,
      repository,
      hub,
      logger: app.log,
    }),
  };
  // A new message pushed to someone's open app counts as delivered.
  hub.setDeliveryHook((roomId, userId, seq) =>
    runtime.receipts.add({ roomId, userId, readSeq: 0, deliveredSeq: seq }),
  );
  runtimes.set(database, runtime);
  app.addHook("onClose", async () => {
    runtimes.delete(database);
    runtime.updates.stop();
    runtime.presence.stop();
    await runtime.receipts.stop();
    await runtime.hub.stop();
  });
  return runtime;
}
