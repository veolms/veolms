import type { Database } from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import { config } from "../../../config.ts";
import { createChatHub, type ChatHub } from "../realtime/chat-hub.ts";
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
}

const runtimes = new WeakMap<Kysely<Database>, ChatRuntime>();

export function getChatRuntime(
  app: FastifyInstance,
  database: Kysely<Database>,
): ChatRuntime {
  const existing = runtimes.get(database);
  if (existing) return existing;

  const repository = createChatRepository();
  const runtime: ChatRuntime = {
    database,
    repository,
    access: createChatAccess(repository),
    // DATABASE_URL is the writer on every server: LISTEN does not work on a
    // replica. The connection opens with the first stream.
    hub: createChatHub({
      connectionString: config.DATABASE_URL,
      logger: app.log,
    }),
    receipts: createReceiptsBatcher({ database, repository, logger: app.log }),
    updates: createUpdateCoalescer(app.log),
  };
  runtimes.set(database, runtime);
  app.addHook("onClose", async () => {
    runtimes.delete(database);
    runtime.updates.stop();
    await runtime.receipts.stop();
    await runtime.hub.stop();
  });
  return runtime;
}
