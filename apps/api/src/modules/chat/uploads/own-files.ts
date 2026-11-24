import type { Database } from "@veolms/database";
import type { FastifyInstance } from "fastify";
import type { Kysely } from "kysely";

import { createMessagesService } from "../messages/messages.service.ts";
import { getChatRuntime } from "../shared/chat.runtime.ts";

/**
 * A learner's own chat files, for the Storage module's "Delete files": the
 * messages stay and show "This file was deleted" (see
 * `MessagesService.removeOwnFiles`).
 */
export function createChatOwnFiles(
  app: FastifyInstance,
  database: Kysely<Database>,
) {
  const messages = createMessagesService(getChatRuntime(app, database));
  return {
    remove: (userId: string, uploadIds: readonly string[]) =>
      messages.removeOwnFiles(userId, uploadIds),
  };
}
